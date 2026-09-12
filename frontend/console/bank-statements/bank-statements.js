const API_BASE = 'https://vyomplus.onrender.com';

// Local cache of bank statement entries
let statements = [];
let extractedRecords = [];
let editingRecordId = null;

// Local cache of vouchers
let allVouchers = [];
let pendingVouchers = [];

/* ------------------------------------------------------------------ */
/*  Status colours & config                                             */
/* ------------------------------------------------------------------ */
const statusConfig = {
    reconciled: { label: 'Reconciled', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
    pending:    { label: 'Pending',    color: '#F59E0B', bg: 'rgba(245,158,11,0.12)'  },
    unmatched:  { label: 'Unmatched', color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
    processing: { label: 'Processing',color: '#38bdf8', bg: 'rgba(56,189,248,0.12)'  },
};

const tbody = document.getElementById('bs-tbody');

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */
function formatCurrency(num) {
    return '\u20B9' + Number(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function displayDate(raw) {
    if (!raw) return '\u2014';
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return raw;
}

function toInputDate(raw) {
    if (!raw || raw === 'NA') return new Date().toISOString().slice(0, 10);
    const d = new Date(raw);
    return !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function maskAccount(acc) {
    if (!acc) return '\u2014';
    const s = acc.replace(/\s/g, '');
    return s.length > 4 ? 'XXXX ' + s.slice(-4) : acc;
}

/* ------------------------------------------------------------------ */
/*  Voucher list & Autocomplete Helpers                               */
/* ------------------------------------------------------------------ */
function getMockVouchers() {
    return [
        { id: 101, voucher_type: 'Sales', date: '2026-06-20', voucher_no: 'VCH-2026-0449', party: 'Zenith Tech Labs', amount: 290000, gst_amount: 5000, status: 'pending' },
        { id: 102, voucher_type: 'Purchase', date: '2026-06-22', voucher_no: 'VCH-2026-0398', party: 'Apex Suppliers', amount: 80000, gst_amount: 8500, status: 'pending' },
        { id: 103, voucher_type: 'Sales', date: '2026-06-25', voucher_no: 'VCH-2026-0451', party: 'Orion Retail', amount: 150000, gst_amount: 26400, status: 'pending' },
        { id: 104, voucher_type: 'Sales', date: '2026-06-28', voucher_no: 'VCH-2026-0452', party: 'BlueStar Solutions', amount: 500000, gst_amount: 20000, status: 'pending' },
    ];
}

async function fetchVouchers() {
    try {
        const res = await fetch(API_BASE + '/vouchers');
        if (res.ok) {
            allVouchers = await res.json();
            pendingVouchers = allVouchers.filter(v => (v.status || '').toLowerCase() === 'pending');
        } else {
            throw new Error('Server error: ' + res.status);
        }
    } catch (err) {
        console.warn('[BankStatements] Failed to load vouchers from server, using demo vouchers:', err.message);
        allVouchers = getMockVouchers();
        pendingVouchers = allVouchers.filter(v => (v.status || '').toLowerCase() === 'pending');
    }
}

function populatePartyDatalist() {
    const listEl = document.getElementById('parties-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    const uniqueParties = [...new Set(pendingVouchers.map(v => v.party))].filter(Boolean);
    uniqueParties.forEach(party => {
        const opt = document.createElement('option');
        opt.value = party;
        listEl.appendChild(opt);
    });
}

function populateVoucherDatalist(selectedParty = '') {
    const listEl = document.getElementById('vouchers-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    
    const filtered = selectedParty 
        ? pendingVouchers.filter(v => (v.party || '').trim().toLowerCase() === selectedParty.trim().toLowerCase()) 
        : pendingVouchers;
        
    filtered.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.voucher_no;
        opt.textContent = `₹${((v.amount || 0) + (v.gst_amount || 0)).toLocaleString('en-IN')} (Pending)`;
        listEl.appendChild(opt);
    });
}

function updateOutstandingAndReconciliation() {
    const partyVal = document.getElementById('bs-party').value.trim();
    const voucherVal = document.getElementById('bs-voucher-ref').value.trim();
    const amountVal = parseFloat(document.getElementById('bs-amount').value) || 0;
    
    const outstandingRow = document.getElementById('bs-outstanding-row');
    const outstandingInput = document.getElementById('bs-outstanding-balance');
    const statusSelect = document.getElementById('bs-status');
    
    if (partyVal && voucherVal) {
        const vch = allVouchers.find(v => v.voucher_no === voucherVal);
        if (vch) {
            const voucherTotal = (vch.amount || 0) + (vch.gst_amount || 0);
            const diff = Math.abs(amountVal - voucherTotal);
            
            if (outstandingInput) {
                outstandingInput.value = diff.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
            if (outstandingRow) {
                outstandingRow.style.display = 'grid';
            }
            if (statusSelect) {
                statusSelect.value = 'reconciled';
            }
            return;
        }
    }
    
    if (outstandingRow) {
        outstandingRow.style.display = 'none';
    }
}

/* ------------------------------------------------------------------ */
/*  Metrics                                                             */
/* ------------------------------------------------------------------ */
function updateMetrics() {
    const total   = statements.length;
    const credits = statements.filter(s => (s.transaction_type || '').toLowerCase() === 'credit');
    const debits  = statements.filter(s => (s.transaction_type || '').toLowerCase() === 'debit');

    const totalCredits = credits.reduce((sum, s) => sum + Number(s.amount || 0), 0);
    const totalDebits  = debits.reduce((sum, s)  => sum + Number(s.amount || 0), 0);

    document.getElementById('metric-total').textContent        = total.toLocaleString('en-IN');
    document.getElementById('metric-total-sub').innerHTML      = '<i class="ti ti-database"></i> ' + credits.length + ' credits, ' + debits.length + ' debits';
    document.getElementById('metric-credits').textContent      = formatCurrency(totalCredits);
    document.getElementById('metric-credits-count').textContent = credits.length + ' credit transaction' + (credits.length !== 1 ? 's' : '');
    document.getElementById('metric-debits').textContent       = formatCurrency(totalDebits);
    document.getElementById('metric-debits-count').textContent = debits.length + ' debit transaction' + (debits.length !== 1 ? 's' : '');
}

/* ------------------------------------------------------------------ */
/*  Render table                                                        */
/* ------------------------------------------------------------------ */
function renderStatements() {
    tbody.innerHTML = '';

    const query      = (document.getElementById('bs-search')?.value ?? '').toLowerCase().trim();
    const typeFilter = document.getElementById('bs-filter-type')?.value ?? 'All Types';
    const statFilter = document.getElementById('bs-filter-status')?.value ?? 'All Statuses';

    const filtered = statements.filter(function(s) {
        const matchType   = typeFilter === 'All Types'   || (s.transaction_type || '').toLowerCase() === typeFilter.toLowerCase();
        const matchStatus = statFilter === 'All Statuses'|| (s.reconciliation_status || '').toLowerCase() === statFilter.toLowerCase();
        const searchStr   = ((s.referrence_no || '') + ' ' + (s.bank_name || '') + ' ' + (s.account_number || '') + ' ' + (s.description || '') + ' ' + (s.party_name || '')).toLowerCase();
        return matchType && matchStatus && searchStr.includes(query);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="padding:28px;text-align:center;color:var(--color-text-muted);">No statement entries found.</td></tr>';
        return;
    }

    filtered.forEach(function(s) {
        const isCredit = (s.transaction_type || '').toLowerCase() === 'credit';
        const sc = statusConfig[(s.reconciliation_status || 'pending').toLowerCase()] || statusConfig.pending;
        const amountColor = isCredit ? '#10B981' : '#f87171';
        const typeChipBg  = isCredit ? 'rgba(16,185,129,0.1)'    : 'rgba(248,113,113,0.1)';
        const typeChipCol = isCredit ? '#10B981'                  : '#f87171';
        const recordId = s.id || s.referrence_no;

        const tr = document.createElement('tr');
        tr.style.cssText = 'border-bottom:1px solid var(--color-border);transition:background .2s;';
        tr.onmouseenter = function() { tr.style.background = 'rgba(118,159,205,0.07)'; };
        tr.onmouseleave = function() { tr.style.background = ''; };
        tr.innerHTML =
            '<td style="padding:14px 16px;color:#38bdf8;font-weight:600;font-family:monospace;">' + (s.referrence_no || '\u2014') + '</td>' +
            '<td style="padding:14px 16px;color:var(--color-text-secondary);">' + displayDate(s.transaction_date) + '</td>' +
            '<td style="padding:14px 16px;">' +
                '<div style="color:var(--color-text-primary);font-weight:600;">' + (s.bank_name || '\u2014') + '</div>' +
                '<div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">' + maskAccount(s.account_number) + '</div>' +
            '</td>' +
            '<td style="padding:14px 16px;color:var(--color-text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + (s.description || '') + '">' + (s.description || '\u2014') + '</td>' +
            '<td style="padding:14px 16px;"><span style="background:' + typeChipBg + ';color:' + typeChipCol + ';border-radius:6px;padding:3px 10px;font-size:12px;font-weight:600;">' + (s.transaction_type || '\u2014') + '</span></td>' +
            '<td style="padding:14px 16px;text-align:right;font-weight:700;color:' + amountColor + ';">' + (isCredit ? '+' : '-') + formatCurrency(s.amount) + '</td>' +
            '<td style="padding:14px 16px;"><span style="background:' + sc.bg + ';color:' + sc.color + ';border-radius:6px;padding:3px 10px;font-size:12px;font-weight:600;">' + sc.label + '</span></td>' +
            '<td style="padding:14px 16px;text-align:right;position:relative;">' +
                '<button class="action-btn" style="background:none;border:none;color:var(--color-text-secondary);cursor:pointer;font-size:16px;padding:4px;" onclick="event.stopPropagation(); toggleDropdown(event, \'' + recordId + '\')"><i class="ti ti-dots-vertical"></i></button>' +
                '<div class="action-dropdown" id="dropdown-' + recordId + '">' +
                    '<div class="action-dropdown-item" onclick="event.stopPropagation(); triggerEditStatement(\'' + recordId + '\')" ><i class="ti ti-edit"></i> Edit</div>' +
                    '<div class="action-dropdown-item remove" onclick="event.stopPropagation(); triggerRemoveStatement(\'' + recordId + '\')" ><i class="ti ti-trash"></i> Remove</div>' +
                '</div>' +
            '</td>';
        tbody.appendChild(tr);
    });
}

/* ------------------------------------------------------------------ */
/*  Fetch statements from the API on load                              */
/* ------------------------------------------------------------------ */
async function loadStatements() {
    tbody.innerHTML = '<tr><td colspan="8" style="padding:28px;text-align:center;color:var(--color-text-muted);">Loading statements&hellip;</td></tr>';
    try {
        const res = await fetch(API_BASE + '/bank-statements');
        if (!res.ok) throw new Error('Server returned ' + res.status);
        const data = await res.json();
        statements = Array.isArray(data) ? data : [];
    } catch (err) {
        console.warn('[BankStatements] Backend not reachable, table is empty:', err.message);
        statements = [];
    }
    renderStatements();
    updateMetrics();
}

loadStatements();
document.getElementById('bs-search').addEventListener('input', renderStatements);
document.getElementById('bs-filter-type').addEventListener('change', renderStatements);
document.getElementById('bs-filter-status').addEventListener('change', renderStatements);

/* ------------------------------------------------------------------ */
/*  Modal open / close                                                  */
/* ------------------------------------------------------------------ */
const newStatementBtn  = document.getElementById('new-statement-btn');
const modalOverlay     = document.getElementById('new-statement-modal');
const modalCloseBtn    = document.getElementById('modal-close-btn');
const btnModalCancel   = document.getElementById('btn-modal-cancel');
const newStatementForm = document.getElementById('new-statement-form');

document.getElementById('bs-date').valueAsDate = new Date();

function openModal(record = null) {
    modalOverlay.classList.add('show');
    const modalTitle = modalOverlay.querySelector('.modal-header h3');
    const submitBtn = modalOverlay.querySelector('.btn-modal-submit');
    const manualFields = document.getElementById('manual-fields-container');
    const ocrSection = document.getElementById('ocr-section-container');
    const requiredInputs = document.querySelectorAll('#manual-fields-container [data-required]');

    if (record) {
        editingRecordId = record.id || record.ref_no;
        if (modalTitle) modalTitle.innerHTML = '<i class="ti ti-edit"></i> Edit Bank Statement Entry';
        if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy"></i> Save Changes';
        
        if (manualFields) manualFields.style.display = 'block';
        if (ocrSection) ocrSection.style.display = 'none';
        requiredInputs.forEach(input => input.setAttribute('required', ''));

        // Prefill fields (using DB field names)
        document.getElementById('bs-bank-name').value = record.bank_name || '';
        document.getElementById('bs-account-no').value = record.account_number || '';
        document.getElementById('bs-ref-no').value = record.referrence_no || '';
        document.getElementById('bs-date').value = toInputDate(record.transaction_date);
        document.getElementById('bs-description').value = record.description || '';
        document.getElementById('bs-txn-type').value = record.transaction_type || 'Credit';
        document.getElementById('bs-amount').value = record.amount || '';
        document.getElementById('bs-category').value = record.category || 'Sales Receipts';
        document.getElementById('bs-party').value = record.party_name || '';
        document.getElementById('bs-status').value = (record.reconciliation_status || 'pending').toLowerCase();
        document.getElementById('bs-voucher-ref').value = record.voucher_ref || '';

        // Fetch and populate voucher autocomplete data dynamically
        (async () => {
            await fetchVouchers();
            populatePartyDatalist();
            populateVoucherDatalist(record.party || '');
            updateOutstandingAndReconciliation();
        })();
    } else {
        editingRecordId = null;
        if (modalTitle) modalTitle.innerHTML = '<i class="ti ti-building-bank"></i> Add Bank Statement Entry';
        if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy"></i> Save Statement';
        
        if (manualFields) manualFields.style.display = 'none';
        if (ocrSection) ocrSection.style.display = 'block';
        requiredInputs.forEach(input => input.removeAttribute('required'));

        newStatementForm.reset();
        document.getElementById('bs-date').valueAsDate = new Date();
        renderOCRRecordsPreview();
    }
}

function closeModal() {
    modalOverlay.classList.remove('show');
    newStatementForm.reset();
    editingRecordId = null;
    extractedRecords = [];
    renderOCRRecordsPreview();
    resetOCRState();
}

newStatementBtn.addEventListener('click', () => openModal(null));
modalCloseBtn.addEventListener('click', closeModal);
btnModalCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', function(e) {
    if (e.target === modalOverlay) closeModal();
});

/* ------------------------------------------------------------------ */
/*  OCR – element references                                            */
/* ------------------------------------------------------------------ */
const ocrDropArea      = document.getElementById('ocr-drop-area');
const ocrFileInput     = document.getElementById('ocr-file-input');
const ocrUploadTrigger = document.getElementById('ocr-upload-trigger');
const ocrDropTitle     = document.getElementById('ocr-drop-title');
const ocrDropDesc      = document.getElementById('ocr-drop-desc');
const ocrFileInfo      = document.getElementById('ocr-file-info');
const ocrFilename      = document.getElementById('ocr-filename');
const ocrLoader        = document.getElementById('ocr-loader');

ocrUploadTrigger.addEventListener('click', function(e) {
    e.stopPropagation();
    ocrFileInput.click();
});

ocrDropArea.addEventListener('click', function(e) {
    if (e.target !== ocrUploadTrigger && !ocrUploadTrigger.contains(e.target)) {
        ocrFileInput.click();
    }
});

ocrFileInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) handleOCRFile(e.target.files[0]);
});

['dragenter', 'dragover'].forEach(function(evt) {
    ocrDropArea.addEventListener(evt, function(e) {
        e.preventDefault(); e.stopPropagation();
        ocrDropArea.classList.add('dragover');
    }, false);
});

['dragleave', 'drop'].forEach(function(evt) {
    ocrDropArea.addEventListener(evt, function(e) {
        e.preventDefault(); e.stopPropagation();
        ocrDropArea.classList.remove('dragover');
    }, false);
});

ocrDropArea.addEventListener('drop', function(e) {
    const files = e.dataTransfer.files;
    if (files.length > 0) handleOCRFile(files[0]);
});

function resetOCRState() {
    ocrDropTitle.style.display = 'block';
    ocrDropDesc.style.display  = 'block';
    ocrDropDesc.textContent    = 'Supports PDF, PNG, JPG \u00b7 Max 10 MB';
    ocrDropDesc.style.color    = '#64748b';
    ocrFileInfo.style.display  = 'none';
    ocrLoader.style.display    = 'none';
    ocrFileInput.value         = '';
    extractedRecords           = [];
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
        const isCredit = (rec.transaction_type || rec.type || '').toLowerCase() === 'credit';
        const amountColor = isCredit ? '#10B981' : '#f87171';
        const dateStr = displayDate(rec.transaction_date || rec.date);
        const partyStr = rec.party || rec.bank_name || 'Unknown Party';
        const amountStr = formatCurrency(rec.amount || 0);
        
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(15, 23, 42, 0.4); border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.05);';
        row.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 2px;">
                <span style="font-weight: 600; color: var(--color-text-primary); font-size: 13px;">${partyStr}</span>
                <span style="color: var(--color-text-muted); font-size: 11px;">${dateStr}</span>
            </div>
            <span style="font-weight: 700; color: ${amountColor}; font-size: 13px;">${isCredit ? '+' : '-'}${amountStr}</span>
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
/*  OCR – read file -> POST /extract-OCR                               */
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
            headers: { 'Content-Type': file.type, 'Schema': 'bankStatement' },
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
            const textContent = raw.candidates[0]?.content?.parts?.[0]?.text;
            if (!textContent) throw new Error('No text content found in OCR response.');
            reportList = JSON.parse(textContent);
        } else {
            throw new Error('Unexpected response shape from /extract-OCR endpoint.');
        }
        const reports = reportList && reportList.reports;
        if (!reports || reports.length === 0) {
            throw new Error('OCR returned no data. Try a clearer document.');
        }
        
        extractedRecords = reports;
        showOCRSuccess(file.name + ' (' + reports.length + ' records loaded)');
        renderOCRRecordsPreview();
        
        autofillForm(reports[0]);
    } catch (err) {
        console.error('[OCR] Error:', err);
        showOCRError(err.message || 'OCR processing failed. Please try again.');
    }
}

/* ------------------------------------------------------------------ */
/*  Autofill form fields from OCR record                               */
/* ------------------------------------------------------------------ */
function autofillForm(record) {
    const fields = {
        'bs-bank-name':       record.bank_name,
        'bs-account-no':      record.account_number,
        'bs-ref-no':          record.referrence_no,
        'bs-description':     record.description,
        'bs-amount':          record.amount,
        'bs-party':           record.party,
        'bs-voucher-ref':     record.voucher_ref,
    };
    const selectFields = {
        'bs-txn-type':     record.transaction_type,
        'bs-category':     record.category,
        'bs-status':       record.status,
    };
    Object.entries(fields).forEach(function([id, value]) {
        const el = document.getElementById(id);
        if (el && value != null && value !== 'NA' && value !== '') el.value = value;
    });
    Object.entries(selectFields).forEach(function([id, value]) {
        const el = document.getElementById(id);
        if (el && value) el.value = value;
    });
    if (record.transaction_date) document.getElementById('bs-date').value = toInputDate(record.transaction_date);

    // Flash green highlight on all fields
    const allIds = [...Object.keys(fields), ...Object.keys(selectFields), 'bs-date'];
    allIds.forEach(function(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.transition  = 'box-shadow 0.3s ease, border-color 0.3s ease';
        el.style.borderColor = '#10B981';
        el.style.boxShadow   = '0 0 0 2px rgba(16,185,129,0.3)';
        setTimeout(function() {
            el.style.borderColor = '';
            el.style.boxShadow   = '';
        }, 2000);
    });
}

/* ------------------------------------------------------------------ */
/*  Form submission -> POST /bank-statements                           */
/* ------------------------------------------------------------------ */
newStatementForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    const submitBtn = newStatementForm.querySelector('.btn-modal-submit');
    submitBtn.disabled   = true;
    submitBtn.innerHTML  = '<div class="spinner" style="border-color:rgba(255,255,255,0.2);border-top-color:#fff;"></div> Saving&hellip;';

    if (editingRecordId !== null) {
        const payload = {
            bank_name:       document.getElementById('bs-bank-name').value,
            account_number:  document.getElementById('bs-account-no').value,
            referrence_no:   document.getElementById('bs-ref-no').value,
            transaction_date: document.getElementById('bs-date').value,
            description:     document.getElementById('bs-description').value,
            transaction_type: document.getElementById('bs-txn-type').value,
            amount:          parseFloat(document.getElementById('bs-amount').value),
            category:        document.getElementById('bs-category').value,
            party_name:      document.getElementById('bs-party').value,
            reconciliation_status: document.getElementById('bs-status').value,
            voucher_ref:     document.getElementById('bs-voucher-ref').value || null,
        };

        try {
            const res = await fetch(API_BASE + '/bank-statements/' + editingRecordId, {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(payload),
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error('Server error ' + res.status + ': ' + errText);
            }

            const saved = await res.json();
            const idx = statements.findIndex(s => s.id == editingRecordId);
            if (idx !== -1) {
                statements[idx] = saved;
            }
        } catch (err) {
            console.warn('[BankStatements] Server save/update failed, updating locally:', err.message);
            const idx = statements.findIndex(s => s.id == editingRecordId);
            if (idx !== -1) {
                statements[idx] = { ...statements[idx], ...payload, id: editingRecordId };
            }
        }
        
        // Check if a voucher is linked and status is reconciled, then set voucher status to cleared + create BRS entry
        const voucherRef = document.getElementById('bs-voucher-ref').value.trim();
        const statusVal = document.getElementById('bs-status').value;
        if (voucherRef && statusVal === 'reconciled') {
            const vch = allVouchers.find(v => v.voucher_no === voucherRef);
            if (vch) {
                try {
                    await fetch(API_BASE + '/vouchers/' + vch.id, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            voucher_type: vch.voucher_type,
                            date: vch.date,
                            voucher_no: vch.voucher_no,
                            party: vch.party,
                            amount: vch.amount,
                            gst_amount: vch.gst_amount,
                            status: 'cleared'
                        })
                    });
                    console.log(`Voucher ${vch.voucher_no} status updated to cleared on server.`);
                } catch (err) {
                    console.warn(`Failed to update voucher status on server:`, err);
                }
                vch.status = 'cleared';
                pendingVouchers = pendingVouchers.filter(v => v.voucher_no !== voucherRef);

                // Create BRS reconciliation record
                const savedStatement = statements.find(s => s.id == editingRecordId);
                const brsPayload = {
                    transaction_id: editingRecordId,
                    voucher_no: voucherRef,
                    description: document.getElementById('bs-description').value || vch.party || 'Reconciliation',
                    amount: parseFloat(document.getElementById('bs-amount').value) || vch.amount,
                    gst_amount: vch.gst_amount || 0,
                };
                try {
                    const brsRes = await fetch(API_BASE + '/BRS', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(brsPayload),
                    });
                    if (brsRes.ok) {
                        console.log('[BRS] Reconciliation record created successfully.');
                    } else {
                        const errTxt = await brsRes.text();
                        console.warn('[BRS] Failed to create reconciliation record:', errTxt);
                    }
                } catch (err) {
                    console.warn('[BRS] Error posting reconciliation:', err.message);
                }
            }
        }
        
        renderStatements();
        updateMetrics();
        closeModal();
        return;
    }

    if (extractedRecords.length === 0) {
        showToast('Please upload a bank statement first.', 'warning');
        submitBtn.disabled  = false;
        submitBtn.innerHTML = '<i class="ti ti-device-floppy"></i> Save Statement';
        return;
    }
    
    function buildPayload(rec) {
        return {
            bank_name:       rec.bank_name || 'NA',
            account_number:  rec.account_number || rec.account_no || 'NA',
            referrence_no:   rec.referrence_no || rec.ref_no || 'NA',
            transaction_date: rec.transaction_date ? toInputDate(rec.transaction_date) : new Date().toISOString().slice(0, 10),
            description:     rec.description || 'NA',
            transaction_type: rec.transaction_type || 'Credit',
            amount:          rec.amount !== undefined ? parseFloat(rec.amount) : 0,
            category:        rec.category || 'Sales Receipts',
            party_name:      rec.party || rec.party_name || 'NA',
            reconciliation_status: rec.status || rec.reconciliation_status || 'pending',
            voucher_ref:     rec.voucher_ref || null,
        };
    }

    try {
        const uploadRes = await fetch(API_BASE + '/upload-to-AWS', {
            method: 'POST',
            headers: { 'Schema': 'bankStatement' }
        });
        
        if (!uploadRes.ok) {
            const errText = await uploadRes.text();
            throw new Error('Upload error ' + uploadRes.status + ': ' + errText);
        }

        for (const rec of extractedRecords) {
            const payload = buildPayload(rec);
            const res = await fetch(API_BASE + '/bank-statements', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify([payload]),
            });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error('Server error ' + res.status + ': ' + errText);
            }
            const savedList = await res.json();
            if (Array.isArray(savedList)) savedList.forEach(s => statements.unshift(s));
            else statements.unshift(savedList);
        }

        renderStatements();
        updateMetrics();
        closeModal();

    } catch (err) {
        console.warn('[BankStatements] Save failed (likely no backend), adding locally:', err.message);
        
        extractedRecords.forEach((rec, idx) => {
            statements.unshift({ ...buildPayload(rec), id: Date.now() + idx });
        });
        
        renderStatements();
        updateMetrics();
        closeModal();
    } finally {
        submitBtn.disabled  = false;
        submitBtn.innerHTML = '<i class="ti ti-device-floppy"></i> Save Statement';
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

window.triggerEditStatement = function(id) {
    const record = statements.find(s => s.id == id);
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

window.triggerRemoveStatement = async function(id) {
    try {
        const brsRes = await fetch(API_BASE + '/BRS');
        let matchedBrs = null;
        if (brsRes.ok) {
            const brsRecords = await brsRes.json();
            matchedBrs = brsRecords.find(r => String(r.transaction_id) === String(id));
        }

        const deleteAction = async () => {
            if (matchedBrs) {
                try {
                    await fetch(API_BASE + '/BRS/' + matchedBrs.id, { method: 'DELETE' });
                } catch (e) {
                    console.error('Failed to delete BRS record:', e);
                }
            }
            fetch(API_BASE + '/bank-statements/' + id, {
                method: 'DELETE'
            }).then(res => {
                if (res.ok) {
                    statements = statements.filter(s => s.id != id);
                    renderStatements();
                    updateMetrics();
                    if (typeof showToast === 'function') {
                        showToast('Bank statement and associated reconciliation deleted successfully', 'success');
                    }
                } else {
                    notify('Failed to delete statement from database.', 'error');
                }
            }).catch(err => {
                console.error('Delete failed:', err);
                statements = statements.filter(s => s.id != id);
                renderStatements();
                updateMetrics();
            });
        };

        if (matchedBrs) {
            showReconciliationConfirm(
                `This bank statement transaction is reconciled with voucher #${matchedBrs.voucher_no}. Deleting it will automatically delete the corresponding bank reconciliation. Do you want to proceed?`,
                deleteAction
            );
        } else {
            if (confirm('Are you sure you want to remove this statement record?')) {
                deleteAction();
            }
        }
    } catch (err) {
        console.error('Check BRS failed:', err);
        if (confirm('Are you sure you want to remove this statement record?')) {
            fetch(API_BASE + '/bank-statements/' + id, { method: 'DELETE' }).then(res => {
                if (res.ok) {
                    statements = statements.filter(s => s.id != id);
                    renderStatements();
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

// Autocomplete and calculation logic listeners
document.getElementById('bs-party').addEventListener('input', function(e) {
    const val = e.target.value;
    populateVoucherDatalist(val);
    updateOutstandingAndReconciliation();
});

document.getElementById('bs-voucher-ref').addEventListener('input', function(e) {
    const val = e.target.value;
    // Search the full list of vouchers for the typed voucher number
    const vch = allVouchers.find(v => v.voucher_no === val);
    if (vch) {
        document.getElementById('bs-party').value = vch.party;
        populateVoucherDatalist(vch.party);
        updateOutstandingAndReconciliation();
    } else {
        updateOutstandingAndReconciliation();
    }
});

document.getElementById('bs-amount').addEventListener('input', updateOutstandingAndReconciliation);

