from pydantic import BaseModel, Field
from typing import Any, Optional, List, Dict

class InputSchema(BaseModel):
    file_name: str
    content_type: Optional[str] = Field(description="pdf")

class ExtractSchema(BaseModel):
    file_type:List[Optional[str]] = Field(description="pdf")
    file_keys:List[str]

class CreateSchema(BaseModel):
    email: str
    full_name: str
    mobile: str
    password: str

class EmailSchema(BaseModel):
    otp: str
    email: str

class LoginSchema(BaseModel):
    email: str
    password: str

class BusinessProfileSchema(BaseModel):
    entity_type: Optional[str] = None
    legal_name: Optional[str] = None
    trade_name: Optional[str] = None
    display_name: Optional[str] = None
    date_incorporation: Optional[str] = None
    date_commenced: Optional[str] = None
    business_constitution: Optional[str] = None
    nature_business: Optional[str] = None
    business_description: Optional[str] = None
    industry_sector: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    employee_count: Optional[int] = None
    annual_turnover: Optional[str] = None
    expected_turnover: Optional[str] = None
    financial_year: Optional[str] = "April-March"
    accounting_start: Optional[str] = None
    currency: Optional[str] = "INR"
    timezone: Optional[str] = "IST"
    books_from_date: Optional[str] = None
    previous_software: Optional[str] = None
    
    # PAN Info
    pan: Optional[str] = None
    pan_holder_name: Optional[str] = None
    pan_type: Optional[str] = None
    pan_verified: Optional[bool] = False
    pan_doc_url: Optional[str] = None
    tan: Optional[str] = None
    tan_holder_name: Optional[str] = None
    tan_doc_url: Optional[str] = None
    tax_jurisdiction: Optional[str] = None
    assessing_officer: Optional[str] = None
    itr_filing_status: Optional[str] = None
    tax_audit_applicable: Optional[bool] = False
    tax_regime: Optional[str] = None
    tds_applicable: Optional[bool] = False
    tcs_applicable: Optional[bool] = False
    
    # GST Info
    gstin: Optional[str] = None
    gst_status: Optional[str] = None
    gst_reg_date: Optional[str] = None
    gst_effective_date: Optional[str] = None


class ItemSchema(BaseModel):
    item_name: str = Field(description='Name of the item bought or sold.')
    qty: int = Field(description='Qyantity of the item.')
    rate: float = Field(description='Price per unit.')

class InvoiceExtractionSchema(BaseModel):
    invoice_number: str = Field(default="NA")
    invoice_date: str = Field(default="NA")
    invoice_type: str = Field(default="NA")
    supplier_gstin: str = Field(default="NA")
    buyer_gstin: str = Field(default="NA")
    supplier_name: str = Field(default="NA")
    place_of_supply: str = Field(default="NA")
    hsn_sac_code: str = Field(default="NA")
    item_description: str = Field(default="NA")
    quantity: str = Field(default="NA")
    unit_price: str = Field(default="NA")
    taxable_value: str = Field(default="NA")
    gst_rate: str = Field(default="NA")
    cgst_amount: str = Field(default="NA")
    sgst_amount: str = Field(default="NA")
    igst_amount: str = Field(default="NA")
    cess_amount: str = Field(default="NA")
    total_invoice_value: str = Field(default="NA")
    reverse_charge: str = Field(default="NA")

class VoucherExtractionSchema(BaseModel):
    voucher_type: str = Field(description='The type of voucher being created Sales/Purchase/Payment/Receipt/Journal.')
    date: str = Field(description='The date the mentioned in the invoice.')
    voucher_no: str = Field(description='Create a new voucher number according to the format \"VCH-yyyymmdd-hhnnss\" where \"y\" is for year, \"m\" is for month and \"d\" is for day, \"hhnnss\" is the time stamp in 24hr format.')
    party: str = Field(description='The name of the party (person or entity) recieving the payment.')
    items: List[ItemSchema]
    amount: float = Field(description='The net amount shown on the bill exclusive of GST.')
    gst_amount: float = Field(description='The net GST amount shown on the bill inclusive of all types of GST.')
    discount: float = Field(description='Discount percentage if any mentioned in the invoice else 0.')
    status: str = Field(description='Status of the bill will always be \"Pending\" by default.')
    meta_type: Optional[str] = Field(None, description='Type tag for type-specific fields if any, e.g. "Sales", "Purchase", etc.')
    meta: Optional[Dict[str, Any]] = Field(None, description='Arbitrary type-specific fields stored as a dictionary.')

class VoucherReportList(BaseModel):
    reports: List[VoucherExtractionSchema]

class VoucherSchema(BaseModel):
    voucher_type: str
    date: str
    voucher_no: str
    party: str
    items: List[Dict[str, Any]]
    amount: float
    gst_amount: float
    discount: float
    status: str
    # NEW: type tag + arbitrary type-specific fields stored as JSONB
    meta_type: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None

class BankStatementSchema(BaseModel):
    bank_name: str = Field(description='Name of the bank mentioned in the transaction.')
    account_number: str = Field(description='Account number from/to which the transaction was made in the format \"xxxxxxxx####\" and replace only the # with the last 4 digits of the account number.')
    referrence_no: str = Field(description='The transaction id/ UPI transaction id/ cheque number/ transaction id/ referrence number etc mentioned in the transaction.')
    transaction_date: str = Field(description='The date of transaction mentioned in the transaction.')
    description: str = Field(description='A small note about any of the details of the transaction.')
    transaction_type: str = Field(description='The type of transaction, wether Credit or Debit.')
    amount: float = Field(description='The amount of money in the transaction.')

class BankStatementReportList(BaseModel):
    reports: List[BankStatementSchema]

class BankStatementInputSchema(BaseModel):
    bank_name: str
    account_number: str
    referrence_no: str
    transaction_date: str
    description: str
    transaction_type: str
    amount: float
    category: Optional[str] = 'Miscellaneous'
    reconciliation_status: Optional[str] = 'pending'
    party_name: Optional[str] = None
    voucher_ref: Optional[str] = None

class BRSInputSchema(BaseModel):
    transaction_id: int
    voucher_no: str
    description: str
    amount: float
    gst_amount: float

class GodownSchema(BaseModel):
    godown_name: str
    location: str
    items: Optional[List[Dict[str, Any]]] = None

class UnitSchema(BaseModel):
    symbol: str
    name: str
    conversion: Dict[str, Any]
    decimals: int
    type: str
    used: int

class StockSchema(BaseModel):
    item: str
    quantity: float
    unit: str
    rate: float
    godowns: Dict[str, Any]
    gst_rate: float
    hsn_code: int

class NotificationLogSchema(BaseModel):
    detail: str

class IssuedToSchema(BaseModel):
    name: str
    address: List[str]
    phone: str
    email: str

class InvoiceItemSchema(BaseModel):
    desc: str
    qty: int
    price: float

class PaymentDetailsSchema(BaseModel):
    bank: str
    account_no: str
    account_name: str

class InvoiceGenerationSchema(BaseModel):
    # NEW: voucher type for routing to the correct PDF generator
    voucher_type: Optional[str] = "Sales"
    # NEW: all type-specific extra fields (GST, TDS, IRN, ledger entries, etc.)
    meta: Optional[Dict[str, Any]] = None

    # Existing Sales invoice fields — all made Optional so non-Sales types don't fail validation
    invoice_no: Optional[str] = None
    company_name: Optional[str] = None
    issued_to: Optional[IssuedToSchema] = None
    issued_date: Optional[str] = None
    due_date: Optional[str] = None
    items: Optional[List[InvoiceItemSchema]] = None
    tax_rate: Optional[float] = 0.18
    payment_details: Optional[PaymentDetailsSchema] = None

class InvoiceSyncItemSchema(BaseModel):
    item_name: str
    qty: float
    godown: Optional[str] = None

class InvoiceSyncSchema(BaseModel):
    items: List[InvoiceSyncItemSchema]
    revert: bool = False

class PendingVoucherInputSchema(BaseModel):
    voucher_type: Optional[str] = None
    date: Optional[str] = None
    voucher_no: Optional[str] = None
    party: Optional[str] = None
    items: Optional[List[Dict[str, Any]]] = None
    amount: Optional[float] = 0.0
    gst_amount: Optional[float] = 0.0
    discount: Optional[float] = 0.0
    file_key: Optional[str] = None

class WhatsAppResetSessionSchema(BaseModel):
    wa_id: str

class WhatsAppIngestInvoiceSchema(BaseModel):
    user_id: Optional[int] = None
    business_id: Optional[int] = None
    file_key: Optional[str] = None
    file_name: Optional[str] = None
    source: str = "whatsapp"

class ReportGenerateSchema(BaseModel):
    user_id: Optional[int] = None
    business_id: Optional[int] = None
    report_type: str  # Inventory, Reconciliation, Summary
    period: str       # Daily, Monthly, Quarterly, Half-Yearly, Yearly

class WhatsAppLinkSchema(BaseModel):
    wa_id: str
    user_id: int
    mobile: Optional[str] = None


