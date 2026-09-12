/**
 * review.js – Voucher Review Queue
 *
 * Flow:
 *  1. On page load, fetch stats and the list of "pending" vouchers from the backend.
 *  2. Render the first pending item in the split-pane layout:
 *       - Left  : shows the original file (PDF iframe / image) via a presigned S3 URL.
 *       - Right : pre-fills all editable form fields with OCR-extracted data.
 *  3. The reviewer can edit any field, then click:
 *       - "Save & Next"  → POST /pending-vouchers/{id}/accept  → inserts into Vouchers table.
 *       - "Reject"       → POST /pending-vouchers/{id}/reject  → marks as rejected.
 *  4. If the queue is empty the left pane shows an upload dropzone so the reviewer can
 *     upload a new file straight from this page (calls /upload-to-AWS → /extract-OCR → /pending-vouchers).
 */

const API_BASE = 'https://vyomplus.onrender.com';

let pendingQueue  = [];   // items with status "pending"
let currentIndex  = 0;    // index within pendingQueue currently being shown

/* ── DOM references ────────────────────────────────────────────────── */
const statPending        = document.getElementById('stat-pending');
const statDone           = document.getElementById('stat-done');
const statTotal          = document.getElementById('stat-total');
const previewBody        = document.getElementById('preview-body');
const previewFilename    = document.getElementById('preview-filename');
const currentIndicator   = document.getElementById('current-record-indicator');
const itemsTbody         = document.getElementById('items-tbody');

const btnBack            = document.getElementById('btn-back');
const btnReject          = document.getElementById('btn-reject');
const btnSaveNext        = document.getElementById('btn-save-next');
const addItemBtn         = document.getElementById('add-item-btn');

const dropzone           = document.getElementById('review-dropzone');
const fileInput          = document.getElementById('review-file-input');
const uploadTrigger      = document.getElementById('review-upload-trigger');
const ocrLoader          = document.getElementById('ocr-loader');

/* ── Initialise ─────────────────────────────────────────────────────── */
async function init() {
    await loadStats();
    await loadQueue();
}

/* ── Stats ──────────────────────────────────────────────────────────── */
async function loadStats() {
    try {
        const res  = await fetch(`${API_BASE}/pending-vouchers/stats`);
        if (!res.ok) return;
        const data = await res.json();
        statPending.textContent = data.pending;
        statDone.textContent    = data.done;
        statTotal.textContent   = data.total;
    } catch (e) {
        console.warn('[Review] Failed to load stats:', e.message);
    }
}

/* ── Queue ──────────────────────────────────────────────────────────── */
async function loadQueue() {
    try {
        const res = await fetch(`${API_BASE}/pending-vouchers`);
        if (!res.ok) throw new Error('Server ' + res.status);
        pendingQueue  = await res.json();
        currentIndex  = 0;
        renderCurrentVoucher();
    } catch (e) {
        console.error('[Review] Failed to load queue:', e.message);
        showEmptyState();
    }
}

/* ── Render current voucher ─────────────────────────────────────────── */
async function renderCurrentVoucher() {
    if (!pendingQueue.length || currentIndex >= pendingQueue.length) {
        showEmptyState();
        return;
    }

    const item = pendingQueue[currentIndex];

    currentIndicator.textContent = `Record ${currentIndex + 1} of ${pendingQueue.length}`;
    previewFilename.textContent  = item.file_key ? item.file_key.split('/').pop() : '';

    /* Populate form fields */
    setField('v-type',     item.voucher_type || 'Sales');
    setField('v-date',     toInputDate(item.date || ''));
    setField('v-no',       item.voucher_no   || '');
    setField('v-party',    item.party        || '');
    setField('v-amount',   item.amount       ?? 0);
    setField('v-gst',      item.gst_amount   ?? 0);
    setField('v-discount', item.discount     ?? 0);
    setField('v-status',   'Pending');

    /* Populate items table */
    itemsTbody.innerHTML = '';
    const items = Array.isArray(item.items) && item.items.length ? item.items : [];
    if (items.length === 0) {
        addItemRow();
    } else {
        items.forEach(i => addItemRow(i));
    }

    /* Load file preview — proxy through backend to avoid S3 CORS restrictions */
    if (item.file_key) {
        previewBody.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;color:var(--color-text-muted);">
                <div class="spinner"></div>
                <span style="font-size:13px;">Loading preview…</span>
            </div>`;

        // Revoke any previous blob URL to avoid memory leaks
        if (previewBody._blobUrl) {
            URL.revokeObjectURL(previewBody._blobUrl);
            previewBody._blobUrl = null;
        }

        const ext = item.file_key.split('.').pop().toLowerCase();

        try {
            /* Fetch file bytes through the backend proxy — avoids S3 CORS issues */
            const proxyRes = await fetch(`${API_BASE}/get-file?file_key=${encodeURIComponent(item.file_key)}`);
            if (!proxyRes.ok) {
                const errText = await proxyRes.text();
                throw new Error(`Failed to load file (${proxyRes.status}): ${errText}`);
            }
            const blob = await proxyRes.blob();
            const objectUrl = URL.createObjectURL(blob);
            previewBody._blobUrl = objectUrl;   // store for later cleanup

            if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
                const img = document.createElement('img');
                img.className = 'preview-image';
                img.alt = 'Voucher image';
                img.src = objectUrl;
                previewBody.innerHTML = '';
                previewBody.appendChild(img);

            } else if (ext === 'pdf') {
                previewBody.innerHTML = `<iframe class="preview-iframe" src="${objectUrl}" title="Voucher PDF"></iframe>`;

            } else {
                // Unknown type — offer a download link via presigned URL
                const r = await fetch(`${API_BASE}/get-presigned-url?file_key=${encodeURIComponent(item.file_key)}`);
                const { url } = r.ok ? await r.json() : { url: '#' };
                previewBody.innerHTML = `
                    <div class="empty-state">
                        <i class="ti ti-file-unknown"></i>
                        <p>No preview available for .${ext} files.</p>
                        <a href="${url}" target="_blank" class="btn btn-secondary" style="margin-top:8px;">
                            <i class="ti ti-download"></i> Download File
                        </a>
                    </div>`;
            }
        } catch (e) {
            previewBody.innerHTML = `
                <div class="empty-state">
                    <i class="ti ti-alert-triangle" style="color:#ef4444;"></i>
                    <p>${e.message}</p>
                </div>`;
        }
    } else {
        previewBody.innerHTML = `
            <div class="empty-state">
                <i class="ti ti-file-off"></i>
                <p>No document attached to this review item.</p>
            </div>`;
    }
}

/* ── Empty / upload state ───────────────────────────────────────────── */
function showEmptyState() {
    currentIndicator.textContent = 'No Record';
    previewFilename.textContent  = '';

    /* Reset form */
    ['v-type','v-date','v-no','v-party','v-amount','v-gst','v-discount'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = el.tagName === 'SELECT' ? el.options[0]?.value : '';
    });
    itemsTbody.innerHTML = '';

    /* Restore dropzone in the preview pane */
    previewBody.innerHTML = '';
    dropzone.style.display = 'flex';
    ocrLoader.style.display = 'none';
    previewBody.appendChild(dropzone);
    previewBody.appendChild(ocrLoader);
}

/* ── Helpers ────────────────────────────────────────────────────────── */
function setField(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
}

function toInputDate(str) {
    if (!str || str === 'NA') return '';
    try {
        /* Handle DD/MM/YYYY */
        if (str.includes('/')) {
            const [d, m, y] = str.split('/');
            if (y && y.length === 4) return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
        }
        const d = new Date(str);
        if (!isNaN(d)) return d.toISOString().split('T')[0];
    } catch (_) {}
    return str;
}

function addItemRow(item = { item_name: '', qty: 1, rate: 0 }) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="text"   class="item-name" value="${escHtml(item.item_name || item.name || '')}" placeholder="Item description"></td>
        <td><input type="number" class="item-qty"  value="${item.qty  ?? 1}" style="text-align:right;" min="1"></td>
        <td><input type="number" class="item-rate" value="${item.rate ?? 0}" style="text-align:right;" step="0.01" min="0"></td>
        <td style="text-align:center;">
            <button type="button" class="remove-item-btn" title="Remove"><i class="ti ti-trash"></i></button>
        </td>`;
    tr.querySelector('.remove-item-btn').addEventListener('click', () => {
        tr.remove();
        if (itemsTbody.children.length === 0) addItemRow();
    });
    itemsTbody.appendChild(tr);
}

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function getItemsFromTable() {
    return Array.from(itemsTbody.querySelectorAll('tr'))
        .map(tr => ({
            item_name : tr.querySelector('.item-name').value.trim(),
            qty       : parseInt(tr.querySelector('.item-qty').value, 10)  || 1,
            rate      : parseFloat(tr.querySelector('.item-rate').value)    || 0,
        }))
        .filter(i => i.item_name);
}

function buildPayload() {
    return {
        voucher_type : document.getElementById('v-type').value,
        date         : document.getElementById('v-date').value,
        voucher_no   : document.getElementById('v-no').value.trim(),
        party        : document.getElementById('v-party').value.trim(),
        items        : getItemsFromTable(),
        amount       : parseFloat(document.getElementById('v-amount').value)   || 0,
        gst_amount   : parseFloat(document.getElementById('v-gst').value)      || 0,
        discount     : parseFloat(document.getElementById('v-discount').value) || 0,
        status       : document.getElementById('v-status').value,
    };
}

/* ── Notification ───────────────────────────────────────────────────── */
function notify(msg, type = 'success') {
    if (typeof window.showToastNotification === 'function') {
        window.showToastNotification(msg, type);
    } else {
        const colours = { success: '#10B981', error: '#ef4444', warning: '#F59E0B', info: '#3B82F6' };
        const toast   = Object.assign(document.createElement('div'), {
            textContent: msg,
            style: `position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:10px;
                    background:${colours[type]||colours.info};color:#fff;font-size:13px;font-weight:600;
                    box-shadow:0 4px 20px rgba(0,0,0,.35);animation:fadeInUp .3s ease;`,
        });
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }
}

/* ── Action buttons ─────────────────────────────────────────────────── */
btnBack.addEventListener('click', () => window.location.href = '../vouchers/vouchers.html');

addItemBtn.addEventListener('click', () => addItemRow());

btnReject.addEventListener('click', async () => {
    if (!pendingQueue.length || currentIndex >= pendingQueue.length) return;
    if (!confirm('Reject this voucher? It will be marked as rejected and skipped.')) return;

    const item = pendingQueue[currentIndex];
    try {
        const res = await fetch(`${API_BASE}/pending-vouchers/${item.id}/reject`, { method: 'POST' });
        if (!res.ok) throw new Error((await res.json()).detail || 'Server error');
        notify('Voucher rejected.', 'warning');
        pendingQueue.splice(currentIndex, 1);
        await loadStats();
        renderCurrentVoucher();
    } catch (e) {
        notify(e.message, 'error');
    }
});

btnSaveNext.addEventListener('click', async () => {
    if (!pendingQueue.length || currentIndex >= pendingQueue.length) return;

    const item    = pendingQueue[currentIndex];
    const payload = buildPayload();

    if (!payload.voucher_no) { notify('Voucher Number is required.', 'error'); return; }
    if (!payload.party)      { notify('Party name is required.',     'error'); return; }
    if (!payload.date)       { notify('Date is required.',           'error'); return; }

    btnSaveNext.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/pending-vouchers/${item.id}/accept`, {
            method  : 'POST',
            headers : { 'Content-Type': 'application/json' },
            body    : JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Server error');
        notify('Voucher approved and saved to ledger!', 'success');
        pendingQueue.splice(currentIndex, 1);
        await loadStats();
        renderCurrentVoucher();
    } catch (e) {
        notify(e.message, 'error');
    } finally {
        btnSaveNext.disabled = false;
    }
});

/* ── Upload / OCR flow from Review page ────────────────────────────── */
uploadTrigger.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => { handleUpload(e.target.files[0]); e.target.value = ''; });

dropzone.addEventListener('dragover',  e => { e.preventDefault(); dropzone.style.borderColor = '#2563EB'; });
dropzone.addEventListener('dragleave', ()=> dropzone.style.borderColor = '');
dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.style.borderColor = '';
    if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files[0]);
});

async function handleUpload(file) {
    if (!file) return;
    const allowed = ['application/pdf','image/jpeg','image/png'];
    if (!allowed.includes(file.type)) { notify('Unsupported type. Use PDF, JPG or PNG.', 'error'); return; }
    if (file.size > 15 * 1024 * 1024) { notify('File exceeds 15 MB limit.',             'error'); return; }

    dropzone.style.display  = 'none';
    ocrLoader.style.display = 'flex';

    try {
        const bytes = await file.arrayBuffer();

        /* 1. OCR extraction */
        const ocrRes = await fetch(`${API_BASE}/extract-OCR`, {
            method  : 'POST',
            headers : { 'Content-Type': file.type, 'Schema': 'voucher' },
            body    : bytes,
        });
        if (!ocrRes.ok) throw new Error('OCR extraction failed (' + ocrRes.status + ')');
        const raw = await ocrRes.json();

        /* Parse response shape */
        let reportList = null;
        if (raw?.reports) {
            reportList = raw;
        } else if (typeof raw?.text === 'string') {
            reportList = JSON.parse(raw.text);
        } else if (raw?.candidates?.[0]?.content?.parts?.[0]?.text) {
            reportList = JSON.parse(raw.candidates[0].content.parts[0].text);
        } else {
            throw new Error('Unexpected OCR response shape.');
        }

        const report = reportList?.reports?.[0];
        if (!report) throw new Error('No data extracted. Try a clearer document.');

        /* 2. Upload to AWS S3 (stores file_key in Redis) */
        const upRes = await fetch(`${API_BASE}/upload-to-AWS`, {
            method  : 'POST',
            headers : { 'Content-Type': file.type, 'Schema': 'voucher' },
            body    : bytes,
        });
        if (!upRes.ok) throw new Error('Upload to S3 failed (' + upRes.status + ')');

        /* 3. Save pending voucher — backend reads file_key from Redis */
        const items = (report.items || []).map(i => ({
            item_name : i.item_name || i.name || 'Item',
            qty       : Number(i.qty) || 1,
            rate      : Number(i.rate) || 0,
        }));

        const saveRes = await fetch(`${API_BASE}/pending-vouchers`, {
            method  : 'POST',
            headers : { 'Content-Type': 'application/json' },
            body    : JSON.stringify({
                voucher_type : report.voucher_type || 'Sales',
                date         : report.date         || '',
                voucher_no   : report.voucher_no   || '',
                party        : report.party        || '',
                items,
                amount       : Number(report.amount)     || 0,
                gst_amount   : Number(report.gst_amount) || 0,
                discount     : Number(report.discount)   || 0,
            }),
        });
        if (!saveRes.ok) throw new Error('Failed to save to review queue (' + saveRes.status + ')');

        notify('File uploaded – added to review queue!', 'success');
        await init();  // reload everything
    } catch (e) {
        notify(e.message, 'error');
        ocrLoader.style.display = 'none';
        showEmptyState();
    }
}

/* ── Boot ───────────────────────────────────────────────────────────── */
init();
