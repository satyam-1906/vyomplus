/* ================================================
   GST Ledger Hub – Shared Notification System
   showToast(message, type)  → in-page toast
   logNotification(detail)   → POST to backend
   Bell icon dropdown        → fetches latest logs
   ================================================ */

(function () {
    const API_BASE = 'https://vyomplus.onrender.com';

    /* ---------- Toast Container ---------- */
    let toastContainer = null;
    function getToastContainer() {
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            document.body.appendChild(toastContainer);
        }
        return toastContainer;
    }

    /* ---------- showToast ---------- */
    window.showToast = function (message, type = 'info') {
        const container = getToastContainer();
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = { success: 'ti-circle-check', error: 'ti-circle-x', warning: 'ti-alert-triangle', info: 'ti-info-circle' };
        const icon = icons[type] || icons.info;

        toast.innerHTML = `
            <i class="ti ${icon} toast-icon"></i>
            <span class="toast-message">${message}</span>
            <button class="toast-close" onclick="this.parentElement.remove()"><i class="ti ti-x"></i></button>
        `;

        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => { requestAnimationFrame(() => { toast.classList.add('toast-show'); }); });

        // Auto-dismiss after 3 s
        setTimeout(() => {
            toast.classList.remove('toast-show');
            toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        }, 3000);
    };

    /* ---------- logNotification ---------- */
    window.logNotification = async function (detail) {
        try {
            await fetch(`${API_BASE}/notification-log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ detail })
            });
            // Refresh badge if bell is present
            if (typeof refreshBell === 'function') refreshBell();
        } catch (_) { /* silently ignore log failures */ }
    };

    /* ---------- notify (show + log combined) ---------- */
    window.notify = function (message, type = 'info') {
        showToast(message, type);
        logNotification(message);
    };

    /* ---------- Bell Dropdown ---------- */
    function buildBell() {
        const topbarRight = document.querySelector('.topbar-right');
        if (!topbarRight) return;

        // Insert bell before other buttons
        const bellWrapper = document.createElement('div');
        bellWrapper.id = 'notif-bell-wrapper';
        bellWrapper.innerHTML = `
            <button id="notif-bell-btn" class="notif-bell-btn" title="Notifications" aria-label="Notifications">
                <i class="ti ti-bell"></i>
                <span id="notif-badge" class="notif-badge" style="display:none">0</span>
            </button>
            <div id="notif-dropdown" class="notif-dropdown" role="menu" aria-label="Notifications">
                <div class="notif-dropdown-header">
                    <span class="notif-dropdown-title"><i class="ti ti-bell-ringing"></i> Notifications</span>
                    <button class="notif-clear-btn" id="notif-clear-btn" title="Clear all">Clear all</button>
                </div>
                <div id="notif-list" class="notif-list">
                    <div class="notif-empty"><i class="ti ti-bell-off"></i><span>No notifications yet</span></div>
                </div>
            </div>
        `;

        topbarRight.insertBefore(bellWrapper, topbarRight.firstChild);

        const btn = document.getElementById('notif-bell-btn');
        const dropdown = document.getElementById('notif-dropdown');

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.classList.contains('open');
            dropdown.classList.toggle('open', !isOpen);
            if (!isOpen) refreshBell();
        });

        document.addEventListener('click', (e) => {
            if (!bellWrapper.contains(e.target)) {
                dropdown.classList.remove('open');
            }
        });

        document.getElementById('notif-clear-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            document.getElementById('notif-list').innerHTML = '<div class="notif-empty"><i class="ti ti-bell-off"></i><span>No notifications yet</span></div>';
            const badge = document.getElementById('notif-badge');
            badge.style.display = 'none';
        });
    }

    window.refreshBell = async function () {
        const list = document.getElementById('notif-list');
        const badge = document.getElementById('notif-badge');
        if (!list) return;

        try {
            const res = await fetch(`${API_BASE}/notification-log`);
            if (!res.ok) return;
            const logs = await res.json();

            if (!logs || logs.length === 0) {
                list.innerHTML = '<div class="notif-empty"><i class="ti ti-bell-off"></i><span>No notifications yet</span></div>';
                if (badge) badge.style.display = 'none';
                return;
            }

            // Show badge with count
            if (badge) {
                badge.textContent = logs.length > 99 ? '99+' : logs.length;
                badge.style.display = 'flex';
            }

            list.innerHTML = logs.slice(0, 50).map(log => {
                const dt = log.created_at ? new Date(log.created_at) : null;
                const timeStr = dt ? dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '';
                return `
                    <div class="notif-item">
                        <div class="notif-item-icon"><i class="ti ti-bell"></i></div>
                        <div class="notif-item-body">
                            <div class="notif-item-detail">${log.detail || ''}</div>
                            <div class="notif-item-time">${timeStr}</div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (_) {
            list.innerHTML = '<div class="notif-empty"><i class="ti ti-wifi-off"></i><span>Failed to load</span></div>';
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        buildBell();
        refreshBell();
    });
})();
