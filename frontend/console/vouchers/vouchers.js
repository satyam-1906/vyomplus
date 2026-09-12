const API_BASE = 'https://vyomplus.onrender.com';

// Live vouchers cache – populated from the API
let vouchers = [];
let extractedRecords = [];
let editingVoucherId = null;
let ocrTriggered = false;

const statusColor = { verified: '#10B981', pending: '#F59E0B', cleared: '#2563EB' };
const tbody = document.getElementById('voucher-tbody');

// Metric card element references (matched by order in the HTML grid)
const metricCards = document.querySelectorAll('.glass-card');

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */
function formatCurrency(num) {
    return '\u20B9' + Number(num).toLocaleString('en-IN');
}

function normaliseType(raw) {
    raw = (raw || '').trim().toLowerCase();
    const map = { sales: 'Sales', purchase: 'Purchase', journal: 'Journal', payment: 'Payment', receipt: 'Receipt' };
    return map[raw] || 'Sales';
}

function normaliseStatus(raw) {
    raw = (raw || '').trim().toLowerCase();
    const map = { pending: 'pending', verified: 'verified', cleared: 'cleared' };
    return map[raw] || 'pending';
}

function toInputDate(raw) {
    if (!raw || raw === 'NA') return new Date().toISOString().slice(0, 10);
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return new Date().toISOString().slice(0, 10);
}

/** Pretty-print a stored date string for display in the table */
function displayDate(raw) {
    if (!raw) return 'â€”';
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return raw; // already formatted
}

/* ------------------------------------------------------------------ */
/*  Metrics                                                             */
/* ------------------------------------------------------------------ */
function updateMetrics() {
    const total    = vouchers.length;
    const purchase = vouchers.filter(v => v.voucher_type.toLowerCase() === 'purchase').length;
    const sales    = vouchers.filter(v => v.voucher_type.toLowerCase() === 'sales').length;
    const pending  = vouchers.filter(v => v.status.toLowerCase() === 'pending').length;

    // The four stat cards are the first 4 .glass-card elements in the page
    const cards = document.querySelectorAll('.console-content > div:first-child .glass-card');
    if (cards.length >= 4) {
        cards[0].querySelector('div:nth-child(2)').textContent = total.toLocaleString('en-IN');
        cards[1].querySelector('div:nth-child(2)').textContent = purchase.toLocaleString('en-IN');
        cards[2].querySelector('div:nth-child(2)').textContent = sales.toLocaleString('en-IN');
        cards[3].querySelector('div:nth-child(2)').textContent = pending.toLocaleString('en-IN');
        // update pending card colour
        cards[3].querySelector('div:nth-child(2)').style.color = pending > 0 ? '#F59E0B' : '#f8fafc';
    }
}

/* ------------------------------------------------------------------ */
/*  Render table                                                        */
/* ------------------------------------------------------------------ */
function renderVouchers() {
    tbody.innerHTML = '';

    const query      = (document.getElementById('search-input')?.value ?? '').toLowerCase().trim();
    const typeFilter = document.getElementById('filter-type')?.value ?? 'All Types';

    const filtered = vouchers.filter(function(v) {
        const matchesType  = typeFilter === 'All Types' || v.voucher_type.toLowerCase() === typeFilter.toLowerCase();
        const searchTarget = (v.voucher_no + v.party + v.amount + v.gst_amount).toLowerCase();
        return matchesType && searchTarget.includes(query);
    });

    if (filtered.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="8" style="padding:24px;text-align:center;color:var(--color-text-muted);">No vouchers found.</td>';
        tbody.appendChild(tr);
        return;
    }

    filtered.forEach(function(v) {
        const recordId = v.id || v.voucher_no;
        const tr = document.createElement('tr');
        tr.className = 'voucher-row';
        tr.style.cssText = 'border-bottom:1px solid var(--color-border);transition:background .2s;';
        tr.onmouseenter = function() { tr.style.background = 'rgba(118,159,205,0.07)'; };
        tr.onmouseleave = function() { tr.style.background = ''; };
        tr.innerHTML =
            '<td style="padding:14px 20px;color:#2563EB;font-weight:600;font-family:monospace;">' +
                '<span class="expansion-chevron" id="chevron-' + recordId + '" style="margin-right:8px;"><i class="ti ti-chevron-right"></i></span>' +
                v.voucher_no +
            '</td>' +
            '<td style="padding:14px 20px;color:var(--color-text-secondary);">' + displayDate(v.date) + '</td>' +
            '<td style="padding:14px 20px;"><span style="background:rgba(37,99,235,.1);color:#2563EB;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:600;">' + v.voucher_type + '</span></td>' +
            '<td style="padding:14px 20px;color:var(--color-text-primary);">' + v.party + '</td>' +
            '<td style="padding:14px 20px;text-align:right;font-weight:700;color:var(--color-text-primary);">' + formatCurrency(v.amount) + '</td>' +
            '<td style="padding:14px 20px;text-align:right;color:var(--color-text-secondary);">' + formatCurrency(v.gst_amount) + '</td>' +
            '<td style="padding:14px 20px;"><span style="color:' + (statusColor[v.status.toLowerCase()] || '#94a3b8') + ';font-weight:600;font-size:12px;text-transform:capitalize;">' + v.status + '</span></td>' +
            '<td style="padding:14px 20px;text-align:right;position:relative;">' +
                '<button class="action-btn" style="background:none;border:none;color:var(--color-text-secondary);cursor:pointer;font-size:16px;padding:4px;" onclick="event.stopPropagation(); toggleDropdown(event, \'' + recordId + '\')"><i class="ti ti-dots-vertical"></i></button>' +
                '<div class="action-dropdown" id="dropdown-' + recordId + '">' +
                    '<div class="action-dropdown-item" onclick="event.stopPropagation(); triggerEditVoucher(\'' + recordId + '\')"><i class="ti ti-edit"></i> Edit</div>' +
                    '<div class="action-dropdown-item remove" onclick="event.stopPropagation(); triggerRemoveVoucher(\'' + recordId + '\')"><i class="ti ti-trash"></i> Remove</div>' +
                '</div>' +
            '</td>';

        const detailTr = document.createElement('tr');
        detailTr.id = 'details-' + recordId;
        detailTr.className = 'detail-row';
        detailTr.style.display = 'none';

        let itemsHtml = '';
        if (Array.isArray(v.items) && v.items.length > 0) {
            itemsHtml = v.items.map(item => {
                const itemName = item.item_name || item.name || item.itemName || 'Item';
                const qty = item.qty !== undefined ? item.qty : (item.quantity || 1);
                const rate = item.rate !== undefined ? item.rate : (item.price || 0);
                const godownCell = item.godown
                    ? `<td style="color:#2563EB;padding:8px 12px;text-align:left;">${item.godown}</td>`
                    : `<td style="color:var(--color-text-muted);padding:8px 12px;text-align:left;">—</td>`;
                return `
                    <tr>
                        <td style="color:var(--color-text-secondary);padding:8px 12px;text-align:left;">${itemName}</td>
                        ${godownCell}
                        <td style="color:var(--color-text-secondary);padding:8px 12px;text-align:right;">${qty}</td>
                        <td style="color:var(--color-text-secondary);padding:8px 12px;text-align:right;">${formatCurrency(rate)}</td>
                        <td style="color:var(--color-text-primary);padding:8px 12px;text-align:right;font-weight:600;">${formatCurrency(qty * rate)}</td>
                    </tr>
                `;
            }).join('');
        } else {
            itemsHtml = '<tr><td colspan="4" style="color:var(--color-text-muted);text-align:center;padding:16px;">No items found in this voucher.</td></tr>';
        }

        const discountAmount = parseFloat(v.discount) || 0;
        const discountText = discountAmount > 0 ? `Discount Applied: ${formatCurrency(discountAmount)}` : 'No discount applied';

        detailTr.innerHTML = `
            <td colspan="8" style="padding:0;">
                <div class="detail-wrapper">
                    <div class="detail-content" style="background: rgba(15, 23, 42, 0.45); border-left: 3px solid #2563EB; border-radius: 4px; padding: 16px 20px;">
                        <div style="font-weight: 700; color: var(--color-text-primary); margin-bottom: 8px; font-size: 13px;">Voucher Itemization</div>
                        <table class="detail-items-table" style="width:100%; border-collapse: collapse; font-size: 12px; color: var(--color-text-primary);">
                            <thead>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.08); text-align: left;">
                                    <th style="text-align:left;color:var(--color-text-muted);padding:6px 12px;font-size:11px;">Item Description</th>
                                    <th style="text-align:left;color:var(--color-text-muted);padding:6px 12px;font-size:11px;">Godown</th>
                                    <th style="text-align:right;color:var(--color-text-muted);padding:6px 12px;font-size:11px;width:80px;">Qty</th>
                                    <th style="text-align:right;color:var(--color-text-muted);padding:6px 12px;font-size:11px;width:120px;">Rate</th>
                                    <th style="text-align:right;color:var(--color-text-muted);padding:6px 12px;font-size:11px;width:120px;">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHtml}
                            </tbody>
                        </table>
                        <div class="detail-discount" style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.08); font-size:12px;">
                            <span style="color:var(--color-text-muted);">* Prices are exclusive of GST</span>
                            <span style="font-weight:700; color:#10B981; font-size:13px;">${discountText}</span>
                        </div>
                    </div>
                </div>
            </td>
        `;

        tr.addEventListener('click', function(e) {
            if (e.target.closest('.action-btn') || e.target.closest('.action-dropdown')) return;
            const isClosed = !detailTr.classList.contains('open');
            const chevron = document.getElementById('chevron-' + recordId);
            
            if (isClosed) {
                detailTr.style.display = 'table-row';
                // Trigger layout reflow to ensure the transition runs
                detailTr.offsetHeight;
                detailTr.classList.add('open');
                if (chevron) chevron.style.transform = 'rotate(90deg)';
            } else {
                detailTr.classList.remove('open');
                if (chevron) chevron.style.transform = 'rotate(0deg)';
                // Wait for CSS transition (0.35s / 350ms) to complete before setting display to none
                setTimeout(() => {
                    if (!detailTr.classList.contains('open')) {
                        detailTr.style.display = 'none';
                    }
                }, 350);
            }
        });

        tbody.appendChild(tr);
        tbody.appendChild(detailTr);
    });
}

/* ------------------------------------------------------------------ */
/*  Fetch vouchers from the API on load                                 */
/* ------------------------------------------------------------------ */
async function loadVouchers() {
    tbody.innerHTML = '<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--color-text-muted);">Loading vouchers…</td></tr>';
    try {
        const res = await fetch(API_BASE + '/vouchers');
        if (!res.ok) throw new Error('Server returned ' + res.status);
        const data = await res.json();
        vouchers = Array.isArray(data) ? data : [];
    } catch (err) {
        console.error('[Vouchers] Load failed:', err);
        tbody.innerHTML = '<tr><td colspan="8" style="padding:24px;text-align:center;color:#f87171;">Failed to load vouchers. Is the backend running?</td></tr>';
        return;
    }
    renderVouchers();
    updateMetrics();
}

loadVouchers();
document.getElementById('search-input').addEventListener('input', renderVouchers);
document.getElementById('filter-type').addEventListener('change', renderVouchers);

/* ------------------------------------------------------------------ */
/*  Item row helpers for VoucherSchema alignment                      */
/* ------------------------------------------------------------------ */
function addItemRow(item = { item_name: '', qty: 1, rate: 0 }) {
    const container = document.getElementById('items-container');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'item-row';
    row.style.cssText = 'display: flex; gap: 8px; align-items: center;';
    row.innerHTML = `
        <input type="text" class="v-item-name" placeholder="Item Name" value="${item.item_name || ''}" style="flex: 2; background: var(--color-bg-input); border: 1px solid var(--color-border); border-radius: 8px; padding: 6px 10px; font-size: 12px; color: var(--color-text-primary); outline: none;">
        <input type="number" class="v-item-qty" placeholder="Qty" min="1" value="${item.qty !== undefined ? item.qty : 1}" style="flex: 1; min-width: 60px; background: var(--color-bg-input); border: 1px solid var(--color-border); border-radius: 8px; padding: 6px 10px; font-size: 12px; color: var(--color-text-primary); outline: none;">
        <input type="number" class="v-item-rate" placeholder="Rate" min="0" step="0.01" value="${item.rate !== undefined ? item.rate : 0}" style="flex: 1; min-width: 70px; background: var(--color-bg-input); border: 1px solid var(--color-border); border-radius: 8px; padding: 6px 10px; font-size: 12px; color: var(--color-text-primary); outline: none;">
        <button type="button" class="remove-item-btn" style="background: rgba(248, 113, 113, 0.15); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.3); border-radius: 6px; padding: 6px 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;"><i class="ti ti-trash"></i></button>
    `;
    row.querySelector('.remove-item-btn').addEventListener('click', () => {
        row.remove();
    });
    container.appendChild(row);
}

function getItemsFromForm() {
    const container = document.getElementById('items-container');
    if (!container) return [];
    const rows = container.querySelectorAll('.item-row');
    const items = [];
    rows.forEach(row => {
        const name = row.querySelector('.v-item-name')?.value?.trim() || 'Item';
        const qty = parseInt(row.querySelector('.v-item-qty')?.value, 10) || 1;
        const rate = parseFloat(row.querySelector('.v-item-rate')?.value) || 0;
        items.push({ item_name: name, qty: qty, rate: rate });
    });
    return items;
}

function setItemsInForm(items) {
    const container = document.getElementById('items-container');
    if (!container) return;
    container.innerHTML = '';
    if (Array.isArray(items) && items.length > 0) {
        items.forEach(i => addItemRow({
            item_name: i.item_name || i.name || i.itemName || '',
            qty: i.qty !== undefined ? i.qty : (i.quantity || 1),
            rate: i.rate !== undefined ? i.rate : (i.price || 0)
        }));
    } else {
        addItemRow();
    }
}

document.getElementById('add-item-btn')?.addEventListener('click', () => addItemRow());

/* ------------------------------------------------------------------ */
/*  Modal open / close                                                  */
/* ------------------------------------------------------------------ */
const newVoucherBtn  = document.getElementById('new-voucher-btn');
const modalOverlay   = document.getElementById('new-voucher-modal');
const modalCloseBtn  = document.getElementById('modal-close-btn');
const btnModalCancel = document.getElementById('btn-modal-cancel');
const newVoucherForm = document.getElementById('new-voucher-form');

document.getElementById('v-date').valueAsDate = new Date();

function openModal(record = null) {
    modalOverlay.classList.add('show');
    const modalTitle = modalOverlay.querySelector('.modal-header h3');
    const submitBtn = modalOverlay.querySelector('.btn-modal-submit');
    const manualFields = document.getElementById('manual-fields-container');
    const ocrSection = document.getElementById('ocr-section-container');
    const checkboxContainer = document.getElementById('ocr-checkbox-container');
    const multipleRecordsCheckbox = document.getElementById('v-multiple-records');
    const requiredInputs = document.querySelectorAll('#manual-fields-container [data-required]');

    if (record) {
        editingVoucherId = record.id || record.voucher_no;
        if (modalTitle) modalTitle.innerHTML = '<i class="ti ti-receipt-2"></i> Edit Voucher Entry';
        if (submitBtn) submitBtn.textContent = 'Save Changes';

        if (manualFields) manualFields.style.display = 'block';
        if (ocrSection) ocrSection.style.display = 'none';
        if (checkboxContainer) checkboxContainer.style.display = 'none';
        requiredInputs.forEach(input => input.setAttribute('required', ''));

        // Prefill fields
        document.getElementById('v-type').value = record.voucher_type || 'Sales';
        document.getElementById('v-date').value = toInputDate(record.date);
        document.getElementById('v-no').value = record.voucher_no || '';
        document.getElementById('v-party').value = record.party || '';
        document.getElementById('v-amount').value = record.amount || '';
        document.getElementById('v-gst').value = record.gst_amount || '';
        document.getElementById('v-discount').value = (record.discount !== undefined && record.discount !== null) ? record.discount : 0;
        document.getElementById('v-status').value = record.status || 'pending';
        setItemsInForm(record.items);
    } else {
        editingVoucherId = null;
        ocrTriggered = false;
        if (modalTitle) modalTitle.innerHTML = '<i class="ti ti-receipt-2"></i> Add Voucher';
        if (submitBtn) submitBtn.textContent = 'Create Voucher';

        if (ocrSection) ocrSection.style.display = 'block';
        if (checkboxContainer) checkboxContainer.style.display = 'flex';
        
        if (multipleRecordsCheckbox) {
            multipleRecordsCheckbox.checked = false;
        }
        if (manualFields) manualFields.style.display = 'block';
        requiredInputs.forEach(input => input.setAttribute('required', ''));

        newVoucherForm.reset();
        document.getElementById('v-date').valueAsDate = new Date();
        document.getElementById('v-discount').value = 0;
        setItemsInForm([]);
        extractedRecords = [];
        renderOCRRecordsPreview();
    }
}

function closeModal() {
    modalOverlay.classList.remove('show');
    newVoucherForm.reset();
    editingVoucherId = null;
    extractedRecords = [];
    renderOCRRecordsPreview();
    resetOCRState();
}

newVoucherBtn.addEventListener('click', () => openModal(null));
modalCloseBtn.addEventListener('click', closeModal);
btnModalCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', function(e) {
    if (e.target === modalOverlay) closeModal();
});

const multipleRecordsCheckbox = document.getElementById('v-multiple-records');
if (multipleRecordsCheckbox) {
    multipleRecordsCheckbox.addEventListener('change', function() {
        const manualFields = document.getElementById('manual-fields-container');
        const preview = document.getElementById('ocr-records-preview');
        const requiredInputs = document.querySelectorAll('#manual-fields-container [data-required]');
        if (this.checked) {
            if (manualFields) manualFields.style.display = 'none';
            if (preview) preview.style.display = extractedRecords.length > 0 ? 'flex' : 'none';
            requiredInputs.forEach(input => input.removeAttribute('required'));
        } else {
            if (manualFields) manualFields.style.display = 'block';
            if (preview) preview.style.display = 'none';
            requiredInputs.forEach(input => input.setAttribute('required', ''));
        }
    });
}

/* ------------------------------------------------------------------ */
/*  OCR â€“ element references                                            */
/* ------------------------------------------------------------------ */
const ocrDropArea      = document.getElementById('ocr-drop-area');
const ocrFileInput     = document.getElementById('ocr-file-input');
const ocrUploadTrigger = document.getElementById('ocr-upload-trigger');
const ocrDropTitle     = document.getElementById('ocr-drop-title');
const ocrDropDesc      = document.getElementById('ocr-drop-desc');
const ocrFileInfo      = document.getElementById('ocr-file-info');
const ocrFilename      = document.getElementById('ocr-filename');
const ocrLoader        = document.getElementById('ocr-loader');

// "Upload File" button triggers hidden file input
ocrUploadTrigger.addEventListener('click', function(e) {
    e.stopPropagation();
    ocrFileInput.click();
});

// Clicking the drop area (outside the button) also opens file picker
ocrDropArea.addEventListener('click', function(e) {
    if (e.target !== ocrUploadTrigger && !ocrUploadTrigger.contains(e.target)) {
        ocrFileInput.click();
    }
});

// File selected via picker
ocrFileInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        handleOCRFile(e.target.files[0]);
    }
});

// Drag highlight
['dragenter', 'dragover'].forEach(function(evt) {
    ocrDropArea.addEventListener(evt, function(e) {
        e.preventDefault();
        e.stopPropagation();
        ocrDropArea.classList.add('dragover');
    }, false);
});

['dragleave', 'drop'].forEach(function(evt) {
    ocrDropArea.addEventListener(evt, function(e) {
        e.preventDefault();
        e.stopPropagation();
        ocrDropArea.classList.remove('dragover');
    }, false);
});

// Drop event
ocrDropArea.addEventListener('drop', function(e) {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleOCRFile(files[0]);
    }
});

function resetOCRState() {
    ocrDropTitle.style.display = 'block';
    ocrDropDesc.style.display  = 'block';
    ocrDropDesc.textContent    = 'Supports PDF, PNG, JPG (Max 10MB)';
    ocrDropDesc.style.color    = '#64748b';
    ocrFileInfo.style.display  = 'none';
    ocrLoader.style.display    = 'none';
    ocrFileInput.value         = '';
    extractedRecords           = [];
    ocrTriggered               = false;
}

function renderOCRRecordsPreview() {
    const preview = document.getElementById('ocr-records-preview');
    if (!preview) return;
    
    if (extractedRecords.length === 0) {
        preview.style.display = 'none';
        preview.innerHTML = '';
        return;
    }
    
    preview.style.display = 'flex';
    preview.innerHTML = '<div style="font-size: 11px; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Extracted Records Preview</div>';
    
    extractedRecords.forEach(rec => {
        const dateStr = displayDate(rec.date || rec.voucher_date);
        const partyStr = rec.party || 'Unknown Party';
        const amountStr = formatCurrency(rec.amount || 0);
        
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(15, 23, 42, 0.4); border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.05);';
        row.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 2px;">
                <span style="font-weight: 600; color: var(--color-text-primary); font-size: 13px;">${partyStr}</span>
                <span style="color: var(--color-text-muted); font-size: 11px;">${dateStr}</span>
            </div>
            <span style="font-weight: 700; color: var(--color-text-primary); font-size: 13px;">${amountStr}</span>
        `;
        preview.appendChild(row);
    });
}

function showOCRLoader() {
    ocrDropTitle.style.display = 'none';
    ocrDropDesc.style.display  = 'none';
    ocrFileInfo.style.display  = 'none';
    ocrLoader.style.display    = 'flex';
}

function showOCRSuccess(filename) {
    ocrLoader.style.display   = 'none';
    ocrFileInfo.style.display = 'flex';
    ocrFilename.textContent   = filename;
}

function showOCRError(msg) {
    ocrLoader.style.display    = 'none';
    ocrDropTitle.style.display = 'block';
    ocrDropDesc.style.display  = 'block';
    ocrDropDesc.textContent    = '\u26a0 ' + msg;
    ocrDropDesc.style.color    = '#f87171';
}

/* ------------------------------------------------------------------ */
/*  OCR â€“ read file as binary stream â†’ POST /extract_ocr               */
/* ------------------------------------------------------------------ */
async function handleOCRFile(file) {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) {
        showOCRError('Unsupported file type. Please upload PDF, JPG or PNG.');
        return;
    }

    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
        showOCRError('File exceeds 10 MB limit. Please use a smaller file.');
        return;
    }

    showOCRLoader();

    try {
        const arrayBuffer = await file.arrayBuffer();
        
        const response = await fetch(API_BASE + '/extract-OCR', {
            method: 'POST',
            headers: { 'Content-Type': file.type, 'Schema': 'voucher' },
            body: arrayBuffer,
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error('Server error ' + response.status + ': ' + errText);
        }

        const raw = await response.json();
        let reportList = null;

        if (raw && Array.isArray(raw.reports)) {
            reportList = raw;
        } else if (raw && typeof raw.text === 'string') {
            reportList = JSON.parse(raw.text);
        } else if (raw && raw.candidates && raw.candidates.length > 0) {
            const textContent =
                raw.candidates[0] &&
                raw.candidates[0].content &&
                raw.candidates[0].content.parts &&
                raw.candidates[0].content.parts[0] &&
                raw.candidates[0].content.parts[0].text;
            if (!textContent) throw new Error('No text content found in OCR response.');
            reportList = JSON.parse(textContent);
        } else {
            throw new Error('Unexpected response shape from /extract_ocr endpoint.');
        }

        const reports = reportList && reportList.reports;
        if (!reports || reports.length === 0) {
            throw new Error('OCR returned no data. Try a clearer or higher-quality document.');
        }

        ocrTriggered = true;
        const isMultiple = document.getElementById('v-multiple-records')?.checked;
        if (isMultiple) {
            extractedRecords = reports;
            showOCRSuccess(file.name + ' (' + reports.length + ' records loaded)');
            renderOCRRecordsPreview();
            
            // Show preview box if hidden
            const preview = document.getElementById('ocr-records-preview');
            if (preview) preview.style.display = 'flex';
        } else {
            extractedRecords = [];
            autofillForm(reports[0]);
            showOCRSuccess(file.name);
        }

    } catch (err) {
        console.error('[OCR] Error:', err);
        showOCRError(err.message || 'OCR processing failed. Please try again.');
    }
}

/* ------------------------------------------------------------------ */
/*  Autofill form fields from an ExtractionSchema record               */
/* ------------------------------------------------------------------ */
function autofillForm(record) {
    const typeEl     = document.getElementById('v-type');
    const dateEl     = document.getElementById('v-date');
    const noEl       = document.getElementById('v-no');
    const partyEl    = document.getElementById('v-party');
    const amountEl   = document.getElementById('v-amount');
    const gstEl      = document.getElementById('v-gst');
    const discountEl = document.getElementById('v-discount');
    const statusEl   = document.getElementById('v-status');

    typeEl.value     = normaliseType(record.voucher_type);
    dateEl.value     = toInputDate(record.date);
    noEl.value       = (record.voucher_no && record.voucher_no !== 'NA') ? record.voucher_no : '';
    partyEl.value    = (record.party && record.party !== 'NA') ? record.party : '';
    amountEl.value   = (record.amount  !== undefined && record.amount  !== 0) ? record.amount  : '';
    gstEl.value      = (record.gst_amount !== undefined && record.gst_amount !== 0) ? record.gst_amount : '';
    if (discountEl) discountEl.value = (record.discount !== undefined && record.discount !== 'None' && record.discount !== null) ? record.discount : 0;
    statusEl.value   = normaliseStatus(record.status);
    setItemsInForm(record.items);

    var fields = [typeEl, dateEl, noEl, partyEl, amountEl, gstEl, discountEl, statusEl].filter(Boolean);
    fields.forEach(function(el) {
        el.style.transition  = 'box-shadow 0.3s ease, border-color 0.3s ease';
        el.style.borderColor = '#10B981';
        el.style.boxShadow   = '0 0 0 2px rgba(16, 185, 129, 0.3)';
        setTimeout(function() {
            el.style.borderColor = '';
            el.style.boxShadow   = '';
        }, 2000);
    });
}

function buildPayloadFromForm() {
    let items = getItemsFromForm();
    if (!items || items.length === 0) {
        items = [{ item_name: 'General Item', qty: 1, rate: parseFloat(document.getElementById('v-amount').value) || 0 }];
    }
    const discountVal = parseFloat(document.getElementById('v-discount')?.value) || 0;
    return {
        voucher_type: document.getElementById('v-type').value,
        date:         document.getElementById('v-date').value,
        voucher_no:   document.getElementById('v-no').value,
        party:        document.getElementById('v-party').value,
        items:        items,
        amount:       parseFloat(document.getElementById('v-amount').value) || 0,
        gst_amount:   parseFloat(document.getElementById('v-gst').value) || 0,
        discount:     discountVal,
        status:       document.getElementById('v-status').value,
    };
}

function buildPayload(rec) {
    let items = [];
    if (Array.isArray(rec.items) && rec.items.length > 0) {
        items = rec.items.map(i => ({
            item_name: String(i.item_name || i.name || i.itemName || 'Item'),
            qty: parseInt(i.qty !== undefined ? i.qty : (i.quantity || 1), 10) || 1,
            rate: parseFloat(i.rate !== undefined ? i.rate : (i.price || 0)) || 0
        }));
    } else {
        items = [{ item_name: 'General Item', qty: 1, rate: (rec.amount !== undefined) ? parseFloat(rec.amount) : 0 }];
    }

    let disc = 0;
    if (rec.discount !== undefined && rec.discount !== "None" && rec.discount !== null) {
        disc = typeof rec.discount === 'number' ? rec.discount : (parseFloat(rec.discount) || 0);
    }

    return {
        voucher_type: normaliseType(rec.voucher_type),
        date:         toInputDate(rec.date),
        voucher_no:   (rec.voucher_no && rec.voucher_no !== 'NA') ? rec.voucher_no : ('VCH-' + Date.now()),
        party:        (rec.party && rec.party !== 'NA') ? rec.party : 'NA',
        items:        items,
        amount:       (rec.amount !== undefined) ? parseFloat(rec.amount) : 0,
        gst_amount:   (rec.gst_amount !== undefined) ? parseFloat(rec.gst_amount) : 0,
        discount:     disc,
        status:       normaliseStatus(rec.status),
    };
}

/* ------------------------------------------------------------------ */
/*  Form submission → POST /add-voucher → refresh table                 */
/* ------------------------------------------------------------------ */
newVoucherForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    const submitBtn = newVoucherForm.querySelector('.btn-modal-submit');
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Saving…';

    if (editingVoucherId !== null) {
        const payload = buildPayloadFromForm();

        try {
            const res = await fetch(API_BASE + '/vouchers/' + editingVoucherId, {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(payload),
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error('Server error ' + res.status + ': ' + errText);
            }

            const saved = await res.json();
            const idx = vouchers.findIndex(v => (v.id || v.voucher_no) == editingVoucherId);
            if (idx !== -1) {
                vouchers[idx] = saved;
            }

            renderVouchers();
            updateMetrics();
            closeModal();
        } catch (err) {
            console.error('[EditVoucher] Error:', err);
            notify('Failed to update voucher: ' + (err.message || 'Unknown error'), 'error');
        } finally {
            submitBtn.disabled    = false;
            submitBtn.textContent = 'Create Voucher';
        }
        return;
    }

    const isMultiple = document.getElementById('v-multiple-records')?.checked;

    if (isMultiple) {
        if (extractedRecords.length === 0) {
            showToast('Please upload a document for OCR first.', 'warning');
            submitBtn.disabled    = false;
            submitBtn.textContent = 'Create Voucher';
            return;
        }

        try {
            const response = await fetch(API_BASE + '/upload-to-AWS', {
                method: 'POST',
                headers: { 'Schema': 'voucher' }
            });
            
            if (!response.ok) {
                const errText = await response.text();
                throw new Error('Server error ' + response.status + ': ' + errText);
            }

            const payloads = extractedRecords.map(buildPayload);
            const res = await fetch(API_BASE + '/add-voucher', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(payloads),
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error('Server error ' + res.status + ': ' + errText);
            }

            const savedList = await res.json();
            if (Array.isArray(savedList)) {
                savedList.forEach(saved => vouchers.unshift(saved));
            }

            renderVouchers();
            updateMetrics();
            closeModal();

        } catch (err) {
            console.error('[AddVoucher] Error:', err);
            // Fallback local prepend
            extractedRecords.forEach((rec, idx) => {
                vouchers.unshift({ ...buildPayload(rec), id: Date.now() + idx });
            });
            renderVouchers();
            updateMetrics();
            closeModal();
        } finally {
            submitBtn.disabled    = false;
            submitBtn.textContent = 'Create Voucher';
        }
        return;
    }

    const payload = buildPayloadFromForm();

    if (ocrTriggered) {
        try {
            const response = await fetch(API_BASE + '/upload-to-AWS', {
                method: 'POST',
                headers: { 'Schema': 'voucher' }
            });
            
            if (!response.ok) {
                const errText = await response.text();
                throw new Error('Server error ' + response.status + ': ' + errText);
            }

            const res = await fetch(API_BASE + '/add-voucher', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify([payload]),
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error('Server error ' + res.status + ': ' + errText);
            }

            const savedList = await res.json();
            const saved = Array.isArray(savedList) ? savedList[0] : savedList;
            vouchers.unshift(saved);
            renderVouchers();
            updateMetrics();
            closeModal();

        } catch (err) {
            console.error('[AddVoucher] Error:', err);
            vouchers.unshift({ ...payload, id: Date.now() });
            renderVouchers();
            updateMetrics();
            closeModal();
        } finally {
            submitBtn.disabled    = false;
            submitBtn.textContent = 'Create Voucher';
        }
    } else {
        try {
            const res = await fetch(API_BASE + '/add-voucher', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify([payload]),
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error('Server error ' + res.status + ': ' + errText);
            }

            const savedList = await res.json();
            const saved = Array.isArray(savedList) ? savedList[0] : savedList;
            vouchers.unshift(saved);
            renderVouchers();
            updateMetrics();
            closeModal();

        } catch (err) {
            console.error('[AddVoucher] Error:', err);
            vouchers.unshift({ ...payload, id: Date.now() });
            renderVouchers();
            updateMetrics();
            closeModal();
        } finally {
            submitBtn.disabled    = false;
            submitBtn.textContent = 'Create Voucher';
        }
    }
});

/* ------------------------------------------------------------------ */
/*  Record Actions & Dropdown Controls                                */
/* ------------------------------------------------------------------ */
window.toggleDropdown = function(event, id) {
    event.stopPropagation();
    document.querySelectorAll('.action-dropdown').forEach(d => {
        if (d.id !== 'dropdown-' + id) {
            d.classList.remove('show');
        }
    });
    const dropdown = document.getElementById('dropdown-' + id);
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
};

window.triggerEditVoucher = function(id) {
    const record = vouchers.find(v => (v.id || v.voucher_no) == id);
    if (record) {
        openModal(record);
    }
    document.querySelectorAll('.action-dropdown').forEach(d => d.classList.remove('show'));
};

function showReconciliationConfirm(message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100vw; height: 100vh;
        background: rgba(8, 12, 24, 0.75);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        opacity: 0;
        transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    
    const card = document.createElement('div');
    card.style.cssText = `
        background: var(--color-bg-card, rgba(30, 41, 59, 0.55));
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 16px;
        box-shadow: 0 24px 60px rgba(0,0,0,0.45);
        width: 420px;
        max-width: 90%;
        padding: 24px;
        color: var(--color-text-primary, #f8fafc);
        transform: scale(0.92) translateY(10px);
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        flex-direction: column;
        gap: 16px;
    `;
    
    card.innerHTML = `
        <h3 style="font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px; color: var(--color-text-primary, #f8fafc); margin: 0;">
            <i class="ti ti-alert-triangle" style="color: #EF4444; font-size: 20px;"></i> Reconciled Record Deletion
        </h3>
        <p style="font-size: 13px; color: var(--color-text-secondary, #94a3b8); line-height: 1.5; margin: 0;">
            ${message}
        </p>
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 8px;">
            <button id="cancel-recon-btn" style="padding: 8px 16px; font-size: 13px; cursor: pointer; border-radius: 8px; font-weight: 600; background: transparent; border: 1px solid rgba(255,255,255,0.15); color: var(--color-text-secondary);">Cancel</button>
            <button id="confirm-recon-btn" style="padding: 8px 16px; font-size: 13px; cursor: pointer; border-radius: 8px; font-weight: 600; background: #EF4444; border: none; color: #fff;">Delete Reconciled Record</button>
        </div>
    `;
    
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        card.style.transform = 'scale(1) translateY(0)';
    });
    
    const close = () => {
        overlay.style.opacity = '0';
        card.style.transform = 'scale(0.92) translateY(10px)';
        setTimeout(() => overlay.remove(), 250);
    };
    
    overlay.querySelector('#cancel-recon-btn').addEventListener('click', close);
    overlay.querySelector('#confirm-recon-btn').addEventListener('click', () => {
        close();
        onConfirm();
    });
}

window.triggerRemoveVoucher = async function(id) {
    const record = vouchers.find(v => (v.id || v.voucher_no) == id);
    if (!record) return;

    try {
        const brsRes = await fetch(API_BASE + '/BRS');
        let matchedBrs = null;
        if (brsRes.ok) {
            const brsRecords = await brsRes.json();
            matchedBrs = brsRecords.find(r => r.voucher_no === record.voucher_no);
        }

        const deleteAction = async () => {
            if (matchedBrs) {
                try {
                    await fetch(API_BASE + '/BRS/' + matchedBrs.id, { method: 'DELETE' });
                } catch (e) {
                    console.error('Failed to delete BRS record:', e);
                }
            }
            fetch(API_BASE + '/vouchers/' + id, {
                method: 'DELETE'
            }).then(res => {
                if (res.ok) {
                    vouchers = vouchers.filter(v => (v.id || v.voucher_no) != id);
                    renderVouchers();
                    updateMetrics();
                    if (typeof showToast === 'function') {
                        showToast('Voucher and associated reconciliation records deleted successfully', 'success');
                    }
                } else {
                    notify('Failed to delete voucher from database.', 'error');
                }
            }).catch(err => {
                console.error('Delete failed:', err);
                vouchers = vouchers.filter(v => (v.id || v.voucher_no) != id);
                renderVouchers();
                updateMetrics();
            });
        };

        if (matchedBrs) {
            showReconciliationConfirm(
                `This voucher is reconciled under BRS entry #${matchedBrs.transaction_id}. Deleting it will automatically delete the corresponding bank reconciliation. Do you want to proceed?`,
                deleteAction
            );
        } else {
            if (confirm('Are you sure you want to remove this voucher record?')) {
                deleteAction();
            }
        }
    } catch (err) {
        console.error('Check BRS failed:', err);
        if (confirm('Are you sure you want to remove this voucher record?')) {
            fetch(API_BASE + '/vouchers/' + id, { method: 'DELETE' }).then(res => {
                if (res.ok) {
                    vouchers = vouchers.filter(v => (v.id || v.voucher_no) != id);
                    renderVouchers();
                    updateMetrics();
                }
            });
        }
    }
    document.querySelectorAll('.action-dropdown').forEach(d => d.classList.remove('show'));
};

document.addEventListener('click', function() {
    document.querySelectorAll('.action-dropdown').forEach(d => d.classList.remove('show'));
});
