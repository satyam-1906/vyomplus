import os
from datetime import datetime
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from sqlalchemy.orm import Session
from database import stock, godown, BankStatements, BRS, Vouchers, PendingVouchers

_REPORTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Reports")
os.makedirs(_REPORTS_DIR, exist_ok=True)

DARK = colors.HexColor("#0f172a")
BLUE = colors.HexColor("#2563EB")
MID = colors.HexColor("#64748b")
LIGHT = colors.HexColor("#f8fafc")
BORDER = colors.HexColor("#e2e8f0")

def _header_band(c, w, h, margin, title, period, timestamp_str):
    band_h = 52
    c.setFillColor(DARK)
    c.rect(0, h - band_h, w, band_h, fill=1, stroke=0)
    c.setFillColor(LIGHT)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(margin, h - 30, title)
    c.setFont("Helvetica", 9)
    c.setFillColor(colors.HexColor("#93c5fd"))
    c.drawString(margin, h - 45, f"Period: {period}  |  Generated: {timestamp_str}")

def _horiz_rule(c, x1, x2, y, color=BORDER):
    c.setStrokeColor(color)
    c.setLineWidth(0.5)
    c.line(x1, y, x2, y)
    c.setStrokeColor(DARK)

def generate_inventory_report(db: Session, user_id: int, period: str) -> tuple[str, str]:
    """Generates Inventory report PDF and returns (file_path, text_digest)."""
    now_str = datetime.utcnow().strftime("%d-%b-%Y %H:%M UTC")
    filename = f"Inventory_Report_{period}_{int(datetime.utcnow().timestamp())}.pdf"
    file_path = os.path.normpath(os.path.join(_REPORTS_DIR, filename))

    stock_items = db.query(stock).all()
    godowns = db.query(godown).all()

    total_items = len(stock_items)
    total_qty = sum(item.quantity for item in stock_items)
    total_val = sum((item.quantity or 0) * (item.rate or 0) for item in stock_items)

    c = canvas.Canvas(file_path, pagesize=A4)
    w, h = A4
    margin = 36

    _header_band(c, w, h, margin, "VYOMPLUS — INVENTORY REPORT", period, now_str)

    y = h - 70
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(DARK)
    c.drawString(margin, y, "Stock Summary")
    y -= 16
    c.setFont("Helvetica", 9)
    c.drawString(margin, y, f"Total Items: {total_items}   |   Total Quantity: {total_qty:,.2f}   |   Total Value: ₹{total_val:,.2f}")
    y -= 20

    _horiz_rule(c, margin, w - margin, y)
    y -= 16

    # Table Headers
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(MID)
    c.drawString(margin, y, "Item Name")
    c.drawString(margin + 160, y, "Qty & Unit")
    c.drawString(margin + 260, y, "Rate (₹)")
    c.drawString(margin + 340, y, "GST Rate")
    c.drawRightString(w - margin, y, "Total Value (₹)")
    y -= 8
    _horiz_rule(c, margin, w - margin, y)
    y -= 16

    c.setFont("Helvetica", 9)
    c.setFillColor(DARK)

    for item in stock_items:
        if y < 60:
            c.showPage()
            _header_band(c, w, h, margin, "VYOMPLUS — INVENTORY REPORT", period, now_str)
            y = h - 70

        val = (item.quantity or 0) * (item.rate or 0)
        c.drawString(margin, y, str(item.item)[:24])
        c.drawString(margin + 160, y, f"{item.quantity} {item.unit}")
        c.drawString(margin + 260, y, f"₹{item.rate:,.2f}")
        c.drawString(margin + 340, y, f"{item.gst_rate}%")
        c.drawRightString(w - margin, y, f"₹{val:,.2f}")
        y -= 16

    _horiz_rule(c, margin, w - margin, y)
    c.showPage()
    c.save()

    text_digest = (
        f"📦 *Inventory Report ({period})*\n"
        f"• Total Unique Items: {total_items}\n"
        f"• Total Stock Quantity: {total_qty:,.2f}\n"
        f"• Total Estimated Value: ₹{total_val:,.2f}\n"
        f"• Active Godowns: {len(godowns)}"
    )

    return file_path, text_digest

def generate_reconciliation_report(db: Session, user_id: int, period: str) -> tuple[str, str]:
    """Generates Reconciliation report PDF and returns (file_path, text_digest)."""
    now_str = datetime.utcnow().strftime("%d-%b-%Y %H:%M UTC")
    filename = f"Reconciliation_Report_{period}_{int(datetime.utcnow().timestamp())}.pdf"
    file_path = os.path.normpath(os.path.join(_REPORTS_DIR, filename))

    statements = db.query(BankStatements).all()
    brs_records = db.query(BRS).all()

    total_statements = len(statements)
    reconciled_count = sum(1 for s in statements if (s.reconciliation_status or '').lower() in ['reconciled', 'matched', 'completed'])
    pending_count = total_statements - reconciled_count
    total_credit = sum(s.amount for s in statements if (s.transaction_type or '').lower() == 'credit')
    total_debit = sum(s.amount for s in statements if (s.transaction_type or '').lower() == 'debit')

    c = canvas.Canvas(file_path, pagesize=A4)
    w, h = A4
    margin = 36

    _header_band(c, w, h, margin, "VYOMPLUS — BANK RECONCILIATION REPORT", period, now_str)

    y = h - 70
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(DARK)
    c.drawString(margin, y, "Reconciliation Overview")
    y -= 16
    c.setFont("Helvetica", 9)
    c.drawString(margin, y, f"Total Transactions: {total_statements}   |   Reconciled: {reconciled_count}   |   Pending: {pending_count}")
    y -= 14
    c.drawString(margin, y, f"Total Credit: ₹{total_credit:,.2f}   |   Total Debit: ₹{total_debit:,.2f}")
    y -= 20

    _horiz_rule(c, margin, w - margin, y)
    y -= 16

    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(MID)
    c.drawString(margin, y, "Date")
    c.drawString(margin + 65, y, "Bank / Account")
    c.drawString(margin + 195, y, "Type")
    c.drawString(margin + 245, y, "Status")
    c.drawRightString(w - margin, y, "Amount (₹)")
    y -= 8
    _horiz_rule(c, margin, w - margin, y)
    y -= 16

    c.setFont("Helvetica", 9)
    c.setFillColor(DARK)

    for stmt in statements:
        if y < 60:
            c.showPage()
            _header_band(c, w, h, margin, "VYOMPLUS — BANK RECONCILIATION REPORT", period, now_str)
            y = h - 70

        c.drawString(margin, y, str(stmt.transaction_date)[:10])
        c.drawString(margin + 65, y, f"{stmt.bank_name[:12]} ({stmt.account_number[-4:] if stmt.account_number else ''})")
        c.drawString(margin + 195, y, str(stmt.transaction_type))
        c.drawString(margin + 245, y, str(stmt.reconciliation_status))
        c.drawRightString(w - margin, y, f"₹{stmt.amount:,.2f}")
        y -= 16

    _horiz_rule(c, margin, w - margin, y)
    c.showPage()
    c.save()

    text_digest = (
        f"⚖️ *Reconciliation Report ({period})*\n"
        f"• Total Bank Transactions: {total_statements}\n"
        f"• Reconciled: {reconciled_count} ✅\n"
        f"• Pending BRS: {pending_count} ⏳\n"
        f"• Total Credit Amount: ₹{total_credit:,.2f}\n"
        f"• Total Debit Amount: ₹{total_debit:,.2f}"
    )

    return file_path, text_digest

def generate_summary_report(db: Session, user_id: int, period: str) -> tuple[str, str]:
    """Generates Summary report PDF and returns (file_path, text_digest)."""
    now_str = datetime.utcnow().strftime("%d-%b-%Y %H:%M UTC")
    filename = f"Summary_Report_{period}_{int(datetime.utcnow().timestamp())}.pdf"
    file_path = os.path.normpath(os.path.join(_REPORTS_DIR, filename))

    vouchers = db.query(Vouchers).all()
    pending_vch = db.query(PendingVouchers).filter(PendingVouchers.status == 'pending').count()
    statements = db.query(BankStatements).all()
    stock_items = db.query(stock).all()

    total_vouchers = len(vouchers)
    total_sales = sum(v.amount for v in vouchers if (v.voucher_type or '').lower() == 'sales')
    total_purchase = sum(v.amount for v in vouchers if (v.voucher_type or '').lower() == 'purchase')
    total_gst = sum(v.gst_amount or 0 for v in vouchers)

    total_stock_items = len(stock_items)
    total_stock_value = sum((item.quantity or 0) * (item.rate or 0) for item in stock_items)

    c = canvas.Canvas(file_path, pagesize=A4)
    w, h = A4
    margin = 36

    _header_band(c, w, h, margin, "VYOMPLUS — BUSINESS FINANCIAL SUMMARY", period, now_str)

    y = h - 70
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(DARK)
    c.drawString(margin, y, "Key Business Metrics")
    y -= 20

    metrics = [
        ("Total Invoices / Vouchers Processed", str(total_vouchers)),
        ("Total Pending Vouchers for Review", str(pending_vch)),
        ("Total Sales Volume", f"₹{total_sales:,.2f}"),
        ("Total Purchase Volume", f"₹{total_purchase:,.2f}"),
        ("Total GST Liability / Collected", f"₹{total_gst:,.2f}"),
        ("Total Bank Statements Logged", str(len(statements))),
        ("Total Inventory Line Items", str(total_stock_items)),
        ("Total Inventory Valuation", f"₹{total_stock_value:,.2f}"),
    ]

    for label, val in metrics:
        c.setFont("Helvetica", 10)
        c.setFillColor(MID)
        c.drawString(margin, y, label)
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(DARK)
        c.drawRightString(w - margin, y, val)
        y -= 14
        _horiz_rule(c, margin, w - margin, y)
        y -= 10

    c.showPage()
    c.save()

    text_digest = (
        f"📈 *VyomPlus Business Summary ({period})*\n"
        f"----------------------------------------\n"
        f"• Total Sales Volume: ₹{total_sales:,.2f}\n"
        f"• Total Purchase Volume: ₹{total_purchase:,.2f}\n"
        f"• GST Liability/Collected: ₹{total_gst:,.2f}\n"
        f"• Approved Vouchers: {total_vouchers}\n"
        f"• Pending Vouchers Review: {pending_vch}\n"
        f"• Bank Transactions Recorded: {len(statements)}\n"
        f"• Total Inventory Value: ₹{total_stock_value:,.2f}\n"
        f"----------------------------------------"
    )

    return file_path, text_digest
