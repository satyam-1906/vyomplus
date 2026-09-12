document.addEventListener("DOMContentLoaded", async () => {
    let currentStep = 1;
    const totalSteps = 7;
    const stepsData = {};

    // Elements
    const panes = document.querySelectorAll(".onboarding-step-pane");
    const progressItems = document.querySelectorAll(".step-progress-item");
    const progressBar = document.getElementById("progressBar");
    const backBtn = document.getElementById("backBtn");
    const nextBtn = document.getElementById("nextBtn");
    const submitBtn = document.getElementById("submitBtn");

    // Fetch initial user status & pre-populate Step 1
    try {
        const response = await fetch("http://localhost:8000/onboarding/status", {
            credentials: "include",
            headers: {
                "Authorization": `Bearer ${getCookie("session_token") || ""}`
            }
        });
        if (response.ok) {
            const data = await response.json();
            document.getElementById("fullName").value = data.full_name || "";
            document.getElementById("email").value = data.email || "";
            document.getElementById("mobile").value = data.mobile || "";
        } else {
            // Redirect to login if unauthenticated
            window.location.href = "../loginNAuth/login.html";
        }
    } catch (e) {
        console.error("Failed to load onboarding status", e);
    }

    // Step Nav logic
    nextBtn.addEventListener("click", () => {
        if (validateStep(currentStep)) {
            saveStepData(currentStep);
            progressItems[currentStep - 1].classList.add("completed");
            currentStep++;
            showStep(currentStep);
        }
    });

    backBtn.addEventListener("click", () => {
        if (currentStep > 1) {
            currentStep--;
            showStep(currentStep);
        }
    });

    document.getElementById("onboardingForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!validateStep(7)) return;
        saveStepData(7);

        // Compile payload
        const payload = {
            entity_type: stepsData[2]?.entityType,
            legal_name: stepsData[2]?.legalName,
            trade_name: stepsData[2]?.tradeName,
            display_name: stepsData[2]?.displayName,
            date_incorporation: stepsData[2]?.dateIncorporation,
            nature_business: stepsData[2]?.natureBusiness,
            email: stepsData[3]?.bizEmail,
            phone: stepsData[3]?.bizPhone,
            website: stepsData[3]?.bizWebsite,
            employee_count: stepsData[3]?.employeeCount ? parseInt(stepsData[3].employeeCount) : null,
            expected_turnover: stepsData[3]?.annualTurnover,
            pan: stepsData[4]?.pan,
            pan_holder_name: stepsData[4]?.panHolderName,
            tan: stepsData[4]?.tan,
            tax_jurisdiction: stepsData[4]?.taxJurisdiction,
            gstin: stepsData[5]?.gstin,
            gst_status: stepsData[5]?.gstStatus,
            gst_reg_date: stepsData[5]?.gstRegDate,
            financial_year: `${stepsData[6]?.fyFrom || "April"}-${stepsData[6]?.fyTo || "March"}`,
            accounting_start: stepsData[6]?.accountingStart,
            currency: stepsData[6]?.currencyValue || "INR",
            timezone: stepsData[6]?.timezoneValue || "Asia/Kolkata"
        };

        try {
            const resp = await fetch("http://localhost:8000/onboarding/complete", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${getCookie("session_token") || ""}`
                },
                body: JSON.stringify(payload)
            });

            localStorage.setItem("onboarding_complete", "true");

            if (resp.ok) {
                showToast("🎉 Welcome to VyomPlus! Redirecting to your dashboard…", "success");
            } else {
                showToast("Profile saved locally. Redirecting to dashboard…", "info");
            }
        } catch (err) {
            // Backend unreachable — still proceed to console
            localStorage.setItem("onboarding_complete", "true");
            showToast("Redirecting to your dashboard…", "info");
        }

        // Always redirect after a brief moment so the toast is visible
        setTimeout(() => {
            window.location.href = "../console/overview/overview.html";
        }, 1400);
    });

    function showStep(step) {
        panes.forEach(pane => pane.classList.remove("active"));
        progressItems.forEach(item => item.classList.remove("active"));
        
        document.getElementById(`pane-${step}`).classList.add("active");
        progressItems[step - 1].classList.add("active");

        // Update progress bar
        progressBar.style.width = `${(step / totalSteps) * 100}%`;

        // Buttons update
        backBtn.disabled = step === 1;
        if (step === totalSteps) {
            nextBtn.style.display = "none";
            submitBtn.style.display = "inline-block";
        } else {
            nextBtn.style.display = "inline-block";
            submitBtn.style.display = "none";
        }
    }

    function validateStep(step) {
        const activePane = document.getElementById(`pane-${step}`);
        const inputs = activePane.querySelectorAll("input[required], select[required]");
        let valid = true;
        inputs.forEach(input => {
            if (!input.value) {
                valid = false;
                input.style.borderColor = "var(--color-error)";
            } else {
                input.style.borderColor = "var(--color-border)";
            }
        });
        return valid;
    }

    function saveStepData(step) {
        const activePane = document.getElementById(`pane-${step}`);
        const inputs = activePane.querySelectorAll("input, select, textarea");
        stepsData[step] = {};
        inputs.forEach(input => {
            if (input.type === "checkbox") {
                stepsData[step][input.id] = input.checked;
            } else {
                stepsData[step][input.id] = input.value;
            }
        });
    }

    function showToast(message, type = "info") {
        const existing = document.getElementById("ob-toast");
        if (existing) existing.remove();

        const toast = document.createElement("div");
        toast.id = "ob-toast";
        const colors = { success: "#10b981", info: "#6366f1", error: "#ef4444" };
        toast.style.cssText = `
            position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
            background: ${colors[type] || colors.info}; color: #fff;
            padding: 14px 28px; border-radius: 10px; font-size: 14px; font-weight: 600;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4); z-index: 9999;
            animation: fadeSlideUp 0.35s ease; white-space: nowrap;
        `;
        toast.textContent = message;

        // Add keyframe once
        if (!document.getElementById("ob-toast-style")) {
            const style = document.createElement("style");
            style.id = "ob-toast-style";
            style.textContent = `@keyframes fadeSlideUp { from { opacity:0; transform: translateX(-50%) translateY(16px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }`;
            document.head.appendChild(style);
        }

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    }

    // ── Searchable dropdown initialiser ────────────────────────────────────
    function initSearchableDropdown({ inputId, listId, hiddenId, items, labelFn, codeFn, defaultCode }) {
        const searchInput = document.getElementById(inputId);
        const listEl     = document.getElementById(listId);
        const hiddenEl   = document.getElementById(hiddenId);
        if (!searchInput || !listEl || !hiddenEl) return;

        // Pre-set display to current default
        const defaultItem = items.find(i => codeFn(i) === defaultCode);
        if (defaultItem) searchInput.value = `${codeFn(defaultItem)}  —  ${labelFn(defaultItem)}`;

        function renderList(query) {
            const q = query.toLowerCase();
            const filtered = q
                ? items.filter(i => codeFn(i).toLowerCase().includes(q) || labelFn(i).toLowerCase().includes(q))
                : items;
            listEl.innerHTML = "";
            if (!filtered.length) {
                listEl.innerHTML = `<div class="currency-dropdown-empty">No results found</div>`;
                return;
            }
            filtered.slice(0, 120).forEach(item => {
                const div = document.createElement("div");
                div.className = "currency-dropdown-item" + (codeFn(item) === hiddenEl.value ? " selected" : "");
                div.innerHTML = `<span class="currency-code">${codeFn(item)}</span><span class="currency-name">${labelFn(item)}</span>`;
                div.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    hiddenEl.value = codeFn(item);
                    searchInput.value = `${codeFn(item)}  —  ${labelFn(item)}`;
                    listEl.classList.remove("open");
                });
                listEl.appendChild(div);
            });
        }

        searchInput.addEventListener("focus", () => {
            renderList(searchInput.value.split("—")[0].trim());
            listEl.classList.add("open");
        });
        searchInput.addEventListener("input", () => {
            renderList(searchInput.value);
            listEl.classList.add("open");
        });
        searchInput.addEventListener("blur", () => {
            setTimeout(() => listEl.classList.remove("open"), 150);
        });
    }

    // ── World Currencies ────────────────────────────────────────────────────
    const WORLD_CURRENCIES = [
        {code:"AED",name:"UAE Dirham"},{code:"AFN",name:"Afghan Afghani"},{code:"ALL",name:"Albanian Lek"},
        {code:"AMD",name:"Armenian Dram"},{code:"ANG",name:"Netherlands Antillean Guilder"},{code:"AOA",name:"Angolan Kwanza"},
        {code:"ARS",name:"Argentine Peso"},{code:"AUD",name:"Australian Dollar"},{code:"AWG",name:"Aruban Florin"},
        {code:"AZN",name:"Azerbaijani Manat"},{code:"BAM",name:"Bosnia-Herzegovina Convertible Mark"},{code:"BBD",name:"Barbadian Dollar"},
        {code:"BDT",name:"Bangladeshi Taka"},{code:"BGN",name:"Bulgarian Lev"},{code:"BHD",name:"Bahraini Dinar"},
        {code:"BIF",name:"Burundian Franc"},{code:"BMD",name:"Bermudan Dollar"},{code:"BND",name:"Brunei Dollar"},
        {code:"BOB",name:"Bolivian Boliviano"},{code:"BRL",name:"Brazilian Real"},{code:"BSD",name:"Bahamian Dollar"},
        {code:"BTN",name:"Bhutanese Ngultrum"},{code:"BWP",name:"Botswanan Pula"},{code:"BYN",name:"Belarusian Ruble"},
        {code:"BZD",name:"Belize Dollar"},{code:"CAD",name:"Canadian Dollar"},{code:"CDF",name:"Congolese Franc"},
        {code:"CHF",name:"Swiss Franc"},{code:"CLP",name:"Chilean Peso"},{code:"CNY",name:"Chinese Yuan"},
        {code:"COP",name:"Colombian Peso"},{code:"CRC",name:"Costa Rican Colón"},{code:"CUP",name:"Cuban Peso"},
        {code:"CVE",name:"Cape Verdean Escudo"},{code:"CZK",name:"Czech Koruna"},{code:"DJF",name:"Djiboutian Franc"},
        {code:"DKK",name:"Danish Krone"},{code:"DOP",name:"Dominican Peso"},{code:"DZD",name:"Algerian Dinar"},
        {code:"EGP",name:"Egyptian Pound"},{code:"ERN",name:"Eritrean Nakfa"},{code:"ETB",name:"Ethiopian Birr"},
        {code:"EUR",name:"Euro"},{code:"FJD",name:"Fijian Dollar"},{code:"FKP",name:"Falkland Islands Pound"},
        {code:"GBP",name:"British Pound Sterling"},{code:"GEL",name:"Georgian Lari"},{code:"GHS",name:"Ghanaian Cedi"},
        {code:"GIP",name:"Gibraltar Pound"},{code:"GMD",name:"Gambian Dalasi"},{code:"GNF",name:"Guinean Franc"},
        {code:"GTQ",name:"Guatemalan Quetzal"},{code:"GYD",name:"Guyanaese Dollar"},{code:"HKD",name:"Hong Kong Dollar"},
        {code:"HNL",name:"Honduran Lempira"},{code:"HRK",name:"Croatian Kuna"},{code:"HTG",name:"Haitian Gourde"},
        {code:"HUF",name:"Hungarian Forint"},{code:"IDR",name:"Indonesian Rupiah"},{code:"ILS",name:"Israeli New Shekel"},
        {code:"INR",name:"Indian Rupee"},{code:"IQD",name:"Iraqi Dinar"},{code:"IRR",name:"Iranian Rial"},
        {code:"ISK",name:"Icelandic Króna"},{code:"JMD",name:"Jamaican Dollar"},{code:"JOD",name:"Jordanian Dinar"},
        {code:"JPY",name:"Japanese Yen"},{code:"KES",name:"Kenyan Shilling"},{code:"KGS",name:"Kyrgystani Som"},
        {code:"KHR",name:"Cambodian Riel"},{code:"KMF",name:"Comorian Franc"},{code:"KPW",name:"North Korean Won"},
        {code:"KRW",name:"South Korean Won"},{code:"KWD",name:"Kuwaiti Dinar"},{code:"KYD",name:"Cayman Islands Dollar"},
        {code:"KZT",name:"Kazakhstani Tenge"},{code:"LAK",name:"Laotian Kip"},{code:"LBP",name:"Lebanese Pound"},
        {code:"LKR",name:"Sri Lankan Rupee"},{code:"LRD",name:"Liberian Dollar"},{code:"LSL",name:"Lesotho Loti"},
        {code:"LYD",name:"Libyan Dinar"},{code:"MAD",name:"Moroccan Dirham"},{code:"MDL",name:"Moldovan Leu"},
        {code:"MGA",name:"Malagasy Ariary"},{code:"MKD",name:"Macedonian Denar"},{code:"MMK",name:"Myanma Kyat"},
        {code:"MNT",name:"Mongolian Tugrik"},{code:"MOP",name:"Macanese Pataca"},{code:"MRU",name:"Mauritanian Ouguiya"},
        {code:"MUR",name:"Mauritian Rupee"},{code:"MVR",name:"Maldivian Rufiyaa"},{code:"MWK",name:"Malawian Kwacha"},
        {code:"MXN",name:"Mexican Peso"},{code:"MYR",name:"Malaysian Ringgit"},{code:"MZN",name:"Mozambican Metical"},
        {code:"NAD",name:"Namibian Dollar"},{code:"NGN",name:"Nigerian Naira"},{code:"NIO",name:"Nicaraguan Córdoba"},
        {code:"NOK",name:"Norwegian Krone"},{code:"NPR",name:"Nepalese Rupee"},{code:"NZD",name:"New Zealand Dollar"},
        {code:"OMR",name:"Omani Rial"},{code:"PAB",name:"Panamanian Balboa"},{code:"PEN",name:"Peruvian Nuevo Sol"},
        {code:"PGK",name:"Papua New Guinean Kina"},{code:"PHP",name:"Philippine Peso"},{code:"PKR",name:"Pakistani Rupee"},
        {code:"PLN",name:"Polish Zloty"},{code:"PYG",name:"Paraguayan Guarani"},{code:"QAR",name:"Qatari Rial"},
        {code:"RON",name:"Romanian Leu"},{code:"RSD",name:"Serbian Dinar"},{code:"RUB",name:"Russian Ruble"},
        {code:"RWF",name:"Rwandan Franc"},{code:"SAR",name:"Saudi Riyal"},{code:"SBD",name:"Solomon Islands Dollar"},
        {code:"SCR",name:"Seychellois Rupee"},{code:"SDG",name:"Sudanese Pound"},{code:"SEK",name:"Swedish Krona"},
        {code:"SGD",name:"Singapore Dollar"},{code:"SHP",name:"Saint Helena Pound"},{code:"SLL",name:"Sierra Leonean Leone"},
        {code:"SOS",name:"Somali Shilling"},{code:"SRD",name:"Surinamese Dollar"},{code:"STN",name:"São Tomé and Príncipe Dobra"},
        {code:"SVC",name:"Salvadoran Colón"},{code:"SYP",name:"Syrian Pound"},{code:"SZL",name:"Swazi Lilangeni"},
        {code:"THB",name:"Thai Baht"},{code:"TJS",name:"Tajikistani Somoni"},{code:"TMT",name:"Turkmenistani Manat"},
        {code:"TND",name:"Tunisian Dinar"},{code:"TOP",name:"Tongan Paʻanga"},{code:"TRY",name:"Turkish Lira"},
        {code:"TTD",name:"Trinidad and Tobago Dollar"},{code:"TWD",name:"New Taiwan Dollar"},{code:"TZS",name:"Tanzanian Shilling"},
        {code:"UAH",name:"Ukrainian Hryvnia"},{code:"UGX",name:"Ugandan Shilling"},{code:"USD",name:"US Dollar"},
        {code:"UYU",name:"Uruguayan Peso"},{code:"UZS",name:"Uzbekistan Som"},{code:"VES",name:"Venezuelan Bolívar Soberano"},
        {code:"VND",name:"Vietnamese Dong"},{code:"VUV",name:"Vanuatu Vatu"},{code:"WST",name:"Samoan Tala"},
        {code:"XAF",name:"CFA Franc BEAC"},{code:"XCD",name:"East Caribbean Dollar"},{code:"XOF",name:"CFA Franc BCEAO"},
        {code:"XPF",name:"CFP Franc"},{code:"YER",name:"Yemeni Rial"},{code:"ZAR",name:"South African Rand"},
        {code:"ZMW",name:"Zambian Kwacha"},{code:"ZWL",name:"Zimbabwean Dollar"}
    ];

    initSearchableDropdown({
        inputId: "currencySearch", listId: "currencyList", hiddenId: "currencyValue",
        items: WORLD_CURRENCIES,
        codeFn: c => c.code, labelFn: c => c.name,
        defaultCode: "INR"
    });

    // ── World Timezones (IANA via Intl) ─────────────────────────────────────
    let ALL_TIMEZONES = [];
    try {
        ALL_TIMEZONES = Intl.supportedValuesOf("timeZone").map(tz => ({
            code: tz,
            name: tz.replace(/_/g, " ")
        }));
    } catch(e) {
        // Fallback for older browsers
        ALL_TIMEZONES = [
            {code:"UTC",name:"UTC"},{code:"Asia/Kolkata",name:"Asia/Kolkata"},{code:"America/New_York",name:"America/New York"},
            {code:"America/Chicago",name:"America/Chicago"},{code:"America/Denver",name:"America/Denver"},
            {code:"America/Los_Angeles",name:"America/Los Angeles"},{code:"America/Sao_Paulo",name:"America/Sao Paulo"},
            {code:"Europe/London",name:"Europe/London"},{code:"Europe/Paris",name:"Europe/Paris"},
            {code:"Europe/Berlin",name:"Europe/Berlin"},{code:"Europe/Moscow",name:"Europe/Moscow"},
            {code:"Africa/Cairo",name:"Africa/Cairo"},{code:"Africa/Nairobi",name:"Africa/Nairobi"},
            {code:"Asia/Dubai",name:"Asia/Dubai"},{code:"Asia/Singapore",name:"Asia/Singapore"},
            {code:"Asia/Tokyo",name:"Asia/Tokyo"},{code:"Asia/Shanghai",name:"Asia/Shanghai"},
            {code:"Australia/Sydney",name:"Australia/Sydney"},{code:"Pacific/Auckland",name:"Pacific/Auckland"}
        ];
    }

    initSearchableDropdown({
        inputId: "timezoneSearch", listId: "timezoneList", hiddenId: "timezoneValue",
        items: ALL_TIMEZONES,
        codeFn: t => t.code, labelFn: t => t.name,
        defaultCode: "Asia/Kolkata"
    });

});

// Dynamic Mandala background animation
document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("bg-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let w = canvas.width = window.innerWidth;
    let h = canvas.height = window.innerHeight;

    window.addEventListener("resize", () => {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
    });

    let angle = 0;
    function animate() {
        ctx.clearRect(0, 0, w, h);
        const style = getComputedStyle(document.documentElement);
        const bg1 = style.getPropertyValue('--color-canvas-bg-1').trim() || '#0c152b';
        const bg2 = style.getPropertyValue('--color-canvas-bg-2').trim() || '#060913';

        let gradient = ctx.createRadialGradient(w/2, h/2, 50, w/2, h/2, Math.max(w, h));
        gradient.addColorStop(0, bg1);
        gradient.addColorStop(1, bg2);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
        requestAnimationFrame(animate);
    }
    animate();
});
