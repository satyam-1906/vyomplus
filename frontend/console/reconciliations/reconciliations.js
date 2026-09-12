const API_BASE = 'https://vyomplus.onrender.com';

// BRS live data from database
let brsRecords = [];

// Mock data for non-BRS tabs
const mockData = {
    vendor: [
        { id: 1, vendor_name: 'Nexus Office Suppliers', invoice_no: 'INV/2026/889', date: '2026-06-25', stmt_amt: 72000, ledger_amt: 68000, status: 'Mismatch', remarks: 'Trade discount mismatch' },
        { id: 2, vendor_name: 'Radiant Electro Distributors', invoice_no: 'RE/26-27/012', date: '2026-06-28', stmt_amt: 118000, ledger_amt: 118000, status: 'Matched', remarks: 'Perfect match' },
        { id: 3, vendor_name: 'Supreme Logistical Services', invoice_no: 'SLS-9912', date: '2026-06-15', stmt_amt: 32500, ledger_amt: 0, status: 'Missing in Books', remarks: 'Invoice copy pending' }
    ],
    customer: [
        { id: 1, customer_name: 'Zenith Tech Labs', document_ref: 'INV-2026-001', date: '2026-06-20', stmt_bal: 120000, ledger_bal: 125000, status: 'Mismatch', remarks: 'TDS deduction mismatch' },
        { id: 2, customer_name: 'Apex Retailers Inc', document_ref: 'INV-2026-002', date: '2026-06-22', stmt_bal: 450000, ledger_bal: 450000, status: 'Matched', remarks: 'Payment received in full' },
        { id: 3, customer_name: 'Globex Global Services', document_ref: 'INV-2026-003', date: '2026-06-29', stmt_bal: 0, ledger_bal: 65400, status: 'In Transit', remarks: 'Cheque in clearing queue' }
    ],
    gst: [
        { id: 1, gstin: '27AAACC1234D1Z5', supplier_name: 'Radiant Electro Distributors', portal_itc: 72000, books_itc: 72000, status: 'Matched', eligibility: 'Claimed' },
        { id: 2, gstin: '29BBBEE5678F1Z9', supplier_name: 'Nexus Office Suppliers', portal_itc: 42350, books_itc: 35150, status: 'Mismatch', eligibility: 'Claimed' },
        { id: 3, gstin: '19DDDKK9911E2Z0', supplier_name: 'Vertex Cloud Services', portal_itc: 0, books_itc: 12600, status: 'Only in Books', eligibility: 'Reversed' }
    ],
    ledger: [
        { id: 1, ledger_name: 'Accounts Payable Subledger', reference: 'GL-AP-2026-06', date: '2026-06-30', gl_bal: 2450000, sl_bal: 2450000, status: 'Reconciled', remarks: 'Subledger matches control account' },
        { id: 2, ledger_name: 'Fixed Assets Register', reference: 'FA-00441', date: '2026-06-30', gl_bal: 4500000, sl_bal: 4480000, status: 'Unreconciled', remarks: 'Depreciation journal entry pending' }
    ]
};

let activeTab = 'bank';

/* ------------------------------------------------------------------ */
/*  Helpers & Formatting                                                */
/* ------------------------------------------------------------------ */
function formatCurrency(num) {
    return String.fromCharCode(8377) + Number(num || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function displayDate(raw) {
    if (!raw) return '\u2014';
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return raw;
}

function getStatusBadge(status) {
    let color = '#94a3b8';
    let text = status || '\u2014';
    const clean = (status || '').trim().toLowerCase();
    if (clean === 'cleared' || clean === 'matched' || clean === 'reconciled') { color = '#10B981'; text = '\u2713 ' + status; }
    else if (clean === 'outstanding' || clean === 'mismatch' || clean === 'unreconciled' || clean === 'pending') { color = '#F59E0B'; text = '\u26a0 ' + status; }
    else if (clean === 'adjustment required' || clean === 'missing in books' || clean === 'ineligible') { color = '#EF4444'; text = '\u2717 ' + status; }
    else if (clean === 'in transit' || clean === 'only in 2b' || clean === 'only in gstr-2b') { color = '#2563EB'; text = '\u{1F552} ' + status; }
    else if (clean === 'only in books' || clean === 'books only' || clean === 'reversed') { color = '#F97316'; text = '\u{1F4D6} ' + status; }
    return '<span style="color:' + color + '; font-weight:600; font-size:12px;">' + text + '</span>';
}

/* ------------------------------------------------------------------ */
/*  Dropdown helpers                                                    */
/* ------------------------------------------------------------------ */
function toggleBRSDropdown(event, id) {
    event.stopPropagation();
    document.querySelectorAll('.brs-dropdown').forEach(function(d) {
        if (d.id !== 'brs-dd-' + id) d.classList.remove('show');
    });
    const dd = document.getElementById('brs-dd-' + id);
    if (dd) dd.classList.toggle('show');
}

document.addEventListener('click', function() {
    document.querySelectorAll('.brs-dropdown').forEach(function(d) { d.classList.remove('show'); });
});

window.toggleBRSDropdown = toggleBRSDropdown;

/* ------------------------------------------------------------------ */
/*  Load BRS from API                                                   */
/* ------------------------------------------------------------------ */
async function loadBRS() {
    const tbody = document.getElementById('recon-table-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="padding:28px;text-align:center;color:var(--color-text-muted);">Loading BRS records&hellip;</td></tr>';
    try {
        const res = await fetch(API_BASE + '/BRS');
        if (!res.ok) throw new Error('Server returned ' + res.status);
        brsRecords = await res.json();
    } catch (err) {
        console.warn('[Reconciliations] Could not fetch BRS records:', err.message);
        brsRecords = [];
    }
    if (activeTab === 'bank') {
        renderTable();
        renderMetrics();
    }
}

/* ------------------------------------------------------------------ */
/*  Delete BRS record (cascades revert)                                 */
/* ------------------------------------------------------------------ */
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
            <i class="ti ti-alert-triangle" style="color: #EF4444; font-size: 20px;"></i> Remove Reconciliation
        </h3>
        <p style="font-size: 13px; color: var(--color-text-secondary, #94a3b8); line-height: 1.5; margin: 0;">
            ${message}
        </p>
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 8px;">
            <button id="cancel-recon-btn" style="padding: 8px 16px; font-size: 13px; cursor: pointer; border-radius: 8px; font-weight: 600; background: transparent; border: 1px solid rgba(255,255,255,0.15); color: var(--color-text-secondary);">Cancel</button>
            <button id="confirm-recon-btn" style="padding: 8px 16px; font-size: 13px; cursor: pointer; border-radius: 8px; font-weight: 600; background: #EF4444; border: none; color: #fff;">Remove Reconciliation</button>
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

async function triggerRemoveBRS(id) {
    const deleteAction = async () => {
        document.querySelectorAll('.brs-dropdown').forEach(function(d) { d.classList.remove('show'); });
        try {
            const res = await fetch(API_BASE + '/BRS/' + id, { method: 'DELETE' });
            if (res.ok) {
                brsRecords = brsRecords.filter(function(r) { return r.id !== id; });
                renderTable();
                renderMetrics();
                if (typeof showToast === 'function') {
                    showToast('Reconciliation record removed and sources reverted successfully', 'success');
                }
            } else {
                const txt = await res.text();
                notify('Failed to delete reconciliation: ' + txt, 'error');
            }
        } catch (err) {
            console.error('[BRS] Delete failed:', err);
            notify('Network error while deleting reconciliation.', 'error');
        }
    };

    showReconciliationConfirm(
        'Are you sure you want to remove this reconciliation? The linked bank statement and voucher will be reverted to Pending.',
        deleteAction
    );
}

window.triggerRemoveBRS = triggerRemoveBRS;

/* ------------------------------------------------------------------ */
/*  Metrics                                                             */
/* ------------------------------------------------------------------ */
function renderMetrics() {
    const leftTitle  = document.getElementById('stat-left-title');
    const leftValue  = document.getElementById('stat-left-value');
    const leftDesc   = document.getElementById('stat-left-desc');
    const leftIcon   = document.getElementById('stat-left-icon');
    const midTitle   = document.getElementById('stat-mid-title');
    const midValue   = document.getElementById('stat-mid-value');
    const midDesc    = document.getElementById('stat-mid-desc');
    const midIcon    = document.getElementById('stat-mid-icon');
    const rightTitle = document.getElementById('stat-right-title');
    const rightValue = document.getElementById('stat-right-value');
    const rightDesc  = document.getElementById('stat-right-desc');
    const rightIcon  = document.getElementById('stat-right-icon');

    if (activeTab === 'bank') {
        const totalAmt    = brsRecords.reduce(function(s, r) { return s + Number(r.amount || 0); }, 0);
        const totalGst    = brsRecords.reduce(function(s, r) { return s + Number(r.gst_amount || 0); }, 0);
        const count       = brsRecords.length;
        leftTitle.textContent = 'Cleared Statement Amount'; leftValue.textContent = formatCurrency(totalAmt); leftValue.style.color = '#10B981';
        leftDesc.textContent  = count + ' reconciled transaction' + (count !== 1 ? 's' : ''); leftIcon.className = 'ti ti-checkbox'; leftIcon.style.color = '#10B981';
        midTitle.textContent  = 'Total GST Cleared'; midValue.textContent = formatCurrency(totalGst); midValue.style.color = '#2563EB';
        midDesc.textContent   = 'GST component of reconciled vouchers'; midIcon.className = 'ti ti-receipt-tax'; midIcon.style.color = '#2563EB';
        rightTitle.textContent = 'Total BRS Entries'; rightValue.textContent = count.toString(); rightValue.style.color = '#f8fafc';
        rightDesc.textContent  = 'Bank reconciliation records'; rightIcon.className = 'ti ti-database'; rightIcon.style.color = '#2563EB';

    } else if (activeTab === 'vendor') {
        const list = mockData.vendor;
        const matchedSum  = list.filter(function(i) { return i.status === 'Matched'; }).reduce(function(s, i) { return s + Number(i.ledger_amt); }, 0);
        const mismatchSum = list.filter(function(i) { return i.status !== 'Matched'; }).reduce(function(s, i) { return s + Math.abs(Number(i.stmt_amt) - Number(i.ledger_amt)); }, 0);
        leftTitle.textContent = 'Reconciled AP Volume'; leftValue.textContent = formatCurrency(matchedSum); leftValue.style.color = '#10B981';
        leftDesc.textContent = 'Purchase ledger items fully aligned'; leftIcon.className = 'ti ti-discount-check'; leftIcon.style.color = '#10B981';
        midTitle.textContent = 'Variance Discrepancies'; midValue.textContent = formatCurrency(mismatchSum); midValue.style.color = mismatchSum > 0 ? '#F59E0B' : '#f8fafc';
        midDesc.textContent = 'Variance between ledger and invoices'; midIcon.className = 'ti ti-alert-triangle'; midIcon.style.color = mismatchSum > 0 ? '#F59E0B' : '#64748b';
        rightTitle.textContent = 'Suppliers Reconciled'; rightValue.textContent = [...new Set(list.map(function(i) { return i.vendor_name; }))].length.toString(); rightValue.style.color = '#f8fafc';
        rightDesc.textContent = 'Unique vendor files audited'; rightIcon.className = 'ti ti-truck'; rightIcon.style.color = '#2563EB';

    } else if (activeTab === 'customer') {
        const list = mockData.customer;
        const matchedSum  = list.filter(function(i) { return i.status === 'Matched'; }).reduce(function(s, i) { return s + Number(i.ledger_bal); }, 0);
        const varianceSum = list.filter(function(i) { return i.status !== 'Matched'; }).reduce(function(s, i) { return s + Math.abs(Number(i.stmt_bal) - Number(i.ledger_bal)); }, 0);
        leftTitle.textContent = 'Matched Receivables'; leftValue.textContent = formatCurrency(matchedSum); leftValue.style.color = '#10B981';
        leftDesc.textContent = 'Customer accounts verified'; leftIcon.className = 'ti ti-users-group'; leftIcon.style.color = '#10B981';
        midTitle.textContent = 'Outstanding / Mismatches'; midValue.textContent = formatCurrency(varianceSum); midValue.style.color = varianceSum > 0 ? '#F59E0B' : '#f8fafc';
        midDesc.textContent = 'TDS deductions or transit checks'; midIcon.className = 'ti ti-report-money'; midIcon.style.color = varianceSum > 0 ? '#F59E0B' : '#64748b';
        rightTitle.textContent = 'Total Audited Clients'; rightValue.textContent = [...new Set(list.map(function(i) { return i.customer_name; }))].length.toString(); rightValue.style.color = '#f8fafc';
        rightDesc.textContent = 'Active sales files reviewed'; rightIcon.className = 'ti ti-briefcase'; rightIcon.style.color = '#2563EB';

    } else if (activeTab === 'gst') {
        const list = mockData.gst;
        const matchedSum     = list.filter(function(i) { return i.status === 'Matched'; }).reduce(function(s, i) { return s + Number(i.books_itc); }, 0);
        const discrepancySum = list.filter(function(i) { return i.status !== 'Matched'; }).reduce(function(s, i) { return s + Math.abs(Number(i.portal_itc) - Number(i.books_itc)); }, 0);
        leftTitle.textContent = 'Matched ITC Eligible'; leftValue.textContent = formatCurrency(matchedSum); leftValue.style.color = '#10B981';
        leftDesc.textContent = 'GSTR-2B vs internal register'; leftIcon.className = 'ti ti-circle-check'; leftIcon.style.color = '#10B981';
        midTitle.textContent = 'ITC Discrepancies'; midValue.textContent = formatCurrency(discrepancySum); midValue.style.color = discrepancySum > 0 ? '#F59E0B' : '#f8fafc';
        midDesc.textContent = 'Requires action before GST filing'; midIcon.className = 'ti ti-search-off'; midIcon.style.color = discrepancySum > 0 ? '#F59E0B' : '#64748b';
        rightTitle.textContent = 'Registered Suppliers'; rightValue.textContent = list.length.toString(); rightValue.style.color = '#f8fafc';
        rightDesc.textContent = 'Total GSTIN entities processed'; rightIcon.className = 'ti ti-file-analytics'; rightIcon.style.color = '#2563EB';

    } else if (activeTab === 'ledger') {
        const list = mockData.ledger;
        const reconciledSum = list.filter(function(i) { return i.status === 'Reconciled'; }).reduce(function(s, i) { return s + Number(i.gl_bal); }, 0);
        const varianceSum   = list.filter(function(i) { return i.status !== 'Reconciled'; }).reduce(function(s, i) { return s + Math.abs(Number(i.gl_bal) - Number(i.sl_bal)); }, 0);
        leftTitle.textContent = 'Control Accounts Matching'; leftValue.textContent = formatCurrency(reconciledSum); leftValue.style.color = '#10B981';
        leftDesc.textContent = 'General ledger in alignment'; leftIcon.className = 'ti ti-scale'; leftIcon.style.color = '#10B981';
        midTitle.textContent = 'Subledger Variance'; midValue.textContent = formatCurrency(varianceSum); midValue.style.color = varianceSum > 0 ? '#F59E0B' : 'var(--color-text-primary)';
        midDesc.textContent = 'Journal adjustment requirements'; midIcon.className = 'ti ti-git-compare'; midIcon.style.color = varianceSum > 0 ? '#F59E0B' : 'var(--color-text-muted)';
        rightTitle.textContent = 'Subledgers Reconciled'; rightValue.textContent = list.length.toString(); rightValue.style.color = 'var(--color-text-primary)';
        rightDesc.textContent = 'Control subledgers audited'; rightIcon.className = 'ti ti-layers-difference'; rightIcon.style.color = '#2563EB';
    }
}

/* ------------------------------------------------------------------ */
/*  Table rendering                                                     */
/* ------------------------------------------------------------------ */
var TH_S  = 'padding:14px 20px;text-align:left;font-weight:600;color:var(--color-text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em;';
var THR_S = 'padding:14px 20px;text-align:right;font-weight:600;color:var(--color-text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em;';
var TD_S  = 'padding:14px 20px;';

function renderTable() {
    const titleEl = document.getElementById('recon-table-title');
    const thead   = document.getElementById('recon-table-thead');
    const tbody   = document.getElementById('recon-table-tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    /* -- BRS tab: live DB data -- */
    if (activeTab === 'bank') {
        titleEl.innerHTML = '<i class="ti ti-building-bank"></i> Bank Reconciliation Statement (BRS) \u2013 Cleared Transactions';
        thead.innerHTML = '<tr style="border-bottom:1px solid var(--color-border);">' +
            '<th style="' + TH_S + '">Txn ID</th>' +
            '<th style="' + TH_S + '">Voucher No.</th>' +
            '<th style="' + TH_S + '">Description</th>' +
            '<th style="' + THR_S + '">Statement Amount</th>' +
            '<th style="' + THR_S + '">GST Amount</th>' +
            '<th style="' + THR_S + '">Total Cleared</th>' +
            '<th style="' + TH_S + '">Status</th>' +
            '<th style="' + TH_S + '">Actions</th>' +
            '</tr>';

        if (brsRecords.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="padding:28px;text-align:center;color:var(--color-text-muted);">No BRS records yet. Reconcile a bank statement with a voucher to create entries automatically.</td></tr>';
            return;
        }

        brsRecords.forEach(function(r) {
            const total = Number(r.amount || 0) + Number(r.gst_amount || 0);
            const tr = document.createElement('tr');
            tr.style.cssText = 'border-bottom:1px solid var(--color-border);transition:background .2s;';
            tr.onmouseenter = function() { tr.style.background = 'rgba(118,159,205,0.07)'; };
            tr.onmouseleave = function() { tr.style.background = ''; };
            tr.innerHTML =
                '<td style="' + TD_S + 'color:#38bdf8;font-family:monospace;font-weight:600;">#' + r.transaction_id + '</td>' +
                '<td style="' + TD_S + 'color:#a78bfa;font-family:monospace;font-weight:600;">' + (r.voucher_no || '\u2014') + '</td>' +
                '<td style="' + TD_S + 'color:var(--color-text-secondary);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + (r.description || '') + '">' + (r.description || '\u2014') + '</td>' +
                '<td style="' + TD_S + 'text-align:right;color:var(--color-text-primary);">' + formatCurrency(r.amount) + '</td>' +
                '<td style="' + TD_S + 'text-align:right;color:#2563EB;">' + formatCurrency(r.gst_amount) + '</td>' +
                '<td style="' + TD_S + 'text-align:right;font-weight:700;color:#10B981;">' + formatCurrency(total) + '</td>' +
                '<td style="' + TD_S + '">' + getStatusBadge('Cleared') + '</td>' +
                '<td style="' + TD_S + 'text-align:right;position:relative;">' +
                    '<button onclick="event.stopPropagation(); toggleBRSDropdown(event,' + r.id + ')" ' +
                        'style="background:none;border:none;color:var(--color-text-secondary);cursor:pointer;font-size:16px;padding:4px;border-radius:4px;">' +
                        '<i class="ti ti-dots-vertical"></i></button>' +
                    '<div class="brs-dropdown" id="brs-dd-' + r.id + '" ' +
                        'style="position:absolute;right:16px;top:100%;z-index:200;background:rgba(17,27,48,0.98);' +
                               'border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:6px;min-width:130px;' +
                               'box-shadow:0 8px 32px rgba(0,0,0,0.4);">' +
                        '<div onclick="triggerRemoveBRS(' + r.id + ')" ' +
                            'style="padding:8px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;' +
                                   'color:#f87171;display:flex;align-items:center;gap:8px;" ' +
                            'onmouseenter="this.style.background=\'rgba(248,113,113,0.1)\'" ' +
                            'onmouseleave="this.style.background=\'\'">' +
                            '<i class="ti ti-trash"></i> Remove' +
                        '</div>' +
                    '</div>' +
                '</td>';
            tbody.appendChild(tr);
        });
        return;
    }

    /* -- Vendor tab -- */
    if (activeTab === 'vendor') {
        titleEl.innerHTML = '<i class="ti ti-truck-delivery"></i> Vendor Reconciliation \u2013 AP Ledger vs Statements';
        thead.innerHTML = '<tr style="border-bottom:1px solid rgba(255,255,255,0.09);">' +
            '<th style="' + TH_S + '">Vendor Name</th><th style="' + TH_S + '">Invoice Details</th><th style="' + TH_S + '">Invoice Date</th>' +
            '<th style="' + THR_S + '">Statement Amt</th><th style="' + THR_S + '">Ledger Amt</th><th style="' + THR_S + '">Difference</th>' +
            '<th style="' + TH_S + '">Status</th><th style="' + TH_S + '">Remarks</th></tr>';
        mockData.vendor.forEach(function(item) {
            const diff = Number(item.stmt_amt) - Number(item.ledger_amt);
            const diffColor = diff === 0 ? '#10B981' : '#F59E0B';
            const tr = document.createElement('tr');
            tr.style.cssText = 'border-bottom:1px solid var(--color-border);transition:background .2s;';
            tr.onmouseenter = function() { tr.style.background = 'rgba(118,159,205,0.07)'; };
            tr.onmouseleave = function() { tr.style.background = ''; };
            tr.innerHTML = '<td style="' + TD_S + 'color:var(--color-text-primary);font-weight:500;">' + item.vendor_name + '</td>' +
                '<td style="' + TD_S + 'font-family:monospace;color:#2563EB;font-weight:600;">' + item.invoice_no + '</td>' +
                '<td style="' + TD_S + 'color:var(--color-text-secondary);">' + displayDate(item.date) + '</td>' +
                '<td style="' + TD_S + 'text-align:right;color:var(--color-text-primary);">' + formatCurrency(item.stmt_amt) + '</td>' +
                '<td style="' + TD_S + 'text-align:right;color:var(--color-text-primary);">' + formatCurrency(item.ledger_amt) + '</td>' +
                '<td style="' + TD_S + 'text-align:right;font-weight:700;color:' + diffColor + ';">' + formatCurrency(diff) + '</td>' +
                '<td style="' + TD_S + '">' + getStatusBadge(item.status) + '</td>' +
                '<td style="' + TD_S + 'color:var(--color-text-secondary);">' + (item.remarks || '\u2014') + '</td>';
            tbody.appendChild(tr);
        });

    /* -- Customer tab -- */
    } else if (activeTab === 'customer') {
        titleEl.innerHTML = '<i class="ti ti-users"></i> Customer Reconciliation \u2013 AR Ledger vs Client Statements';
        thead.innerHTML = '<tr style="border-bottom:1px solid rgba(255,255,255,0.09);">' +
            '<th style="' + TH_S + '">Customer Name</th><th style="' + TH_S + '">Doc Reference</th><th style="' + TH_S + '">Transaction Date</th>' +
            '<th style="' + THR_S + '">Client Stmt Bal</th><th style="' + THR_S + '">Internal Ledger Bal</th><th style="' + THR_S + '">Difference</th>' +
            '<th style="' + TH_S + '">Status</th><th style="' + TH_S + '">Remarks</th></tr>';
        mockData.customer.forEach(function(item) {
            const diff = Number(item.stmt_bal) - Number(item.ledger_bal);
            const diffColor = diff === 0 ? '#10B981' : '#F59E0B';
            const tr = document.createElement('tr');
            tr.style.cssText = 'border-bottom:1px solid var(--color-border);transition:background .2s;';
            tr.onmouseenter = function() { tr.style.background = 'rgba(118,159,205,0.07)'; };
            tr.onmouseleave = function() { tr.style.background = ''; };
            tr.innerHTML = '<td style="' + TD_S + 'color:var(--color-text-primary);font-weight:500;">' + item.customer_name + '</td>' +
                '<td style="' + TD_S + 'font-family:monospace;color:#2563EB;font-weight:600;">' + item.document_ref + '</td>' +
                '<td style="' + TD_S + 'color:var(--color-text-secondary);">' + displayDate(item.date) + '</td>' +
                '<td style="' + TD_S + 'text-align:right;color:var(--color-text-primary);">' + formatCurrency(item.stmt_bal) + '</td>' +
                '<td style="' + TD_S + 'text-align:right;color:var(--color-text-primary);">' + formatCurrency(item.ledger_bal) + '</td>' +
                '<td style="' + TD_S + 'text-align:right;font-weight:700;color:' + diffColor + ';">' + formatCurrency(diff) + '</td>' +
                '<td style="' + TD_S + '">' + getStatusBadge(item.status) + '</td>' +
                '<td style="' + TD_S + 'color:var(--color-text-secondary);">' + (item.remarks || '\u2014') + '</td>';
            tbody.appendChild(tr);
        });

    /* -- GST tab -- */
    } else if (activeTab === 'gst') {
        titleEl.innerHTML = '<i class="ti ti-file-text"></i> GST Reconciliation \u2013 GSTR-2B Portal vs Purchase Register';
        thead.innerHTML = '<tr style="border-bottom:1px solid rgba(255,255,255,0.09);">' +
            '<th style="' + TH_S + '">Supplier GSTIN</th><th style="' + TH_S + '">Supplier Name</th>' +
            '<th style="' + THR_S + '">GSTR-2B ITC</th><th style="' + THR_S + '">Books ITC</th><th style="' + THR_S + '">Difference</th>' +
            '<th style="' + TH_S + '">Status</th><th style="' + TH_S + '">ITC Eligibility</th></tr>';
        mockData.gst.forEach(function(item) {
            const diff = Number(item.portal_itc) - Number(item.books_itc);
            const diffColor = diff === 0 ? '#10B981' : '#F59E0B';
            const tr = document.createElement('tr');
            tr.style.cssText = 'border-bottom:1px solid var(--color-border);transition:background .2s;';
            tr.onmouseenter = function() { tr.style.background = 'rgba(118,159,205,0.07)'; };
            tr.onmouseleave = function() { tr.style.background = ''; };
            tr.innerHTML = '<td style="' + TD_S + 'font-family:monospace;color:#2563EB;">' + item.gstin + '</td>' +
                '<td style="' + TD_S + 'color:var(--color-text-primary);font-weight:500;">' + item.supplier_name + '</td>' +
                '<td style="' + TD_S + 'text-align:right;color:var(--color-text-primary);">' + formatCurrency(item.portal_itc) + '</td>' +
                '<td style="' + TD_S + 'text-align:right;color:var(--color-text-primary);">' + formatCurrency(item.books_itc) + '</td>' +
                '<td style="' + TD_S + 'text-align:right;font-weight:700;color:' + diffColor + ';">' + formatCurrency(diff) + '</td>' +
                '<td style="' + TD_S + '">' + getStatusBadge(item.status) + '</td>' +
                '<td style="' + TD_S + '">' + getStatusBadge(item.eligibility) + '</td>';
            tbody.appendChild(tr);
        });

    /* -- Ledger tab -- */
    } else if (activeTab === 'ledger') {
        titleEl.innerHTML = '<i class="ti ti-notebook"></i> Ledger Reconciliation \u2013 General Ledger vs Sub-Ledger Accounts';
        thead.innerHTML = '<tr style="border-bottom:1px solid rgba(255,255,255,0.09);">' +
            '<th style="' + TH_S + '">Account/Subledger</th><th style="' + TH_S + '">Voucher Ref</th><th style="' + TH_S + '">As of Date</th>' +
            '<th style="' + THR_S + '">General Ledger Bal</th><th style="' + THR_S + '">Subledger Bal</th><th style="' + THR_S + '">Variance</th>' +
            '<th style="' + TH_S + '">Status</th><th style="' + TH_S + '">Remarks</th></tr>';
        mockData.ledger.forEach(function(item) {
            const diff = Number(item.gl_bal) - Number(item.sl_bal);
            const diffColor = diff === 0 ? '#10B981' : '#F59E0B';
            const tr = document.createElement('tr');
            tr.style.cssText = 'border-bottom:1px solid var(--color-border);transition:background .2s;';
            tr.onmouseenter = function() { tr.style.background = 'rgba(118,159,205,0.07)'; };
            tr.onmouseleave = function() { tr.style.background = ''; };
            tr.innerHTML = '<td style="' + TD_S + 'color:var(--color-text-primary);font-weight:500;">' + item.ledger_name + '</td>' +
                '<td style="' + TD_S + 'font-family:monospace;color:#2563EB;font-weight:600;">' + item.reference + '</td>' +
                '<td style="' + TD_S + 'color:var(--color-text-secondary);">' + displayDate(item.date) + '</td>' +
                '<td style="' + TD_S + 'text-align:right;color:var(--color-text-primary);">' + formatCurrency(item.gl_bal) + '</td>' +
                '<td style="' + TD_S + 'text-align:right;color:var(--color-text-primary);">' + formatCurrency(item.sl_bal) + '</td>' +
                '<td style="' + TD_S + 'text-align:right;font-weight:700;color:' + diffColor + ';">' + formatCurrency(diff) + '</td>' +
                '<td style="' + TD_S + '">' + getStatusBadge(item.status) + '</td>' +
                '<td style="' + TD_S + 'color:var(--color-text-secondary);">' + (item.remarks || '\u2014') + '</td>';
            tbody.appendChild(tr);
        });
    }
}

/* ------------------------------------------------------------------ */
/*  Inject dropdown CSS                                                 */
/* ------------------------------------------------------------------ */
(function() {
    var s = document.createElement('style');
    s.textContent = '.brs-dropdown { display:none !important; } .brs-dropdown.show { display:block !important; }';
    document.head.appendChild(s);
})();

/* ------------------------------------------------------------------ */
/*  Tabs & Init                                                         */
/* ------------------------------------------------------------------ */
function switchTab(tabId) {
    activeTab = tabId;
    document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    if (tabId === 'bank') {
        loadBRS();
    } else {
        renderTable();
        renderMetrics();
    }
}

document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { switchTab(btn.getAttribute('data-tab')); });
});

switchTab('bank');
