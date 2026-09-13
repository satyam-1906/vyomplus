/* ==============================================
   GST Ledger Hub - Shared Sidebar JS
   Handles: toggle, active state, background anim,
            theme toggle injection
   ============================================== */

(function () {
    // Sidebar toggle logic
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');
    const COLLAPSED_KEY = 'sidebar_collapsed';

    function applyCollapsedState(collapsed) {
        if (collapsed) {
            sidebar.classList.add('collapsed');
            document.body.classList.add('sidebar-collapsed');
        } else {
            sidebar.classList.remove('collapsed');
            document.body.classList.remove('sidebar-collapsed');
        }
        const icon = toggleBtn ? toggleBtn.querySelector('i') : null;
        if (icon) {
            icon.className = collapsed ? 'ti ti-chevron-right' : 'ti ti-chevron-left';
        }
    }

    // Restore from localStorage
    const savedState = localStorage.getItem(COLLAPSED_KEY) === 'true';
    applyCollapsedState(savedState);

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const isCollapsed = sidebar.classList.contains('collapsed');
            const newState = !isCollapsed;
            applyCollapsedState(newState);
            localStorage.setItem(COLLAPSED_KEY, String(newState));
        });
    }

    // Inject theme toggle button into topbar-right or top-right corner
    const topbarRight = document.querySelector('.console-topbar .topbar-right');
    const currentTheme = localStorage.getItem('gst_theme') || 'dark';
    
    const themeBtn = document.createElement('button');
    themeBtn.className = 'topbar-theme-toggle-btn theme-toggle-btn';
    themeBtn.id = 'topbar-theme-toggle';
    themeBtn.innerHTML = `<i class="${currentTheme === 'light' ? 'ti ti-moon' : 'ti ti-sun'}"></i>`;
    themeBtn.title = currentTheme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode';
    // Click event is handled globally via delegation in theme.js

    if (topbarRight) {
        // Insert as first item in topbar actions
        topbarRight.insertBefore(themeBtn, topbarRight.firstChild);
    } else {
        // Fallback to top-right floating corner if topbar doesn't exist
        themeBtn.classList.add('floating-theme-toggle');
        document.body.appendChild(themeBtn);
    }

    // Mobile overlay toggle
    const mobileToggle = document.getElementById('mobile-sidebar-toggle');
    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
        });
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (sidebar.classList.contains('mobile-open') &&
                !sidebar.contains(e.target) &&
                e.target !== mobileToggle) {
                sidebar.classList.remove('mobile-open');
            }
        });
    }

    // Mark active nav item based on current page
    const currentPath = window.location.pathname;
    const navItems = document.querySelectorAll('.nav-item[href], .nav-sub-item[href]');
    navItems.forEach(item => {
        const href = item.getAttribute('href');
        if (href && currentPath.endsWith(href.split('/').pop())) {
            item.classList.add('active');
        }
    });

    // Background Canvas Animation (Interactive Financial Node Network)
    function initDynamicBackground() {
        let canvas = document.getElementById('bg-canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'bg-canvas';
            document.body.prepend(canvas);
        }
        const ctx = canvas.getContext('2d');

        let w = canvas.width = window.innerWidth;
        let h = canvas.height = window.innerHeight;

        window.addEventListener('resize', () => {
            w = canvas.width = window.innerWidth;
            h = canvas.height = window.innerHeight;
            initNodes();
        });

        let mouseX = w / 2;
        let mouseY = h / 2;

        window.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });

        let nodes = [];
        function initNodes() {
            nodes = [];
            const count = Math.floor((w * h) / 20000);
            for (let i = 0; i < count; i++) {
                nodes.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    vx: (Math.random() - 0.5) * 0.7,
                    vy: (Math.random() - 0.5) * 0.7,
                    radius: Math.random() * 2 + 1.5
                });
            }
        }
        initNodes();

        function animateCanvas() {
            ctx.clearRect(0, 0, w, h);

            const style = getComputedStyle(document.documentElement);
            const bg1 = style.getPropertyValue('--color-canvas-bg-1').trim() || '#0a2119';
            const bg2 = style.getPropertyValue('--color-canvas-bg-2').trim() || '#06140f';
            const accentColor = style.getPropertyValue('--color-accent').trim() || '#7cd5b1';

            let gradient = ctx.createRadialGradient(mouseX, mouseY, 50, w / 2, h / 2, Math.max(w, h));
            gradient.addColorStop(0, bg1);
            gradient.addColorStop(1, bg2);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, w, h);

            for (let i = 0; i < nodes.length; i++) {
                let n = nodes[i];
                n.x += n.vx;
                n.y += n.vy;

                if (n.x < 0 || n.x > w) n.vx *= -1;
                if (n.y < 0 || n.y > h) n.vy *= -1;

                let dx = mouseX - n.x;
                let dy = mouseY - n.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 180) {
                    n.x += (dx / dist) * 0.4;
                    n.y += (dy / dist) * 0.4;
                }

                ctx.beginPath();
                ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
                ctx.fillStyle = accentColor;
                ctx.globalAlpha = 0.35;
                ctx.fill();

                for (let j = i + 1; j < nodes.length; j++) {
                    let n2 = nodes[j];
                    let ndx = n.x - n2.x;
                    let ndy = n.y - n2.y;
                    let ndist = Math.sqrt(ndx * ndx + ndy * ndy);
                    if (ndist < 140) {
                        ctx.beginPath();
                        ctx.moveTo(n.x, n.y);
                        ctx.lineTo(n2.x, n2.y);
                        ctx.strokeStyle = accentColor;
                        ctx.globalAlpha = (1 - ndist / 140) * 0.16;
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }
                }
            }
            ctx.globalAlpha = 1.0;

            requestAnimationFrame(animateCanvas);
        }
        animateCanvas();

        // 3D Card Physics
        const tiltCards = document.querySelectorAll('.dashboard-card, .metric-card, .bento-card, .card');
        tiltCards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                const rotateX = ((y - centerY) / centerY) * -5;
                const rotateY = ((x - centerX) / centerX) * 5;

                card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)';
            });
        });
    }

    document.addEventListener('DOMContentLoaded', initDynamicBackground);
})();
