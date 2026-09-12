const API_BASE = 'https://vyomplus.onrender.com';

let allVouchers = [];
let purchaseVouchers = [];

function formatCurrency(num) {
    return '₹' + Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function displayDate(raw) {
    if (!raw) return '—';
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return raw;
}

function getStatusBadge(status) {
    const clean = (status || '').trim().toLowerCase();
    let color = '#94a3b8';
    let text = status || 'Pending';
    
    if (clean === 'cleared' || clean === 'verified' || clean === 'reconciled') {
        color = '#10B981';
        text = '✓ Reconciled';
    } else if (clean === 'pending') {
        color = '#F59E0B';
        text = '⚠ Pending';
    }
    return `<span style="color:${color}; font-weight:600; font-size:12px;">${text}</span>`;
}

// Fetch and load data
async function loadITCData() {
    const tbody = document.getElementById('voucher-tbody');
    try {
        const res = await fetch(`${API_BASE}/vouchers`);
        if (!res.ok) throw new Error('Network response was not ok');
        allVouchers = await res.json();
        
        // Filter for purchase vouchers
        purchaseVouchers = allVouchers.filter(v => v.voucher_type && v.voucher_type.toLowerCase() === 'purchase');
        
        calculateMetrics();
        renderTable();
        
        if (typeof showToast === 'function') {
            showToast('Input Tax Credit metrics and purchase vouchers loaded successfully', 'success');
        }
    } catch (err) {
        console.error('Failed to load ITC data:', err);
        tbody.innerHTML = `<tr><td colspan="6" style="padding:28px; text-align:center; color:#EF4444;">Failed to load data from backend server. Make sure the API is running.</td></tr>`;
        if (typeof showToast === 'function') {
            showToast('Failed to connect to backend server', 'error');
        }
    }
}

function calculateMetrics() {
    let totalClaimable = 0;
    let totalClaimed = 0;
    
    purchaseVouchers.forEach(v => {
        const gst = parseFloat(v.gst_amount) || 0;
        totalClaimable += gst;
        if (v.status && v.status.toLowerCase() === 'cleared') {
            totalClaimed += gst;
        }
    });
    
    const totalRemaining = totalClaimable - totalClaimed;
    
    document.getElementById('stat-claimable').textContent = formatCurrency(totalClaimable);
    document.getElementById('stat-claimed').textContent = formatCurrency(totalClaimed);
    document.getElementById('stat-remaining').textContent = formatCurrency(totalRemaining);
}

function renderTable() {
    const tbody = document.getElementById('voucher-tbody');
    const query = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('filter-status')?.value || 'all';
    
    const filtered = purchaseVouchers.filter(v => {
        // Status filter
        const isReconciled = v.status && v.status.toLowerCase() === 'cleared';
        if (statusFilter === 'cleared' && !isReconciled) return false;
        if (statusFilter === 'pending' && isReconciled) return false;
        
        // Search query filter
        const party = (v.party || '').toLowerCase();
        const voucherNo = (v.voucher_no || '').toLowerCase();
        return party.includes(query) || voucherNo.includes(query);
    });
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:28px; text-align:center; color:var(--color-text-muted);">No matching purchase vouchers found.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = filtered.map(v => {
        return `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.06); transition:background .2s;" onmouseenter="this.style.background='rgba(118,159,205,0.05)'" onmouseleave="this.style.background=''">
                <td style="padding:14px 20px; color:#2563EB; font-weight:600; font-family:monospace;">${v.voucher_no}</td>
                <td style="padding:14px 20px; color:var(--color-text-secondary);">${displayDate(v.date)}</td>
                <td style="padding:14px 20px; color:var(--color-text-primary); font-weight:500;">${v.party}</td>
                <td style="padding:14px 20px; text-align:right; font-weight:700; color:var(--color-text-primary);">${formatCurrency(v.amount)}</td>
                <td style="padding:14px 20px; text-align:right; color:#2563EB; font-weight:600;">${formatCurrency(v.gst_amount)}</td>
                <td style="padding:14px 20px;">${getStatusBadge(v.status)}</td>
            </tr>
        `;
    }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    loadITCData();
    
    document.getElementById('search-input').addEventListener('input', renderTable);
    document.getElementById('filter-status').addEventListener('change', renderTable);
});
