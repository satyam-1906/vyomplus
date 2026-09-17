from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, Float, null, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base, sessionmaker, Mapped, mapped_column
from typing import List, Any, Dict, Optional
import os
from datetime import datetime
from dotenv import load_dotenv
from sympy import false
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL is None:
    raise RuntimeError("DATABASE_URL environment variable is required")
engine = create_engine(DATABASE_URL)
sessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Users(Base):
    __tablename__ = "test"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    unique_id: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)
    email: Mapped[str] = mapped_column(String, unique=True)
    username: Mapped[str] = mapped_column(String, unique=True)
    password: Mapped[str] = mapped_column(String)
    isactive: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Account & Security Additions
    full_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    mobile: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    mobile_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    two_fa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    two_fa_method: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    recovery_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    recovery_phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    transaction_pin: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_login_ip: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    last_login_device: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    account_status: Mapped[str] = mapped_column(String, default="pending_onboarding")
    consent_tos: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_privacy: Mapped[bool] = mapped_column(Boolean, default=False)
    marketing_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    communication_preferences: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=lambda: {"email": True, "sms": False, "whatsapp": False})

class BusinessProfile(Base):
    __tablename__ = "business_profiles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    unique_id: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)
    user_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    
    # Business Profile Fields
    entity_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    legal_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    trade_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    display_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    date_incorporation: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    date_commenced: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    business_constitution: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    nature_business: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    business_description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    industry_sector: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    employee_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    annual_turnover: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    expected_turnover: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    financial_year: Mapped[str] = mapped_column(String, default="April-March")
    accounting_start: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    currency: Mapped[str] = mapped_column(String, default="INR")
    timezone: Mapped[str] = mapped_column(String, default="IST")
    books_from_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    previous_software: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    
    # PAN / Income-Tax Info Fields
    pan: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pan_holder_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pan_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pan_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    pan_doc_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tan: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tan_holder_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tan_doc_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tax_jurisdiction: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    assessing_officer: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    itr_filing_status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tax_audit_applicable: Mapped[bool] = mapped_column(Boolean, default=False)
    tax_regime: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tds_applicable: Mapped[bool] = mapped_column(Boolean, default=False)
    tcs_applicable: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # GST Profile Fields
    gstin: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    gst_status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    gst_reg_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    gst_effective_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class SessionTokens(Base):
    __tablename__ = "sessiontokens"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    unique_id: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)
    username: Mapped[str] = mapped_column(String)
    token_hash: Mapped[str] = mapped_column(String)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)

class Vouchers(Base):
    __tablename__ = "vouchers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    unique_id: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)
    voucher_type: Mapped[str] = mapped_column(String)
    date: Mapped[str] = mapped_column(String)
    voucher_no: Mapped[str] = mapped_column(String, unique=True, index=True)
    party: Mapped[str] = mapped_column(String)
    items: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    amount: Mapped[float] = mapped_column(Float)
    gst_amount: Mapped[float] = mapped_column(Float)
    discount: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String, default="pending")
    file_key: Mapped[str] = mapped_column(String, nullable=True)
    # NEW — voucher type tag + arbitrary type-specific data store
    meta_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    meta: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)

class PendingVouchers(Base):
    __tablename__ = "pending_vouchers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    unique_id: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)
    voucher_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    voucher_no: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)
    party: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    items: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    gst_amount: Mapped[float] = mapped_column(Float, default=0.0)
    discount: Mapped[float] = mapped_column(Float, default=0.0)
    file_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending")

class History(Base):
    __tablename__ = "histories"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    unique_id = Column(String, index=True, nullable=True)
    username = Column(String)
    input_file = Column(String, unique=True)
    output_file = Column(String, unique=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

class BankStatements(Base):
    __tablename__ = "bankStatements"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    unique_id: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)
    bank_name: Mapped[str] = mapped_column(String)
    account_number: Mapped[str] = mapped_column(String)
    referrence_no: Mapped[str] = mapped_column(String)
    transaction_date: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String)
    transaction_type: Mapped[str] = mapped_column(String)
    amount: Mapped[float] = mapped_column(Float)
    category: Mapped[str] = mapped_column(String)
    reconciliation_status: Mapped[str] = mapped_column(String, default='Pending')
    party_name: Mapped[str] = mapped_column(String, default=None)
    voucher_ref: Mapped[str] = mapped_column(String, unique=True, default=None)

class BRS(Base):
    __tablename__ = "BRS"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    unique_id: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)
    transaction_id: Mapped[int] = mapped_column(String)
    voucher_no: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String)
    amount: Mapped[float] = mapped_column(Float)
    gst_amount: Mapped[float] = mapped_column(Float)
    statement_amount: Mapped[float] = mapped_column(Float)
    
class godown(Base):
    __tablename__ = "godown"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    unique_id: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)
    godown_name: Mapped[str] = mapped_column(String)
    location: Mapped[str] = mapped_column(String)
    items: Mapped[List[Dict[str,Any]]] = mapped_column(JSONB, nullable=false, default=list)

class units(Base):
    __tablename__ = "units"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    unique_id: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)
    symbol: Mapped[str] = mapped_column(String, unique=True)
    name: Mapped[str] = mapped_column(String)
    conversion: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=false, default=dict)
    decimals: Mapped[int] = mapped_column(Integer)
    type: Mapped[str] = mapped_column(String)
    used: Mapped[int] = mapped_column(Integer)

class stock(Base):
    __tablename__ = "stock"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    unique_id: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)
    item: Mapped[str] = mapped_column(String)
    quantity: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String)
    rate: Mapped[float] = mapped_column(Float)
    godowns: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=false, default=dict)
    gst_rate: Mapped[float] = mapped_column(Float)
    hsn_code: Mapped[int] = mapped_column(Integer)

class notificationLogs(Base):
    __tablename__ = "notification_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    unique_id: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)
    detail: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class WhatsAppAccount(Base):
    __tablename__ = "whatsapp_accounts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    unique_id: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)
    wa_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    mobile: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending_link")
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

Base.metadata.create_all(bind=engine)

