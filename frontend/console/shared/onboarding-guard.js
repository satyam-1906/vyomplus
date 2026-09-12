(function() {
    // 1. Fetch onboarding status from server
    async function checkOnboardingStatus() {
        const currentPath = window.location.pathname;
        // Don't guard onboarding or login routes to avoid infinite redirection loops
        if (currentPath.includes("loginNAuth") || currentPath.includes("onboarding")) {
            return;
        }

        const token = getCookie("session_token");
        if (!token) {
            window.location.href = "/frontend/loginNAuth/login.html";
            return;
        }

        try {
            const response = await fetch("http://localhost:8000/onboarding/status", {
                credentials: "include",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                if (!data.onboarding_complete) {
                    injectWarningStrip();
                    restrictNavigation(currentPath);
                }
            } else if (response.status === 401) {
                window.location.href = "/frontend/loginNAuth/login.html";
            }
        } catch (e) {
            console.error("VyomPlus Onboarding Guard Check Failed", e);
        }
    }

    function injectWarningStrip() {
        if (document.getElementById("onboarding-warn-strip")) return;
        const strip = document.createElement("div");
        strip.id = "onboarding-warn-strip";
        strip.style.cssText = `
            background-color: #F59E0B;
            color: #000;
            padding: 10px 20px;
            font-size: 14px;
            font-weight: 600;
            text-align: center;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            z-index: 10000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 15px;
        `;
        strip.innerHTML = `
            <span>⚠️ Complete your compliance profile to unlock all features in VyomPlus.</span>
            <button onclick="window.location.href='/frontend/onboarding/onboarding.html'" style="
                background: #000;
                color: #fff;
                border: none;
                padding: 6px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 700;
            ">Complete Profile Now</button>
        `;
        document.body.appendChild(strip);
        document.body.style.paddingTop = "40px";
    }

    function restrictNavigation(currentPath) {
        // Only inventory page is allowed if onboarding is incomplete
        if (!currentPath.includes("inventory.html") && !currentPath.includes("profile.html")) {
            showOverlayModal();
        }
    }

    function showOverlayModal() {
        if (document.getElementById("onboarding-overlay-modal")) return;
        const modal = document.createElement("div");
        modal.id = "onboarding-overlay-modal";
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(9, 14, 26, 0.85);
            backdrop-filter: blur(8px);
            z-index: 9999;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        modal.innerHTML = `
            <div style="
                background: #111827;
                border: 1px solid rgba(255,255,255,0.09);
                border-radius: 12px;
                padding: 32px;
                width: 90%;
                max-width: 450px;
                text-align: center;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                color: #f8fafc;
            ">
                <i class="ti ti-lock" style="font-size: 48px; color: #F59E0B; display: block; margin-bottom: 16px;"></i>
                <h3 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">Compliance Profile Required</h3>
                <p style="font-size: 14px; color: #94a3b8; margin-bottom: 24px; line-height: 1.5;">
                    To comply with taxation rules, accessing this dashboard segment requires completing your VyomPlus onboarding wizard.
                </p>
                <button onclick="window.location.href='/frontend/onboarding/onboarding.html'" style="
                    background: #2563EB;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    width: 100%;
                    box-shadow: 0 4px 12px rgba(37,99,235,0.2);
                ">Go to Onboarding Profile</button>
            </div>
        `;
        document.body.appendChild(modal);
    }

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    }

    window.addEventListener("load", checkOnboardingStatus);
})();
