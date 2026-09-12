'use strict';

const API_BASE = 'http://127.0.0.1:8000';
let inventoryItems = [];
let allGodowns = [];
let salesInvoices = []; // We will store all fetched vouchers here and filter/render

// Block form submission and Enter key
document.addEventListener('submit', e => { e.preventDefault(); e.stopPropagation(); }, true);
document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        e.stopPropagation();
    }
}, true);

// Elements
const voucherTypeSelect = document.getElementById('voucher_type');
const dynamicFormBody   = document.getElementById('dynamic-form-body');
const typeBadgeDisplay  = document.getElementById('type-badge-display');
const generateBtn       = document.getElementById('generate-btn');
const generateBtnLabel  = document.getElementById('generate-btn-label');
const invoiceListContainer = document.getElementById('invoice-list-container');

// Group definitions
const ACCOUNTING_VOUCHERS = new Set(["Payment", "Receipt", "Contra", "Journal", "AdvanceReceipt", "RefundVoucher", "Memorandum", "ReversingJournal"]);
const GST_INVOICES        = new Set(["Sales", "BillOfSupply", "ExportInvoice", "Purchase", "SelfInvoiceRCM", "DebitNote", "CreditNote"]);
const INVENTORY_VOUCHERS  = new Set(["PurchaseOrder", "SalesOrder", "DeliveryNote", "DeliveryChallan", "JobWorkOutOrder", "ReceiptNote", "MaterialIn", "RejectionIn", "RejectionOut", "StockJournal", "PhysicalStock"]);
const PRESALES_VOUCHERS   = new Set(["Quotation"]);

// Initialize Page
(async function init() {
    resetDates();
    await Promise.all([fetchInventory(), fetchGodowns()]);
    // Set type selector listener
    voucherTypeSelect.addEventListener('change', handleTypeChange);
    // Initial draw
    handleTypeChange();
    await fetchAllVouchers();
})();

function resetDates() {
    // dates handled dynamically inside form templates
}

async function fetchInventory() {
    try {
        const res = await fetch(`${API_BASE}/stock`);
        if (!res.ok) throw new Error();
        inventoryItems = await res.json();
    } catch {
        if (typeof showToast === 'function')
            showToast('Could not load inventory.', 'error');
    }
}

async function fetchGodowns() {
    try {
        const res = await fetch(`${API_BASE}/godown`);
        if (!res.ok) throw new Error();
        allGodowns = await res.json();
    } catch {
        allGodowns = [];
    }
}

function getGodownsForItem(itemName) {
    const stockItem = inventoryItems.find(i => i.item === itemName);
    if (!stockItem || !stockItem.godowns) return [];
    return Object.entries(stockItem.godowns)
        .filter(([, qty]) => qty > 0)
        .map(([name]) => name);
}

function handleTypeChange() {
    const type = voucherTypeSelect.value;
    
    // Update Badge
    if (ACCOUNTING_VOUCHERS.has(type)) {
        typeBadgeDisplay.textContent = 'Accounting';
        typeBadgeDisplay.className = 'type-badge accounting';
    } else if (GST_INVOICES.has(type)) {
        typeBadgeDisplay.textContent = 'Invoice';
        typeBadgeDisplay.className = 'type-badge invoice';
    } else if (INVENTORY_VOUCHERS.has(type)) {
        typeBadgeDisplay.textContent = 'Inventory';
        typeBadgeDisplay.className = 'type-badge inventory';
    } else if (PRESALES_VOUCHERS.has(type)) {
        typeBadgeDisplay.textContent = 'Pre-Sales';
        typeBadgeDisplay.className = 'type-badge presales';
    }

    // Update Action Button
    generateBtnLabel.textContent = `Generate & Download ${type}`;

    // Render corresponding form template
    renderFormTemplate(type);
}

function renderFormTemplate(type) {
    dynamicFormBody.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];

    // Standard fields common to most (Voucher No, Date, Company)
    let commonHTML = `
        <div class="form-grid" style="padding-bottom: 0;">
            <div class="form-group">
                <label for="voucher_number">Voucher Number</label>
                <input type="text" id="voucher_number" placeholder="Auto-generated if empty">
            </div>
            <div class="form-group">
                <label for="date">Date</label>
                <input type="date" id="date" value="${today}" required>
            </div>
            <div class="form-group full">
                <label for="company_name">Company Name</label>
                <input type="text" id="company_name" placeholder="e.g. VYOM+ Industries" value="LICERIA & CO.">
            </div>
        </div>
    `;

    if (type === 'Payment') {
        dynamicFormBody.innerHTML = commonHTML + `
            <div class="form-grid">
                <div class="form-group">
                    <label for="mode">Payment Mode</label>
                    <select id="mode">
                        <option value="Bank">Bank</option>
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="paid_from_ledger_id">Paid From (Ledger)</label>
                    <input type="text" id="paid_from_ledger_id" placeholder="e.g. HDFC Bank" required>
                </div>
                <div class="form-group">
                    <label for="tds_section">TDS Section</label>
                    <input type="text" id="tds_section" placeholder="e.g. 194I">
                </div>
                <div class="form-group">
                    <label for="tds_amount">TDS Amount (₹)</label>
                    <input type="number" id="tds_amount" value="0">
                </div>
                <div class="form-group full check-row">
                    <input type="checkbox" id="tds_applicable">
                    <label for="tds_applicable">TDS Applicable</label>
                </div>
                <div class="form-group full">
                    <label for="narration">Narration</label>
                    <textarea id="narration" placeholder="Rent payment for July..."></textarea>
                </div>
            </div>
            <div class="form-section-header"><i class="ti ti-receipt"></i> Debit Entries</div>
            <div class="entry-rows-container" id="debit-entries-container"></div>
            <div class="add-row-wrap">
                <button type="button" class="btn btn-secondary btn-sm" onclick="addDebitEntryRow()"><i class="ti ti-plus"></i> Add Debit Row</button>
            </div>
        `;
        addDebitEntryRow();
    } 
    else if (type === 'Receipt') {
        dynamicFormBody.innerHTML = commonHTML + `
            <div class="form-grid">
                <div class="form-group">
                    <label for="mode">Receipt Mode</label>
                    <select id="mode">
                        <option value="UPI">UPI</option>
                        <option value="Bank">Bank</option>
                        <option value="Cash">Cash</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="received_into_ledger_id">Received Into (Ledger)</label>
                    <input type="text" id="received_into_ledger_id" placeholder="e.g. HDFC Bank" required>
                </div>
                <div class="form-group full">
                    <label for="advance_against_sales_order_id">Advance Against Sales Order ID (Optional)</label>
                    <input type="text" id="advance_against_sales_order_id" placeholder="e.g. SO/24-25/044">
                </div>
                <div class="form-group full">
                    <label for="narration">Narration</label>
                    <textarea id="narration" placeholder="Received payment against invoice..."></textarea>
                </div>
            </div>
            <div class="form-section-header"><i class="ti ti-receipt"></i> Credit Entries</div>
            <div class="entry-rows-container" id="credit-entries-container"></div>
            <div class="add-row-wrap">
                <button type="button" class="btn btn-secondary btn-sm" onclick="addCreditEntryRow()"><i class="ti ti-plus"></i> Add Credit Row</button>
            </div>
        `;
        addCreditEntryRow();
    } 
    else if (type === 'Contra') {
        dynamicFormBody.innerHTML = commonHTML + `
            <div class="form-grid">
                <div class="form-group">
                    <label for="from_ledger_id">From Ledger (Withdraw from)</label>
                    <input type="text" id="from_ledger_id" placeholder="e.g. Cash" required>
                </div>
                <div class="form-group">
                    <label for="to_ledger_id">To Ledger (Deposit into)</label>
                    <input type="text" id="to_ledger_id" placeholder="e.g. HDFC Bank" required>
                </div>
                <div class="form-group">
                    <label for="amount">Amount</label>
                    <input type="number" id="amount" value="0" required>
                </div>
                <div class="form-group full">
                    <label for="narration">Narration</label>
                    <textarea id="narration" placeholder="Cash deposit/transfer details..."></textarea>
                </div>
            </div>
        `;
    } 
    else if (type === 'Journal' || type === 'Memorandum' || type === 'ReversingJournal') {
        let extraFields = '';
        if (type === 'Journal') {
            extraFields = `
                <div class="form-group">
                    <label for="adjustment_type">Adjustment Type (If GST)</label>
                    <input type="text" id="adjustment_type" placeholder="e.g. ITC Reversal">
                </div>
                <div class="form-group check-row" style="margin-top: 24px;">
                    <input type="checkbox" id="is_gst_adjustment">
                    <label for="is_gst_adjustment">Is GST Adjustment</label>
                </div>
            `;
        } else if (type === 'Memorandum') {
            extraFields = `
                <div class="form-group full">
                    <label for="purpose">Purpose / Shortage reason</label>
                    <input type="text" id="purpose" placeholder="e.g. Suspected cash shortage - pending verification">
                </div>
                <div class="form-group full check-row">
                    <input type="checkbox" id="posted_to_books">
                    <label for="posted_to_books">Posted To Books</label>
                </div>
            `;
        } else if (type === 'ReversingJournal') {
            extraFields = `
                <div class="form-group">
                    <label for="applicable_date">Applicable Date</label>
                    <input type="date" id="applicable_date" value="${today}">
                </div>
                <div class="form-group">
                    <label for="auto_reverses_on">Auto Reverses On</label>
                    <input type="date" id="auto_reverses_on" value="${today}">
                </div>
                <div class="form-group full">
                    <label for="purpose">Accrual Purpose</label>
                    <input type="text" id="purpose" placeholder="e.g. Provisional rent accrual for July">
                </div>
            `;
        }

        dynamicFormBody.innerHTML = commonHTML + `
            <div class="form-grid">
                ${extraFields}
                <div class="form-group full">
                    <label for="narration">Narration</label>
                    <textarea id="narration" placeholder="Journal entry particulars..."></textarea>
                </div>
            </div>
            <div class="form-section-header"><i class="ti ti-list"></i> Ledger Entries</div>
            <div class="entry-rows-container" id="journal-entries-container"></div>
            <div class="add-row-wrap">
                <button type="button" class="btn btn-secondary btn-sm" onclick="addJournalEntryRow()"><i class="ti ti-plus"></i> Add Entry Row</button>
            </div>
        `;
        addJournalEntryRow();
    }
    else if (type === 'AdvanceReceipt') {
        dynamicFormBody.innerHTML = commonHTML + `
            <div class="form-grid">
                <div class="form-group">
                    <label for="received_from">Received From (Customer Name)</label>
                    <input type="text" id="received_from" placeholder="e.g. Anand Traders" required>
                </div>
                <div class="form-group">
                    <label for="received_into_ledger_id">Received Into Ledger</label>
                    <input type="text" id="received_into_ledger_id" placeholder="e.g. HDFC Bank" required>
                </div>
                <div class="form-group">
                    <label for="advance_amount">Advance Amount (₹)</label>
                    <input type="number" id="advance_amount" value="0" required>
                </div>
                <div class="form-group">
                    <label for="against_supply_type">Against Supply Type</label>
                    <select id="against_supply_type">
                        <option value="Services">Services</option>
                        <option value="Goods">Goods</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="gst_rate">GST Rate (%)</label>
                    <input type="number" id="gst_rate" value="18">
                </div>
                <div class="form-group">
                    <label for="igst_amount">IGST Amount (If Interstate)</label>
                    <input type="number" id="igst_amount" value="0">
                </div>
                <div class="form-group">
                    <label for="gstr1_section">GSTR-1 Section</label>
                    <input type="text" id="gstr1_section" value="Advance Receipt (Table 11A)">
                </div>
                <div class="form-group">
                    <label for="linked_sales_order_id">Linked Sales Order ID</label>
                    <input type="text" id="linked_sales_order_id" placeholder="Optional">
                </div>
            </div>
        `;
    }
    else if (type === 'RefundVoucher') {
        dynamicFormBody.innerHTML = commonHTML + `
            <div class="form-grid">
                <div class="form-group">
                    <label for="original_advance_receipt_id">Original Advance Receipt ID / No.</label>
                    <input type="text" id="original_advance_receipt_id" placeholder="e.g. ARV/24-25/003" required>
                </div>
                <div class="form-group">
                    <label for="refunded_to">Refunded To</label>
                    <input type="text" id="refunded_to" placeholder="e.g. Anand Traders" required>
                </div>
                <div class="form-group">
                    <label for="refund_amount">Refund Amount (₹)</label>
                    <input type="number" id="refund_amount" value="0" required>
                </div>
                <div class="form-group">
                    <label for="igst_amount">IGST Reversed</label>
                    <input type="number" id="igst_amount" value="0">
                </div>
                <div class="form-group">
                    <label for="gstr1_section">GSTR-1 Section</label>
                    <input type="text" id="gstr1_section" value="Refund Voucher (Table 11B)">
                </div>
                <div class="form-group">
                    <label for="reason">Reason for Refund</label>
                    <input type="text" id="reason" placeholder="Order cancelled before supply">
                </div>
                <div class="form-group">
                    <label for="received_into_ledger_id">Paid From (Ledger)</label>
                    <input type="text" id="received_into_ledger_id" value="HDFC Bank" placeholder="e.g. HDFC Bank">
                </div>
            </div>
        `;
    }
    else if (GST_INVOICES.has(type)) {
        // Form layout for all Tax Invoice variants: Sales, BOS, Export, Purchase, Credit/Debit notes
        let extraFields = '';
        if (type === 'Sales' || type === 'CreditNote') {
            extraFields = `
                <div class="form-group">
                    <label for="invoice_type">Invoice Type</label>
                    <input type="text" id="invoice_type" value="${type === 'Sales' ? 'Tax Invoice' : 'Credit Note'}">
                </div>
                <div class="form-group">
                    <label for="party_gstin">Customer GSTIN</label>
                    <input type="text" id="party_gstin" placeholder="27BBBBB1111B2Z6">
                </div>
                <div class="form-group">
                    <label for="place_of_supply">Place of Supply (PoS)</label>
                    <input type="text" id="place_of_supply" placeholder="MH">
                </div>
                <div class="form-group">
                    <label for="gstr1_section">GSTR-1 Section</label>
                    <input type="text" id="gstr1_section" value="${type === 'Sales' ? 'B2B' : 'CDNR'}">
                </div>
                <div class="form-group">
                    <label for="irn">IRN</label>
                    <input type="text" id="irn" placeholder="1a2b3c...">
                </div>
                <div class="form-group">
                    <label for="irn_ack_no">IRN Ack No.</label>
                    <input type="text" id="irn_ack_no" placeholder="112010012345678">
                </div>
                <div class="form-group">
                    <label for="irn_ack_date">IRN Ack Date</label>
                    <input type="date" id="irn_ack_date" value="${today}">
                </div>
            `;
        } 
        else if (type === 'BillOfSupply') {
            extraFields = `
                <div class="form-group">
                    <label for="seller_gst_status">Seller GST Status</label>
                    <input type="text" id="seller_gst_status" value="Composition Dealer">
                </div>
                <div class="form-group">
                    <label for="party_gstin">Customer GSTIN</label>
                    <input type="text" id="party_gstin" placeholder="27CCCCC2222C1Z5">
                </div>
                <div class="form-group">
                    <label for="place_of_supply">Place of Supply (PoS)</label>
                    <input type="text" id="place_of_supply" value="MH">
                </div>
                <div class="form-group full">
                    <label for="composition_note">Composition Note</label>
                    <input type="text" id="composition_note" value="Composition taxable person, not eligible to collect tax on outward supplies">
                </div>
                <div class="form-group check-row">
                    <input type="checkbox" id="gstr4_applicable" checked>
                    <label for="gstr4_applicable">GSTR-4 Applicable</label>
                </div>
            `;
        }
        else if (type === 'ExportInvoice') {
            extraFields = `
                <div class="form-group">
                    <label for="export_type">Export Type</label>
                    <input type="text" id="export_type" value="LUT - Without Payment of IGST">
                </div>
                <div class="form-group">
                    <label for="lut_arn">LUT ARN</label>
                    <input type="text" id="lut_arn" placeholder="AD2707260012345X">
                </div>
                <div class="form-group">
                    <label for="consignee_country">Consignee Country</label>
                    <input type="text" id="consignee_country" value="UAE">
                </div>
                <div class="form-group">
                    <label for="currency">Currency</label>
                    <input type="text" id="currency" value="USD">
                </div>
                <div class="form-group">
                    <label for="exchange_rate">Exchange Rate</label>
                    <input type="number" id="exchange_rate" value="83.2">
                </div>
                <div class="form-group">
                    <label for="gstr1_section">GSTR-1 Section</label>
                    <input type="text" id="gstr1_section" value="EXP">
                </div>
            `;
        }
        else if (type === 'Purchase' || type === 'DebitNote') {
            extraFields = `
                <div class="form-group">
                    <label for="supplier_invoice_number">Supplier Invoice Number</label>
                    <input type="text" id="supplier_invoice_number" placeholder="GST/1187">
                </div>
                <div class="form-group">
                    <label for="gstr2b_match_status">GSTR-2B Match Status</label>
                    <select id="gstr2b_match_status">
                        <option value="Matched">Matched</option>
                        <option value="Mismatched">Mismatched</option>
                        <option value="Missing">Missing</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="itc_claim_status">ITC Claim Status</label>
                    <select id="itc_claim_status">
                        <option value="Eligible">Eligible</option>
                        <option value="Ineligible">Ineligible</option>
                        <option value="Reversed">Reversed</option>
                    </select>
                </div>
            `;
        }
        else if (type === 'SelfInvoiceRCM') {
            extraFields = `
                <div class="form-group">
                    <label for="supplier_name">Supplier Name</label>
                    <input type="text" id="supplier_name" placeholder="Ramesh Transport (URD)" required>
                </div>
                <div class="form-group">
                    <label for="reverse_charge_notification">RCM Notification Reference</label>
                    <input type="text" id="reverse_charge_notification" value="Sec 9(4) / GTA Notification">
                </div>
                <div class="form-group">
                    <label for="tax_paid_by">Tax Paid By</label>
                    <input type="text" id="tax_paid_by" value="Recipient">
                </div>
                <div class="form-group">
                    <label for="gstr3b_table">GSTR-3B Table Reference</label>
                    <input type="text" id="gstr3b_table" value="3.1(d)">
                </div>
                <div class="form-group check-row">
                    <input type="checkbox" id="supplier_registered">
                    <label for="supplier_registered">Supplier Registered</label>
                </div>
                <div class="form-group check-row">
                    <input type="checkbox" id="itc_eligible" checked>
                    <label for="itc_eligible">ITC Eligible</label>
                </div>
            `;
        }

        // Shared note reference fields for notes
        if (type === 'CreditNote' || type === 'DebitNote') {
            extraFields += `
                <div class="form-group">
                    <label for="original_voucher_id">Original Invoice Number</label>
                    <input type="text" id="original_voucher_id" placeholder="SL/24-25/0182" required>
                </div>
                <div class="form-group">
                    <label for="original_voucher_date">Original Invoice Date</label>
                    <input type="date" id="original_voucher_date" value="${today}">
                </div>
                <div class="form-group full">
                    <label for="reason">Reason for Note</label>
                    <input type="text" id="reason" placeholder="e.g. Sales Return / Quantity Difference">
                </div>
            `;
        }

        dynamicFormBody.innerHTML = commonHTML + `
            <div class="form-grid">
                <div class="form-group">
                    <label for="party">Customer / Supplier Name</label>
                    <input type="text" id="party" placeholder="e.g. Anand Traders" required>
                </div>
                ${extraFields}
            </div>
            
            <div class="form-section-header"><i class="ti ti-package"></i> Line Items</div>
            <div class="item-rows-container" id="item-rows-container"></div>
            <div style="padding:0 20px 20px;">
                <button type="button" class="btn btn-secondary btn-sm" id="add-item-btn" onclick="createItemRow()"><i class="ti ti-plus"></i> Add Item</button>
            </div>
        `;
        createItemRow();
    }
    else if (INVENTORY_VOUCHERS.has(type) || PRESALES_VOUCHERS.has(type)) {
        let extraFields = '';
        if (type === 'PurchaseOrder' || type === 'SalesOrder' || type === 'JobWorkOutOrder' || type === 'Quotation') {
            extraFields = `
                <div class="form-group">
                    <label for="expected_delivery_date">${type === 'Quotation' ? 'Valid Until' : 'Expected Delivery Date'}</label>
                    <input type="date" id="expected_delivery_date" value="${today}">
                </div>
                <div class="form-group">
                    <label for="status">Order Status</label>
                    <select id="status">
                        <option value="Open">Open</option>
                        <option value="Closed">Closed</option>
                        <option value="Pending">Pending</option>
                    </select>
                </div>
            `;
            if (type === 'SalesOrder') {
                extraFields += `
                    <div class="form-group">
                        <label for="advance_received">Advance Received (₹)</label>
                        <input type="number" id="advance_received" value="0">
                    </div>
                `;
            }
            if (type === 'JobWorkOutOrder') {
                extraFields += `
                    <div class="form-group">
                        <label for="job_worker_name">Job Worker Name</label>
                        <input type="text" id="job_worker_name" placeholder="Shree Dyeing Works">
                    </div>
                `;
            }
        } 
        else if (type === 'DeliveryNote' || type === 'DeliveryChallan') {
            extraFields = `
                <div class="form-group">
                    <label for="e_way_bill_no">E-Way Bill Number</label>
                    <input type="text" id="e_way_bill_no" placeholder="301122334455">
                </div>
                <div class="form-group">
                    <label for="vehicle_number">Vehicle Number</label>
                    <input type="text" id="vehicle_number" placeholder="MH12AB1234">
                </div>
            `;
            if (type === 'DeliveryNote') {
                extraFields += `
                    <div class="form-group">
                        <label for="linked_sales_order_id">Linked Sales Order ID</label>
                        <input type="text" id="linked_sales_order_id" placeholder="SO/24-25/044">
                    </div>
                `;
            } else {
                extraFields += `
                    <div class="form-group">
                        <label for="purpose">Challan Purpose</label>
                        <input type="text" id="purpose" value="Job Work - Sent for Dyeing">
                    </div>
                    <div class="form-group">
                        <label for="linked_job_work_out_order_id">Linked Job Work Out Order ID</label>
                        <input type="text" id="linked_job_work_out_order_id" placeholder="JWO/24-25/002">
                    </div>
                    <div class="form-group">
                        <label for="expected_return_date">Expected Return Date</label>
                        <input type="date" id="expected_return_date" value="${today}">
                    </div>
                    <div class="form-group check-row">
                        <input type="checkbox" id="is_taxable_supply">
                        <label for="is_taxable_supply">Is Taxable Supply</label>
                    </div>
                `;
            }
        }
        else if (type === 'ReceiptNote') {
            extraFields = `
                <div class="form-group">
                    <label for="linked_purchase_order_id">Linked Purchase Order ID</label>
                    <input type="text" id="linked_purchase_order_id" placeholder="PO/24-25/033">
                </div>
            `;
        }
        else if (type === 'MaterialIn') {
            extraFields = `
                <div class="form-group">
                    <label for="linked_job_work_out_order_id">Linked Job Work Order ID</label>
                    <input type="text" id="linked_job_work_out_order_id" placeholder="JWO/24-25/002">
                </div>
            `;
        }
        else if (type === 'RejectionIn' || type === 'RejectionOut') {
            extraFields = `
                <div class="form-group">
                    <label for="linked_reference_id">${type === 'RejectionIn' ? 'Linked Delivery Note ID' : 'Linked Receipt Note ID'}</label>
                    <input type="text" id="linked_reference_id" placeholder="e.g. DC/24-25/077">
                </div>
            `;
        }
        else if (type === 'StockJournal') {
            extraFields = `
                <div class="form-group">
                    <label for="journal_type">Journal Type</label>
                    <input type="text" id="journal_type" value="Transfer">
                </div>
            `;
        }
        else if (type === 'PhysicalStock') {
            extraFields = `
                <div class="form-group">
                    <label for="count_date">Stock Count Date</label>
                    <input type="date" id="count_date" value="${today}">
                </div>
                <div class="form-group">
                    <label for="godown_id">Godown</label>
                    <input type="text" id="godown_id" placeholder="Main Godown">
                </div>
            `;
        }

        dynamicFormBody.innerHTML = commonHTML + `
            <div class="form-grid">
                <div class="form-group">
                    <label for="party">Party / Recipient Name</label>
                    <input type="text" id="party" placeholder="e.g. Anand Traders" required>
                </div>
                ${extraFields}
            </div>
            
            <div class="form-section-header"><i class="ti ti-package"></i> Inventory Items</div>
            <div class="item-rows-container" id="item-rows-container"></div>
            <div style="padding:0 20px 20px;">
                <button type="button" class="btn btn-secondary btn-sm" id="add-item-btn" onclick="createItemRow()"><i class="ti ti-plus"></i> Add Item</button>
            </div>
        `;
        createItemRow();
    }
}

// Helper Row Adders for UI templates (Global Scope for inline onclick)
window.addDebitEntryRow = function() {
    const container = document.getElementById('debit-entries-container');
    const row = document.createElement('div');
    row.className = 'entry-row dr-row';
    row.innerHTML = `
        <div class="form-group">
            <label>Ledger ID / Account Name</label>
            <input type="text" class="entry-ledger" placeholder="e.g. Office Rent" required>
        </div>
        <div class="form-group">
            <label>Debit Amount</label>
            <input type="number" class="entry-amount" value="0" required>
        </div>
        <div class="form-group"><span style="font-size:11px;font-weight:700;color:var(--blue-light);">Dr</span></div>
        <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()"><i class="ti ti-trash"></i></button>
    `;
    container.appendChild(row);
};

window.addCreditEntryRow = function() {
    const container = document.getElementById('credit-entries-container');
    const row = document.createElement('div');
    row.className = 'entry-row cr-row';
    row.innerHTML = `
        <div class="form-group">
            <label>Ledger ID / Account Name</label>
            <input type="text" class="entry-ledger" placeholder="e.g. Anand Traders" required>
        </div>
        <div class="form-group">
            <label>Credit Amount</label>
            <input type="number" class="entry-amount" value="0" required>
        </div>
        <div class="form-group"><span style="font-size:11px;font-weight:700;color:var(--green);">Cr</span></div>
        <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()"><i class="ti ti-trash"></i></button>
    `;
    container.appendChild(row);
};

window.addJournalEntryRow = function() {
    const container = document.getElementById('journal-entries-container');
    const row = document.createElement('div');
    row.className = 'entry-row';
    row.innerHTML = `
        <div class="form-group">
            <label>Ledger ID</label>
            <input type="text" class="entry-ledger" placeholder="e.g. Input CGST" required>
        </div>
        <div class="form-group">
            <label>Entry Type</label>
            <select class="entry-type">
                <option value="Debit">Debit</option>
                <option value="Credit">Credit</option>
            </select>
        </div>
        <div class="form-group">
            <label>Amount</label>
            <input type="number" class="entry-amount" value="0" required>
        </div>
        <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()"><i class="ti ti-trash"></i></button>
    `;
    container.appendChild(row);
};

window.createItemRow = function() {
    const container = document.getElementById('item-rows-container');
    const type = voucherTypeSelect.value;
    const isPhysical = type === 'PhysicalStock';
    const isStockJournal = type === 'StockJournal';
    const isMaterialIn = type === 'MaterialIn';
    const isRejection = type.startsWith('Rejection');

    const row = document.createElement('div');
    row.className = 'item-row';

    if (isPhysical) {
        row.innerHTML = `
            <div class="form-group" style="flex:2;">
                <label>Item Name</label>
                <input type="text" class="item-name" placeholder="Grey fabric" required>
            </div>
            <div class="form-group">
                <label>Book Qty</label>
                <input type="number" class="book-qty" value="0">
            </div>
            <div class="form-group">
                <label>Physical Qty</label>
                <input type="number" class="phys-qty" value="0">
            </div>
            <div class="form-group">
                <label>Variance</label>
                <input type="number" class="variance" value="0">
            </div>
            <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()"><i class="ti ti-trash"></i></button>
        `;
    } 
    else if (isStockJournal) {
        row.innerHTML = `
            <div class="form-group" style="flex:2;">
                <label>Item Name</label>
                <input type="text" class="item-name" placeholder="Grey fabric" required>
            </div>
            <div class="form-group">
                <label>Qty</label>
                <input type="number" class="qty-input" value="1">
            </div>
            <div class="form-group">
                <label>Source Godown</label>
                <input type="text" class="src-godown" placeholder="Main Godown">
            </div>
            <div class="form-group">
                <label>Dest Godown</label>
                <input type="text" class="dest-godown" placeholder="Branch Godown">
            </div>
            <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()"><i class="ti ti-trash"></i></button>
        `;
    }
    else if (isMaterialIn) {
        row.innerHTML = `
            <div class="form-group" style="flex:2;">
                <label>Item Name</label>
                <input type="text" class="item-name" placeholder="Dyed fabric" required>
            </div>
            <div class="form-group">
                <label>Qty Sent</label>
                <input type="number" class="qty-sent" value="100">
            </div>
            <div class="form-group">
                <label>Qty Recv</label>
                <input type="number" class="qty-recv" value="98">
            </div>
            <div class="form-group">
                <label>Loss</label>
                <input type="number" class="qty-loss" value="2">
            </div>
            <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()"><i class="ti ti-trash"></i></button>
        `;
    }
    else if (isRejection) {
        row.innerHTML = `
            <div class="form-group" style="flex:2;">
                <label>Item Name</label>
                <input type="text" class="item-name" placeholder="Cotton fabric roll" required>
            </div>
            <div class="form-group">
                <label>Quantity</label>
                <input type="number" class="qty-input" value="1">
            </div>
            <div class="form-group" style="flex:1.5;">
                <label>Reason</label>
                <input type="text" class="reason-input" placeholder="Colour mismatch">
            </div>
            <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()"><i class="ti ti-trash"></i></button>
        `;
    }
    else {
        // Standard Invoice / Order Line Item row (supports autocomplete)
        row.className += ' with-godown';
        row.innerHTML = `
            <div class="form-group item-select-container" style="flex:2;">
                <label>Item</label>
                <div class="custom-select-wrapper">
                    <input type="text" class="item-input" placeholder="Select stock item..." readonly>
                    <div class="custom-dropdown-menu item-dropdown"></div>
                </div>
            </div>
            <div class="form-group godown-select-container" style="flex:1.3;">
                <label>Godown</label>
                <div class="custom-select-wrapper">
                    <input type="text" class="godown-input" placeholder="Select item first..." readonly disabled>
                    <div class="custom-dropdown-menu godown-dropdown"></div>
                </div>
            </div>
            <div class="form-group">
                <label>Qty</label>
                <input type="number" class="qty-input" value="1" min="1">
            </div>
            <div class="form-group">
                <label>Rate (₹)</label>
                <input type="number" class="rate-input" value="0">
            </div>
            <button type="button" class="btn btn-danger btn-sm remove-item-btn" onclick="this.parentElement.remove()"><i class="ti ti-trash"></i></button>
        `;

        const itemInput     = row.querySelector('.item-input');
        const itemDropdown  = row.querySelector('.item-dropdown');
        const godownInput   = row.querySelector('.godown-input');
        const godownDropdown = row.querySelector('.godown-dropdown');

        itemInput.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            document.querySelectorAll('.custom-dropdown-menu').forEach(m => {
                if (m !== itemDropdown) m.classList.remove('show');
            });
            populateItemDropdown(itemDropdown, itemInput, godownInput, godownDropdown);
            itemDropdown.classList.toggle('show');
        });

        godownInput.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            if (godownInput.disabled) return;
            document.querySelectorAll('.custom-dropdown-menu').forEach(m => {
                if (m !== godownDropdown) m.classList.remove('show');
            });
            godownDropdown.classList.toggle('show');
        });
    }

    container.appendChild(row);
};

function populateItemDropdown(menu, itemInput, godownInput, godownDropdown) {
    menu.innerHTML = '';
    if (!inventoryItems.length) {
        menu.innerHTML = '<div style="padding:10px;color:var(--text-lo);font-size:13px;">No items in inventory</div>';
        return;
    }
    inventoryItems.forEach(item => {
        const opt = document.createElement('div');
        opt.className = 'dropdown-item-option';
        opt.innerHTML = `<span>${item.item}</span><span class="price">₹${Number(item.rate).toLocaleString('en-IN')}</span>`;
        opt.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            itemInput.value = item.item;
            itemInput.dataset.rate = item.rate;
            menu.classList.remove('show');
            
            // Set rate input automatically
            const rateInput = itemInput.closest('.item-row').querySelector('.rate-input');
            if (rateInput) rateInput.value = item.rate;

            activateGodownDropdown(item.item, godownInput, godownDropdown);
        });
        menu.appendChild(opt);
    });
}

function activateGodownDropdown(itemName, godownInput, godownDropdown) {
    const godownNames = getGodownsForItem(itemName);
    godownInput.value = '';
    delete godownInput.dataset.godown;
    godownDropdown.innerHTML = '';

    if (!godownNames.length) {
        godownInput.placeholder = 'No stock available';
        godownInput.disabled = true;
        return;
    }

    godownInput.placeholder = 'Select a godown...';
    godownInput.disabled = false;

    godownNames.forEach(name => {
        const stockItem = inventoryItems.find(i => i.item === itemName);
        const qty = stockItem?.godowns?.[name] ?? 0;
        const opt = document.createElement('div');
        opt.className = 'dropdown-item-option';
        opt.innerHTML = `<span>${name}</span><span class="price" style="color:var(--blue-light);">${qty} available</span>`;
        opt.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            godownInput.value = name;
            godownInput.dataset.godown = name;
            godownDropdown.classList.remove('show');
        });
        godownDropdown.appendChild(opt);
    });
}

// Close menus on click away
document.addEventListener('click', () => {
    document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.remove('show'));
});

// ── GENERATE VOUCHER HANDLER ──────────────────────────────────────────────────
generateBtn.addEventListener('click', async function (e) {
    e.preventDefault();
    e.stopPropagation();

    const type = voucherTypeSelect.value;
    const isSales = type === 'Sales';

    // Extract common fields
    const voucherNoRaw = document.getElementById('voucher_number')?.value.trim();
    const date = document.getElementById('date').value;
    const company = document.getElementById('company_name').value.trim() || 'LICERIA & CO.';

    // Generate full voucher ID
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const voucherNo = voucherNoRaw || `VCH-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    // Collect all type-specific parameters into meta
    const meta = {
        voucher_type: type,
        voucher_number: voucherNo,
        date: date,
        company_name: company
    };

    let amount = 0;
    let gstAmount = 0;
    let party = '';
    let items = [];

    // Parse according to type
    if (type === 'Payment') {
        meta.mode = document.getElementById('mode').value;
        meta.paid_from_ledger_id = document.getElementById('paid_from_ledger_id').value.trim();
        meta.tds_applicable = document.getElementById('tds_applicable').checked;
        meta.tds_section = document.getElementById('tds_section').value.trim();
        meta.tds_amount = parseFloat(document.getElementById('tds_amount').value) || 0;
        meta.narration = document.getElementById('narration').value.trim();
        party = meta.paid_from_ledger_id;

        const debits = [];
        document.querySelectorAll('#debit-entries-container .entry-row').forEach(row => {
            const ledger = row.querySelector('.entry-ledger').value.trim();
            const amt = parseFloat(row.querySelector('.entry-amount').value) || 0;
            debits.push({ ledger_id: ledger, amount: amt });
            amount += amt;
        });
        meta.debit_entries = debits;
        gstAmount = meta.tds_amount; // Store TDS here for indexing
    } 
    else if (type === 'Receipt') {
        meta.mode = document.getElementById('mode').value;
        meta.received_into_ledger_id = document.getElementById('received_into_ledger_id').value.trim();
        meta.advance_against_sales_order_id = document.getElementById('advance_against_sales_order_id').value.trim() || null;
        meta.narration = document.getElementById('narration').value.trim();
        party = meta.received_into_ledger_id;

        const credits = [];
        document.querySelectorAll('#credit-entries-container .entry-row').forEach(row => {
            const ledger = row.querySelector('.entry-ledger').value.trim();
            const amt = parseFloat(row.querySelector('.entry-amount').value) || 0;
            credits.push({ ledger_id: ledger, amount: amt });
            amount += amt;
        });
        meta.credit_entries = credits;
    }
    else if (type === 'Contra') {
        meta.from_ledger_id = document.getElementById('from_ledger_id').value.trim();
        meta.to_ledger_id = document.getElementById('to_ledger_id').value.trim();
        meta.amount = parseFloat(document.getElementById('amount').value) || 0;
        meta.narration = document.getElementById('narration').value.trim();
        party = `${meta.from_ledger_id} -> ${meta.to_ledger_id}`;
        amount = meta.amount;
    }
    else if (type === 'Journal' || type === 'Memorandum' || type === 'ReversingJournal') {
        meta.narration = document.getElementById('narration').value.trim();
        if (type === 'Journal') {
            meta.is_gst_adjustment = document.getElementById('is_gst_adjustment').checked;
            meta.adjustment_type = document.getElementById('adjustment_type').value.trim();
        } else if (type === 'Memorandum') {
            meta.purpose = document.getElementById('purpose').value.trim();
            meta.posted_to_books = document.getElementById('posted_to_books').checked;
        } else if (type === 'ReversingJournal') {
            meta.applicable_date = document.getElementById('applicable_date').value;
            meta.auto_reverses_on = document.getElementById('auto_reverses_on').value;
            meta.purpose = document.getElementById('purpose').value.trim();
        }

        const entries = [];
        document.querySelectorAll('#journal-entries-container .entry-row').forEach(row => {
            const ledger = row.querySelector('.entry-ledger').value.trim();
            const etype = row.querySelector('.entry-type').value;
            const amt = parseFloat(row.querySelector('.entry-amount').value) || 0;
            entries.push({ ledger_id: ledger, type: etype, amount: amt });
            amount += amt; // Gross debit/credit total
        });
        meta.entries = entries;
        party = 'Journal Adjustment';
    }
    else if (type === 'AdvanceReceipt') {
        meta.received_from = document.getElementById('received_from').value.trim();
        meta.received_into_ledger_id = document.getElementById('received_into_ledger_id').value.trim();
        meta.advance_amount = parseFloat(document.getElementById('advance_amount').value) || 0;
        meta.against_supply_type = document.getElementById('against_supply_type').value;
        meta.gst_rate = parseFloat(document.getElementById('gst_rate').value) || 0;
        meta.tax_liability = { igst_amount: parseFloat(document.getElementById('igst_amount').value) || 0 };
        meta.gstr1_section = document.getElementById('gstr1_section').value.trim();
        meta.linked_sales_order_id = document.getElementById('linked_sales_order_id').value.trim() || null;
        
        party = meta.received_from;
        amount = meta.advance_amount;
        gstAmount = meta.tax_liability.igst_amount;
    }
    else if (type === 'RefundVoucher') {
        meta.original_advance_receipt_id = document.getElementById('original_advance_receipt_id').value.trim();
        meta.refunded_to = document.getElementById('refunded_to').value.trim();
        meta.refund_amount = parseFloat(document.getElementById('refund_amount').value) || 0;
        meta.tax_reversed = { igst_amount: parseFloat(document.getElementById('igst_amount').value) || 0 };
        meta.gstr1_section = document.getElementById('gstr1_section').value.trim();
        meta.reason = document.getElementById('reason').value.trim();
        meta.received_into_ledger_id = document.getElementById('received_into_ledger_id').value.trim();

        party = meta.refunded_to;
        amount = meta.refund_amount;
        gstAmount = meta.tax_reversed.igst_amount;
    }
    else if (GST_INVOICES.has(type)) {
        party = document.getElementById('party')?.value?.trim() || '';
        
        if (type === 'Sales' || type === 'CreditNote') {
            meta.invoice_type = document.getElementById('invoice_type')?.value?.trim() || '';
            meta.party_gstin = document.getElementById('party_gstin')?.value?.trim() || '';
            meta.place_of_supply = document.getElementById('place_of_supply')?.value?.trim() || '';
            meta.gstr1_section = document.getElementById('gstr1_section')?.value?.trim() || '';
            meta.irn = document.getElementById('irn')?.value?.trim() || '';
            meta.irn_ack_no = document.getElementById('irn_ack_no')?.value?.trim() || '';
            meta.irn_ack_date = document.getElementById('irn_ack_date')?.value || '';
        } 
        else if (type === 'BillOfSupply') {
            meta.seller_gst_status = document.getElementById('seller_gst_status')?.value?.trim() || '';
            meta.party_gstin = document.getElementById('party_gstin')?.value?.trim() || '';
            meta.place_of_supply = document.getElementById('place_of_supply')?.value?.trim() || '';
            meta.composition_note = document.getElementById('composition_note')?.value?.trim() || '';
            meta.gstr4_applicable = document.getElementById('gstr4_applicable')?.checked || false;
        }
        else if (type === 'ExportInvoice') {
            meta.export_type = document.getElementById('export_type')?.value?.trim() || '';
            meta.lut_arn = document.getElementById('lut_arn')?.value?.trim() || '';
            meta.consignee_country = document.getElementById('consignee_country')?.value?.trim() || '';
            meta.currency = document.getElementById('currency')?.value?.trim() || '';
            meta.exchange_rate = parseFloat(document.getElementById('exchange_rate')?.value) || 1;
            meta.gstr1_section = document.getElementById('gstr1_section')?.value?.trim() || '';
        }
        else if (type === 'Purchase' || type === 'DebitNote') {
            meta.supplier_invoice_number = document.getElementById('supplier_invoice_number')?.value?.trim() || '';
            meta.gstr2b_match_status = document.getElementById('gstr2b_match_status')?.value || '';
            meta.itc_claim_status = document.getElementById('itc_claim_status')?.value || '';
        }
        else if (type === 'SelfInvoiceRCM') {
            meta.supplier_name = document.getElementById('supplier_name')?.value?.trim() || '';
            meta.supplier_registered = document.getElementById('supplier_registered')?.checked || false;
            meta.reverse_charge_notification = document.getElementById('reverse_charge_notification')?.value?.trim() || '';
            meta.tax_paid_by = document.getElementById('tax_paid_by')?.value?.trim() || '';
            meta.itc_eligible = document.getElementById('itc_eligible')?.checked || false;
            meta.gstr3b_table = document.getElementById('gstr3b_table')?.value?.trim() || '';
        }

        if (type === 'CreditNote' || type === 'DebitNote') {
            meta.original_voucher_id = document.getElementById('original_voucher_id')?.value?.trim() || '';
            meta.original_voucher_date = document.getElementById('original_voucher_date')?.value || '';
            meta.reason = document.getElementById('reason')?.value?.trim() || '';
        }

        // Collect Line Items
        const lines = [];
        document.querySelectorAll('#item-rows-container .item-row').forEach(row => {
            const itemInp = row.querySelector('.item-input') || row.querySelector('.item-name');
            const gdInp   = row.querySelector('.godown-input') || row.querySelector('.src-godown');
            const qtyInp  = row.querySelector('.qty-input');
            const rateInp = row.querySelector('.rate-input');

            const item_name = itemInp ? itemInp.value.trim() : '';
            const qty = parseInt(qtyInp ? qtyInp.value : '1', 10) || 1;
            const rate = parseFloat(rateInp ? rateInp.value : '0') || 0;
            const godown = gdInp ? gdInp.value.trim() : null;

            lines.push({
                item: item_name,
                hsn_sac_code: "9988", // Default HSN
                quantity: qty,
                unit: "pcs",
                rate: rate,
                taxable_value: qty * rate,
                gst_rate: 18,
                igst_amount: qty * rate * 0.18,
                godown_id: godown
            });

            items.push({
                item_name: item_name,
                qty: qty,
                rate: rate,
                godown: godown
            });

            amount += qty * rate;
        });

        meta.line_items = lines;
        gstAmount = amount * 0.18;
        meta.total_taxable_value = amount;
        meta.total_tax = gstAmount;
        meta.grand_total = amount + gstAmount;
    }
    else if (INVENTORY_VOUCHERS.has(type) || PRESALES_VOUCHERS.has(type)) {
        party = document.getElementById('party')?.value?.trim() || '';

        if (type === 'PurchaseOrder' || type === 'SalesOrder' || type === 'JobWorkOutOrder' || type === 'Quotation') {
            meta.expected_delivery_date = document.getElementById('expected_delivery_date')?.value || '';
            meta.status = document.getElementById('status')?.value || '';
            if (type === 'SalesOrder') {
                meta.advance_received = parseFloat(document.getElementById('advance_received')?.value) || 0;
            }
            if (type === 'JobWorkOutOrder') {
                meta.job_worker_name = document.getElementById('job_worker_name')?.value?.trim() || '';
            }
            if (type === 'Quotation') {
                meta.valid_until = meta.expected_delivery_date;
            }
        }
        else if (type === 'DeliveryNote' || type === 'DeliveryChallan') {
            meta.e_way_bill_no = document.getElementById('e_way_bill_no')?.value?.trim() || '';
            meta.vehicle_number = document.getElementById('vehicle_number')?.value?.trim() || '';
            if (type === 'DeliveryNote') {
                meta.linked_sales_order_id = document.getElementById('linked_sales_order_id')?.value?.trim() || '';
            } else {
                meta.purpose = document.getElementById('purpose')?.value?.trim() || '';
                meta.linked_job_work_out_order_id = document.getElementById('linked_job_work_out_order_id')?.value?.trim() || '';
                meta.expected_return_date = document.getElementById('expected_return_date')?.value || '';
                meta.is_taxable_supply = document.getElementById('is_taxable_supply')?.checked || false;
            }
        }
        else if (type === 'ReceiptNote') {
            meta.linked_purchase_order_id = document.getElementById('linked_purchase_order_id')?.value?.trim() || '';
        }
        else if (type === 'MaterialIn') {
            meta.linked_job_work_out_order_id = document.getElementById('linked_job_work_out_order_id')?.value?.trim() || '';
        }
        else if (type === 'RejectionIn' || type === 'RejectionOut') {
            meta.linked_reference_id = document.getElementById('linked_reference_id')?.value?.trim() || '';
        }
        else if (type === 'StockJournal') {
            meta.journal_type = document.getElementById('journal_type')?.value?.trim() || '';
        }
        else if (type === 'PhysicalStock') {
            meta.count_date = document.getElementById('count_date')?.value || '';
            meta.godown_id = document.getElementById('godown_id')?.value?.trim() || '';
        }

        // Collect items
        const lines = [];
        const stockJournalSrc = [];
        const stockJournalDst = [];

        document.querySelectorAll('#item-rows-container .item-row').forEach(row => {
            if (type === 'PhysicalStock') {
                const name = row.querySelector('.item-name')?.value?.trim() || '';
                const book = parseFloat(row.querySelector('.book-qty')?.value) || 0;
                const phys = parseFloat(row.querySelector('.phys-qty')?.value) || 0;
                const variance = parseFloat(row.querySelector('.variance')?.value) || 0;
                lines.push({ item: name, book_quantity: book, physical_quantity: phys, variance: variance });
            }
            else if (type === 'StockJournal') {
                const name = row.querySelector('.item-name')?.value?.trim() || '';
                const qty = parseFloat(row.querySelector('.qty-input')?.value) || 0;
                const src = row.querySelector('.src-godown')?.value?.trim() || '';
                const dst = row.querySelector('.dest-godown')?.value?.trim() || '';
                stockJournalSrc.push({ item: name, quantity: qty, godown_id: src });
                stockJournalDst.push({ item: name, quantity: qty, godown_id: dst });
            }
            else if (type === 'MaterialIn') {
                const name = row.querySelector('.item-name')?.value?.trim() || '';
                const sent = parseFloat(row.querySelector('.qty-sent')?.value) || 0;
                const recv = parseFloat(row.querySelector('.qty-recv')?.value) || 0;
                const loss = parseFloat(row.querySelector('.qty-loss')?.value) || 0;
                lines.push({ item: name, quantity_sent: sent, quantity_received: recv, process_loss: loss });
            }
            else if (type === 'RejectionIn' || type === 'RejectionOut') {
                const name = row.querySelector('.item-name')?.value?.trim() || '';
                const qty = parseFloat(row.querySelector('.qty-input')?.value) || 0;
                const reason = row.querySelector('.reason-input')?.value?.trim() || '';
                lines.push({ item: name, quantity: qty, reason: reason });
            }
            else {
                // Standard Autocomplete Row
                const itemInp = row.querySelector('.item-input') || row.querySelector('.item-name');
                const gdInp   = row.querySelector('.godown-input') || row.querySelector('.src-godown');
                const qtyInp  = row.querySelector('.qty-input');
                const rateInp = row.querySelector('.rate-input');

                const item_name = itemInp ? itemInp.value.trim() : '';
                const qty = parseInt(qtyInp ? qtyInp.value : '1', 10) || 1;
                const rate = parseFloat(rateInp ? rateInp.value : '0') || 0;
                const godown = gdInp ? gdInp.value.trim() : null;

                lines.push({
                    item: item_name,
                    quantity: qty,
                    rate: rate,
                    godown_id: godown
                });

                items.push({
                    item_name: item_name,
                    qty: qty,
                    rate: rate,
                    godown: godown
                });

                amount += qty * rate;
            }
        });

        if (type === 'StockJournal') {
            meta.source_items = stockJournalSrc;
            meta.destination_items = stockJournalDst;
        } else {
            meta.line_items = lines;
        }
    }

    generateBtn.disabled = true;
    generateBtn.innerHTML = '<i class="ti ti-loader-2" style="display:inline-block;animation:spin 1s linear infinite;"></i> Generating…';

    // ── Step 1: Generate & Download PDF Immediately ───────────────────────────
    try {
        const pdfPayload = {
            voucher_type: type,
            company_name: company,
            invoice_no: voucherNo,
            issued_date: date,
            meta: meta
        };

        const res = await fetch(`${API_BASE}/generate-invoice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pdfPayload),
        });
        if (!res.ok) throw new Error('PDF Generation Failed.');
        
        const pdfBlob = await res.blob();
        const blobUrl = URL.createObjectURL(pdfBlob);

        const anchor = document.createElement('a');
        anchor.href = blobUrl;
        anchor.download = `${type}_${voucherNo}.pdf`;
        anchor.target = '_blank';
        anchor.rel = 'noopener';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();

        setTimeout(() => {
            if (document.body.contains(anchor)) {
                document.body.removeChild(anchor);
            }
            URL.revokeObjectURL(blobUrl);
        }, 15000);

        if (typeof showToast === 'function') showToast('Voucher PDF downloaded!', 'success');
    } catch (err) {
        console.error('PDF Error:', err);
        if (typeof showToast === 'function') showToast('Failed to generate PDF.', 'error');
        generateBtn.disabled = false;
        generateBtn.innerHTML = `<i class="ti ti-file-invoice"></i> Generate &amp; Download ${type}`;
        return;
    }

    // ── Step 2: Save Voucher Entry in Database ───────────────────────────────
    try {
        const voucherPayload = [{
            voucher_type: type,
            date: date,
            voucher_no: voucherNo,
            party: party || 'General Entry',
            items: items,
            amount: amount,
            gst_amount: gstAmount,
            discount: 0,
            status: 'pending',
            meta_type: type,
            meta: meta
        }];

        const vRes = await fetch(`${API_BASE}/add-voucher`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(voucherPayload)
        });

        if (vRes.ok) {
            if (typeof showToast === 'function') showToast('Voucher saved successfully!', 'success');
            await fetchAllVouchers();
        } else {
            console.error('Failed to save voucher entry:', vRes.status);
        }
    } catch (err) {
        console.error('Voucher save error:', err);
    }

    // ── Step 3: Trigger inventory stock adjustment (only for Sales) ───────────
    if (isSales && items.length > 0) {
        try {
            const syncItems = items.map(item => ({
                item_name: item.item_name,
                qty: item.qty,
                godown: (item.godown && !item.godown.startsWith('Select')) ? item.godown : null
            })).filter(i => i.item_name);

            if (syncItems.length > 0) {
                const sRes = await fetch(`${API_BASE}/sync-invoice-stock`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: syncItems, revert: false })
                });
                if (sRes.ok) {
                    const dataJson = await sRes.json();
                    console.log('Inventory synced successfully:', dataJson);
                } else {
                    console.error('Inventory sync error response:', await sRes.text());
                }
                await fetchInventory();
            }
        } catch (err) {
            console.error('Inventory sync exception:', err);
        }
    }

    // Reset and clean up
    renderFormTemplate(type);
    generateBtn.disabled = false;
    generateBtn.innerHTML = `<i class="ti ti-file-invoice"></i> Generate &amp; Download ${type}`;
});

// ── VOUCHER LISTING & FILTERS ─────────────────────────────────────────────────
async function fetchAllVouchers() {
    try {
        const res = await fetch(`${API_BASE}/vouchers`);
        if (!res.ok) throw new Error();
        salesInvoices = await res.json();
        renderInvoiceList();
    } catch (err) {
        console.error("Failed to fetch vouchers:", err);
    }
}

function renderInvoiceList() {
    if (!invoiceListContainer) return;

    const startDate = document.getElementById('filter-start-date').value;
    const endDate = document.getElementById('filter-end-date').value;
    const typeFilter = document.getElementById('filter-voucher-type')?.value || 'All';

    const filtered = salesInvoices.filter(v => {
        if (startDate && v.date < startDate) return false;
        if (endDate && v.date > endDate) return false;
        if (typeFilter !== 'All' && v.voucher_type?.toLowerCase() !== typeFilter.toLowerCase()) return false;
        return true;
    });

    if (filtered.length === 0) {
        invoiceListContainer.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-lo); font-size:13px;">No vouchers found.</div>';
        return;
    }

    invoiceListContainer.innerHTML = filtered.map(v => {
        const formattedAmt = '₹' + Number((v.amount || 0) + (v.gst_amount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const dateStr = v.date ? new Date(v.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        const vtype = v.voucher_type || 'Sales';

        let itemsHtml = '';
        if (Array.isArray(v.items) && v.items.length > 0) {
            itemsHtml = v.items.map(item => {
                const name   = item.item_name || item.name || item.itemName || 'Item';
                const qty    = item.qty !== undefined ? item.qty : (item.quantity || 1);
                const godown = item.godown || '—';
                return `<tr><td>${name}</td><td style="text-align:center;color:var(--blue-light);">${godown}</td><td class="qty-col">${qty}</td></tr>`;
            }).join('');
        } else {
            itemsHtml = '<tr><td colspan="3" style="color:var(--text-lo); text-align:center;">No inventory line items</td></tr>';
        }

        // Color tag based on voucher group
        let groupClass = 'accounting';
        if (GST_INVOICES.has(vtype)) groupClass = 'invoice';
        if (INVENTORY_VOUCHERS.has(vtype)) groupClass = 'inventory';

        return `
            <div class="invoice-item-card" data-id="${v.id}">
                <div class="invoice-item-header">
                    <span class="invoice-party-name">${v.party || 'N/A'}</span>
                    <button type="button" class="btn-revert" data-id="${v.id}" data-type="${vtype}">Revert</button>
                </div>
                <div class="invoice-item-meta">
                    <span class="type-badge ${groupClass}" style="padding: 2px 8px; font-size: 9px;">${vtype}</span>
                    <span class="invoice-total-amt">${formattedAmt}</span>
                    <span class="invoice-date">${dateStr}</span>
                </div>
                <div class="invoice-details-collapse">
                    <div class="invoice-details-content">
                        <table class="invoice-details-table">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th style="text-align:center;">Godown</th>
                                    <th style="text-align:right;">Qty</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ── REVERT / DELETE ACTION ────────────────────────────────────────────────────
let pendingRevertVoucherId = null;

invoiceListContainer.addEventListener('click', async function (e) {
    const revertBtn = e.target.closest('.btn-revert');
    if (revertBtn) {
        e.stopPropagation();
        pendingRevertVoucherId = revertBtn.getAttribute('data-id');
        const confirmModal = document.getElementById('confirm-modal');
        if (confirmModal) confirmModal.classList.add('show');
        return;
    }

    const card = e.target.closest('.invoice-item-card');
    if (card) {
        const collapse = card.querySelector('.invoice-details-collapse');
        if (collapse) {
            const isOpen = collapse.classList.contains('open');
            if (isOpen) {
                collapse.style.maxHeight = '0px';
                collapse.classList.remove('open');
            } else {
                collapse.style.maxHeight = collapse.scrollHeight + 'px';
                collapse.classList.add('open');
            }
        }
    }
});

document.getElementById('confirm-cancel-btn').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.remove('show');
});

document.getElementById('confirm-yes-btn').addEventListener('click', async function() {
    if (!pendingRevertVoucherId) return;
    const voucherId = pendingRevertVoucherId;
    document.getElementById('confirm-modal').classList.remove('show');

    try {
        // 1. Fetch details for inventory restore if sales
        const voucherRes = await fetch(`${API_BASE}/vouchers/${voucherId}`);
        if (voucherRes.ok) {
            const voucherData = await voucherRes.json();
            if (voucherData.voucher_type === 'Sales' && Array.isArray(voucherData.items) && voucherData.items.length > 0) {
                const syncItems = voucherData.items.map(i => ({
                    item_name: i.item_name || i.name || i.itemName,
                    qty: i.qty || i.quantity || 0,
                    godown: i.godown || null
                }));
                await fetch(`${API_BASE}/sync-invoice-stock`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: syncItems, revert: true })
                });
            }
        }

        // 2. Delete Voucher
        const delRes = await fetch(`${API_BASE}/vouchers/${voucherId}`, { method: 'DELETE' });
        if (delRes.ok) {
            if (typeof showToast === 'function') showToast('Voucher deleted and reversed!', 'success');
            await fetchAllVouchers();
            await fetchInventory();
        }
    } catch (err) {
        console.error(err);
    }
});

['filter-start-date', 'filter-end-date', 'filter-voucher-type'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', renderInvoiceList);
});
