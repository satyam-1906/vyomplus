// GST & Inventory Dashboard Logic and Visual Effects

// Mock Data Stores
let inventoryItems = [
    { name: "Executive Leather Chair", sku: "SKU-FUR-CHR-12", qty: 45, price: 8500, gstRate: 18 },
    { name: "Ergonomic Office Desk", sku: "SKU-FUR-DSK-05", qty: 12, price: 14200, gstRate: 18 },
    { name: "LED Desk Lamp", sku: "SKU-LGT-LMP-02", qty: 120, price: 1250, gstRate: 12 },
    { name: "Wireless Mechanical Keyboard", sku: "SKU-ACC-KBD-99", qty: 4, price: 4500, gstRate: 18 },
    { name: "Dual-Monitor Docking Station", sku: "SKU-ELC-DOK-08", qty: 0, price: 8900, gstRate: 18 }
];

let recentTransactions = [
    {
        id: "TXN-2026-0091",
        invoiceNum: "INV-2026-442",
        seller: "Apex Retailers Private Limited",
        customer: "Zenith Tech Labs Inc.",
        finalPrice: 85550,
        netGst: 13050,
        status: "verified",
        items: [
            { name: "Executive Leather Chair", qty: 5, price: 8500, gst: 18 },
            { name: "Wireless Mechanical Keyboard", qty: 6, price: 4500, gst: 18 }
        ]
    },
    {
        id: "TXN-2026-0090",
        invoiceNum: "INV-2026-441",
        seller: "Apex Retailers Private Limited",
        customer: "Global Systems Corp.",
        finalPrice: 16750,
        netGst: 2550,
        status: "verified",
        items: [
            { name: "Ergonomic Office Desk", qty: 1, price: 14200, gst: 18 }
        ]
    },
    {
        id: "TXN-2026-0089",
        invoiceNum: "INV-2026-440",
        seller: "Radiant Electro Distributors",
        customer: "Apex Retailers Private Limited",
        finalPrice: 112000,
        netGst: 12000,
        status: "verified",
        items: [
            { name: "LED Desk Lamp", qty: 80, price: 1250, gst: 12 }
        ]
    },
    {
        id: "TXN-2026-0088",
        invoiceNum: "INV-2026-439",
        seller: "Apex Retailers Private Limited",
        customer: "Hyperion Retail Ltd.",
        finalPrice: 31500,
        netGst: 4800,
        status: "pending",
        items: [
            { name: "Dual-Monitor Docking Station", qty: 3, price: 8900, gst: 18 }
        ]
    }
];

let alerts = [
    { type: "error", title: "Stock Outage Alert", desc: "Dual-Monitor Docking Station has hit zero inventory.", time: "10 mins ago" },
    { type: "warning", title: "Low Stock Warning", desc: "Wireless Mechanical Keyboard is critical (4 items left).", time: "1 hr ago" },
    { type: "warning", title: "GST Filing Overdue", desc: "Annual GSTR-9 filing deadline is approaching.", time: "2 hrs ago" },
    { type: "success", title: "Invoice Matches Books", desc: "All uploaded invoices match GSTR-2B perfectly.", time: "Yesterday" }
];

// Initialize application
document.addEventListener("DOMContentLoaded", () => {
    // Render all panels
    renderInventory();
    renderTransactions();
    renderAlerts();
    initDOMEvents();
});

// Render Inventory Table
function renderInventory(filterQuery = "") {
    const tableBody = document.querySelector("#inventory-table tbody");
    tableBody.innerHTML = "";

    const filtered = inventoryItems.filter(item => 
        item.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
        item.sku.toLowerCase().includes(filterQuery.toLowerCase())
    );

    filtered.forEach(item => {
        let stockClass = "high";
        let stockLabel = "In Stock";
        if (item.qty === 0) {
            stockClass = "empty";
            stockLabel = "Out of Stock";
        } else if (item.qty <= 5) {
            stockClass = "low";
            stockLabel = "Low Stock";
        }

        const row = document.createElement("tr");
        row.innerHTML = `
            <td><strong>${item.name}</strong></td>
            <td><code style="color: var(--color-primary)">${item.sku}</code></td>
            <td>${item.qty} units</td>
            <td>₹${item.price.toLocaleString('en-IN')}</td>
            <td>${item.gstRate}%</td>
            <td><span class="stock-badge ${stockClass}">${stockLabel}</span></td>
        `;
        tableBody.appendChild(row);
    });
}

// Render Transactions Table
function renderTransactions() {
    const tableBody = document.querySelector("#transactions-table tbody");
    tableBody.innerHTML = "";

    recentTransactions.forEach((txn, index) => {
        // Main Row
        const mainRow = document.createElement("tr");
        mainRow.className = "main-row";
        mainRow.dataset.index = index;
        mainRow.innerHTML = `
            <td><code>${txn.id}</code></td>
            <td>${txn.invoiceNum}</td>
            <td>${txn.seller}</td>
            <td>${txn.customer}</td>
            <td><strong>₹${txn.finalPrice.toLocaleString('en-IN')}</strong></td>
            <td>₹${txn.netGst.toLocaleString('en-IN')}</td>
            <td><span class="status-indicator-pill ${txn.status}">${txn.status}</span></td>
            <td class="text-center"><i class="ti ti-chevron-down chevron-icon" id="chevron-${index}"></i></td>
        `;

        // Details Row
        const detailsRow = document.createElement("tr");
        detailsRow.className = "details-row";
        detailsRow.id = `details-${index}`;
        
        let subItemsHtml = txn.items.map(item => `
            <tr>
                <td><strong>${item.name}</strong></td>
                <td>${item.qty}</td>
                <td>₹${item.price.toLocaleString('en-IN')}</td>
                <td>${item.gst}%</td>
                <td><strong>₹${(item.qty * item.price * (1 + item.gst / 100)).toLocaleString('en-IN')}</strong></td>
            </tr>
        `).join("");

        detailsRow.innerHTML = `
            <td colspan="8">
                <div class="details-wrapper">
                    <h4 style="font-size: 12px; text-transform: uppercase; color: var(--color-text-secondary); margin-bottom: 8px;">Sub-List of Items Sold</h4>
                    <table class="txn-items-table">
                        <thead>
                            <tr>
                                <th>Item Name</th>
                                <th>Quantity</th>
                                <th>Unit Price (Base)</th>
                                <th>GST Rate</th>
                                <th>Gross Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${subItemsHtml}
                        </tbody>
                    </table>
                </div>
            </td>
        `;

        tableBody.appendChild(mainRow);
        tableBody.appendChild(detailsRow);

        // Click Handler for expansion
        mainRow.addEventListener("click", () => {
            const isCurrentlyActive = detailsRow.classList.contains("active");
            
            // Close all details rows first for smooth accordion effect
            document.querySelectorAll(".details-row").forEach(el => el.classList.remove("active"));
            document.querySelectorAll(".chevron-icon").forEach(el => el.classList.remove("rotated"));

            if (!isCurrentlyActive) {
                detailsRow.classList.add("active");
                document.querySelector(`#chevron-${index}`).classList.add("rotated");
            }
        });
    });
}

// Render Alerts Panel
function renderAlerts() {
    const alertsContainer = document.querySelector("#alerts-container");
    alertsContainer.innerHTML = "";

    alerts.forEach(alert => {
        let alertClass = "warning";
        let icon = "ti-alert-circle";
        if (alert.type === "error") {
            alertClass = "error";
            icon = "ti-circle-x-filled";
        } else if (alert.type === "success") {
            alertClass = "success";
            icon = "ti-circle-check-filled";
        }

        const alertEl = document.createElement("div");
        alertEl.className = `alert-item ${alertClass}`;
        alertEl.innerHTML = `
            <i class="ti ${icon} alert-icon"></i>
            <div class="alert-content">
                <span class="alert-title">${alert.title}</span>
                <span class="alert-description">${alert.desc}</span>
                <span class="alert-time">${alert.time}</span>
            </div>
        `;
        alertsContainer.appendChild(alertEl);
    });
}

// Event Bindings and Interactive States
function initDOMEvents() {
    // Profile Drawer Toggles
    const openProfileBtn = document.querySelector("#open-profile-btn");
    const closeProfileBtn = document.querySelector("#close-profile-btn");
    const profileDrawer = document.querySelector("#profile-drawer");
    const profileDrawerOverlay = document.querySelector("#profile-drawer-overlay");

    const toggleProfileDrawer = (open) => {
        profileDrawer.classList.toggle("active", open);
        profileDrawerOverlay.classList.toggle("active", open);
    };

    if (openProfileBtn) openProfileBtn.addEventListener("click", () => toggleProfileDrawer(true));
    if (closeProfileBtn) closeProfileBtn.addEventListener("click", () => toggleProfileDrawer(false));
    if (profileDrawerOverlay) profileDrawerOverlay.addEventListener("click", () => toggleProfileDrawer(false));

    // GST Filing Wizard Toggles & Navigation
    const openFilingBtn = document.querySelector("#open-filing-btn");
    const closeFilingBtn = document.querySelector("#close-filing-btn");
    const filingModal = document.querySelector("#filing-modal");
    const filingModalOverlay = document.querySelector("#filing-modal-overlay");

    const toggleFilingModal = (open) => {
        if (filingModal && filingModalOverlay) {
            filingModal.classList.toggle("active", open);
            filingModalOverlay.classList.toggle("active", open);
        }
        if (open) resetFilingSteps();
    };

    if (openFilingBtn) openFilingBtn.addEventListener("click", () => toggleFilingModal(true));
    if (closeFilingBtn) closeFilingBtn.addEventListener("click", () => toggleFilingModal(false));
    if (filingModalOverlay) filingModalOverlay.addEventListener("click", () => toggleFilingModal(false));
    document.querySelector("#cancel-filing-btn-1")?.addEventListener("click", () => toggleFilingModal(false));

    // Step-by-step navigation
    const nextBtn1 = document.querySelector("#next-step-btn-1");
    const nextBtn2 = document.querySelector("#next-step-btn-2");
    const prevBtn2 = document.querySelector("#prev-step-btn-2");
    const prevBtn3 = document.querySelector("#prev-step-btn-3");
    const fileSubmitBtn = document.querySelector("#file-submit-btn");
    const declarationCheck = document.querySelector("#declaration-check");

    if (nextBtn1) nextBtn1.addEventListener("click", () => showFilingStep(2));
    if (nextBtn2) nextBtn2.addEventListener("click", () => showFilingStep(3));
    if (prevBtn2) prevBtn2.addEventListener("click", () => showFilingStep(1));
    if (prevBtn3) prevBtn3.addEventListener("click", () => showFilingStep(2));

    if (declarationCheck) {
        declarationCheck.addEventListener("change", (e) => {
            if (fileSubmitBtn) fileSubmitBtn.disabled = !e.target.checked;
        });
    }

    if (fileSubmitBtn) {
        fileSubmitBtn.addEventListener("click", () => {
            notify("GSTR-3B filed successfully! Reference Number: GST3B-981248912", "success");
            toggleFilingModal(false);
            // Add filing success alert to alerts sidebar
            alerts.unshift({
                type: "success",
                title: "GSTR-3B Filed Successfully",
                desc: "Filing reference GST3B-981248912 generated.",
                time: "Just now"
            });
            renderAlerts();
        });
    }

    // Mock Inventory Addition Dialog
    const openInventoryBtn = document.querySelector("#add-item-mock-btn");
    const closeInventoryBtn = document.querySelector("#close-inventory-btn");
    const cancelInventoryBtn = document.querySelector("#cancel-inventory-btn");
    const inventoryModal = document.querySelector("#inventory-modal");
    const inventoryModalOverlay = document.querySelector("#inventory-modal-overlay");
    const inventoryForm = document.querySelector("#inventory-form");

    const toggleInventoryModal = (open) => {
        if (inventoryModal && inventoryModalOverlay) {
            inventoryModal.classList.toggle("active", open);
            inventoryModalOverlay.classList.toggle("active", open);
        }
        if (!open && inventoryForm) inventoryForm.reset();
    };

    if (openInventoryBtn) openInventoryBtn.addEventListener("click", () => toggleInventoryModal(true));
    if (closeInventoryBtn) closeInventoryBtn.addEventListener("click", () => toggleInventoryModal(false));
    if (cancelInventoryBtn) cancelInventoryBtn.addEventListener("click", () => toggleInventoryModal(false));
    if (inventoryModalOverlay) inventoryModalOverlay.addEventListener("click", () => toggleInventoryModal(false));

    if (inventoryForm) {
        inventoryForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const name = document.querySelector("#prod-name").value;
            const sku = document.querySelector("#prod-sku").value;
            const qty = parseInt(document.querySelector("#prod-qty").value, 10);
            const price = parseFloat(document.querySelector("#prod-price").value);
            const gstRate = parseInt(document.querySelector("#prod-gst").value, 10);

            inventoryItems.unshift({ name, sku, qty, price, gstRate });
            renderInventory();

            // Add a warning/success notification if stock is low or standard
            if (qty <= 5) {
                alerts.unshift({
                    type: "warning",
                    title: "Added Stock Low",
                    desc: `${name} was added with low stock quantity (${qty} units).`,
                    time: "Just now"
                });
                renderAlerts();
            }

            toggleInventoryModal(false);
        });
    }

    // Search bar logic
    const searchInput = document.querySelector("#inventory-search");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            renderInventory(e.target.value);
        });
    }
}

// Filing Wizard Step display
function showFilingStep(stepNum) {
    // Hide all contents
    document.querySelectorAll(".step-content").forEach(el => el.classList.remove("active"));
    document.querySelectorAll(".step").forEach(el => {
        el.classList.remove("active");
        el.classList.remove("completed");
    });

    // Display targeted content
    document.querySelector(`#step-content-${stepNum}`).classList.add("active");
    
    // Manage step bar active classes
    for (let i = 1; i <= 3; i++) {
        const stepTab = document.querySelector(`#step-tab-${i}`);
        if (i < stepNum) {
            stepTab.classList.add("completed");
        } else if (i === stepNum) {
            stepTab.classList.add("active");
        }
    }
}

function resetFilingSteps() {
    showFilingStep(1);
    document.querySelector("#declaration-check").checked = false;
    document.querySelector("#file-submit-btn").disabled = true;
}


