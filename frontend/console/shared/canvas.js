/* =========================================================
   VYOM+ Shared Neo-Fintech Canvas & 3D Tilt Motion Engine
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    // 1. Ensure canvas element exists
    let canvas = document.getElementById("bg-canvas");
    if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.id = "bg-canvas";
        document.body.prepend(canvas);
    }

    const ctx = canvas.getContext("2d");

    let w = canvas.width = window.innerWidth;
    let h = canvas.height = window.innerHeight;

    window.addEventListener("resize", () => {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
        initNodes();
    });

    let mouseX = w / 2;
    let mouseY = h / 2;

    window.addEventListener("mousemove", (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    // Financial Node Network Simulation
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

        // Radial background glow follows cursor
        let gradient = ctx.createRadialGradient(mouseX, mouseY, 50, w / 2, h / 2, Math.max(w, h));
        gradient.addColorStop(0, bg1);
        gradient.addColorStop(1, bg2);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);

        // Draw node network
        for (let i = 0; i < nodes.length; i++) {
            let n = nodes[i];
            n.x += n.vx;
            n.y += n.vy;

            if (n.x < 0 || n.x > w) n.vx *= -1;
            if (n.y < 0 || n.y > h) n.vy *= -1;

            // Magnetic attraction force towards mouse
            let dx = mouseX - n.x;
            let dy = mouseY - n.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 180) {
                n.x += (dx / dist) * 0.4;
                n.y += (dy / dist) * 0.4;
            }

            // Draw Node Point
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
            ctx.fillStyle = accentColor;
            ctx.globalAlpha = 0.35;
            ctx.fill();

            // Connect nearby nodes
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

    // 2. Attach 3D Card Hover Physics to elements with class `.tilt-card`
    function setupTiltCards() {
        const tiltCards = document.querySelectorAll('.tilt-card, .dashboard-card, .metric-card, .bento-card');
        tiltCards.forEach(card => {
            if (card.dataset.tiltInitialized) return;
            card.dataset.tiltInitialized = "true";

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
    setupTiltCards();
});
