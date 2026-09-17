import stat
from utils import keepalive
from fastapi import FastAPI, HTTPException, Depends, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session
import os, boto3, hashlib, json
from datetime import datetime, timedelta
import copy
import threading
import time
import urllib.request
from sympy import det
from utils.otp_gen import otp_generator
from utils.send_email import email_send
from dotenv import load_dotenv
from schema import InputSchema, ExtractSchema, CreateSchema, EmailSchema, LoginSchema
from database import Users, BusinessProfile, sessionLocal, SessionTokens
from botocore.config import Config
import jwt
import mimetypes
load_dotenv()
from utils.agent import lang_app, State
from utils.extractor import extract, extract_ocr, extract_csv, hash_text
import uuid
from redis import Redis
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from typing import Any, List
from utils.direct_ocr_extractor import ocr_extraction
from botocore.exceptions import ClientError
from schema import (
    VoucherSchema, BankStatementInputSchema, BRSInputSchema, GodownSchema, UnitSchema, StockSchema,
    NotificationLogSchema, InvoiceGenerationSchema, InvoiceSyncSchema, InvoiceSyncItemSchema,
    PendingVoucherInputSchema, WhatsAppResetSessionSchema, WhatsAppIngestInvoiceSchema,
    ReportGenerateSchema, WhatsAppLinkSchema, BusinessProfileSchema
)
from database import (
    Vouchers, BankStatements, BRS, godown, units, stock, notificationLogs, PendingVouchers, WhatsAppAccount
)
from utils.invoice_gen import generate_invoice, generate_voucher_pdf, clear
from utils.whatsapp import (
    process_whatsapp_event, clear_session, WHATSAPP_VERIFY_TOKEN, send_whatsapp_text, get_session
)
from utils.report_gen import (
    generate_inventory_report, generate_reconciliation_report, generate_summary_report
)



ph = PasswordHasher()
s3= boto3.client('s3', region_name=os.getenv("S3_REGION"), aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"), aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"), config=Config(signature_version="s3v4", s3={'addressing_style': 'virtual'}))
app=FastAPI()
redis_client=Redis(
    host=os.getenv("REDIS_HOST", 'comparison-hyperspeedy-canvas-69712.db.redis.io'),
    port=int(os.getenv("REDIS_PORT", 13818)),
    password=os.getenv("REDIS_PASSWORD"),
    decode_responses=True,
    socket_timeout=3.0,
    socket_connect_timeout=3.0
)
binary_redis_client=Redis(
    host=os.getenv("REDIS_HOST", 'comparison-hyperspeedy-canvas-69712.db.redis.io'),
    port=int(os.getenv("REDIS_PORT", 6379)),
    password=os.getenv("REDIS_PASSWORD"),
    socket_timeout=3.0,
    socket_connect_timeout=3.0
)

bucket=os.getenv("S3_BUCKET_NAME")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db=sessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/")
def chek():
    return {"status": "Running"}

def get_current_unique_id(request: Request, response: Response = None, db: Session = Depends(get_db)) -> str:
    """Dependency to retrieve or establish the current user's unique_id from query params, cookies, headers, or token."""
    # 1. Check query parameter
    query_uid = request.query_params.get("unique_id")
    if query_uid:
        return query_uid

    # 2. Check cookie
    cookie_uid = request.cookies.get("unique_id")
    if cookie_uid:
        return cookie_uid

    # 3. Check X-Unique-ID header
    hdr_uid = request.headers.get("X-Unique-ID")
    if hdr_uid:
        return hdr_uid

    # 4. Check JWT token
    token = request.cookies.get("session_token")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
    if token:
        try:
            secret = os.getenv("SECRET")
            payload = jwt.decode(token, secret or '', algorithms=["HS256"])
            pay_uid = payload.get("unique_id")
            if pay_uid:
                return pay_uid
            username = payload.get("sub")
            user = db.query(Users).filter(Users.username == username).first()
            if user:
                if not user.unique_id:
                    user.unique_id = str(uuid.uuid4())
                    db.commit()
                if response:
                    response.set_cookie(key="unique_id", value=user.unique_id, max_age=604800)
                return user.unique_id
        except Exception:
            pass

    # 5. Check if there's a primary registered user in DB as default fallback
    primary_user = db.query(Users).filter(Users.unique_id.isnot(None)).first()
    if primary_user and primary_user.unique_id:
        return primary_user.unique_id

    guest_uid = f"guest-{uuid.uuid4().hex[:12]}"
    if response:
        response.set_cookie(key="unique_id", value=guest_uid, max_age=604800)
    return guest_uid

@app.post("/create")
def crea(payload: CreateSchema, db: Session=Depends(get_db)):
    email, full_name, mobile = payload.email, payload.full_name, payload.mobile
    username = email.split("@")[0]
    # Check if user already exists
    existing = db.query(Users).filter((Users.email == email) | (Users.username == username)).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    password = ph.hash(payload.password)
    user_uid = str(uuid.uuid4())
    db_note = Users(
        email=email,
        username=username,
        password=password,
        full_name=full_name,
        mobile=mobile,
        unique_id=user_uid,
        isactive=False,
        onboarding_complete=False,
        account_status="pending_onboarding"
    )
    db.add(db_note)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"error: {str(e)}")
    db.refresh(db_note)
    otp = otp_generator()
    hashed = hashlib.sha256(otp.encode()).hexdigest()
    redis_client.setex(f"otp:{email}", 600, hashed)
    email_send(email, otp)
    return {"message": "OTP sent to your email", "unique_id": user_uid}

@app.post("/verify")
def veri(payload: EmailSchema, db:Session=Depends(get_db)):
    ot, email = payload.otp, payload.email
    key = f"otp:{email}"
    stored = redis_client.get(key)
    if not stored:
        raise HTTPException(status_code=404, detail="invalid otp or expired otp")
    input_hash = hashlib.sha256(ot.encode()).hexdigest()
    if input_hash != stored:
        raise HTTPException(status_code=401, detail="otp does not match")
    user = db.query(Users).filter(Users.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="user not found")
    user.isactive = True
    user.account_status = "active"
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="database error")
    db.refresh(user)
    redis_client.delete(key)
    return {"message": "email verified. Proceed to login"}

@app.post("/login")
def logi(payload: LoginSchema, response: Response, db:Session=Depends(get_db)):
    email, password = payload.email, payload.password
    user = db.query(Users).filter(Users.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="user not found")
    if user.isactive:
        passw = user.password
        try:
            ph.verify(passw, password)
            secret = os.getenv("SECRET")
            if not secret:
                raise HTTPException(status_code=500, detail="JWT secret not configured")
            
            # Ensure unique_id exists
            if not user.unique_id:
                user.unique_id = str(uuid.uuid4())

            user.last_login = datetime.utcnow()
            try:
                db.commit()
            except Exception:
                db.rollback()

            pay = {
                "iss": "auth-service",
                "sub": user.username,
                "email": user.email,
                "unique_id": user.unique_id,
                "exp": datetime.utcnow() + timedelta(days=7)
            }
            token = jwt.encode(pay, secret, algorithm="HS256")
            response.set_cookie(key="session_token", value=token, max_age=604800)
            response.set_cookie(key="unique_id", value=user.unique_id, max_age=604800)
            db_no = SessionTokens(
                username=user.username,
                unique_id=user.unique_id,
                token_hash=hashlib.sha256(token.encode()).hexdigest(),
                expires_at=datetime.utcnow()+timedelta(days=7),
                revoked=False
            )
            db.add(db_no)
            try:
                db.commit()
            except Exception as e:
                db.rollback()
                raise HTTPException(status_code=500, detail="database error")
            db.refresh(db_no)
            return {
                "message": "login success",
                "token": token,
                "unique_id": user.unique_id,
                "username": user.username,
                "email": user.email,
                "full_name": user.full_name,
                "onboarding_complete": user.onboarding_complete
            }
        except VerifyMismatchError:
            raise HTTPException(status_code=401, detail="passwords do not match")
    else:
        raise HTTPException(status_code=401, detail="verify your email")

def get_current_user_from_token(request: Request, response: Response = None, db: Session = Depends(get_db)):
    token = request.cookies.get("session_token")
    if not token:
        # Check authorization header too
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        secret = os.getenv("SECRET")
        payload = jwt.decode(token, secret or '', algorithms=["HS256"])
        username = payload.get("sub")
        user = db.query(Users).filter(Users.username == username).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if not user.unique_id:
            user.unique_id = str(uuid.uuid4())
            db.commit()
        if response:
            response.set_cookie(key="unique_id", value=user.unique_id, max_age=604800)
        return user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.get("/onboarding/status")
def get_onboarding_status(user: Users = Depends(get_current_user_from_token)):
    return {
        "onboarding_complete": user.onboarding_complete,
        "full_name": user.full_name,
        "email": user.email,
        "mobile": user.mobile
    }

@app.post("/onboarding/complete")
def complete_onboarding(payload: BusinessProfileSchema, db: Session = Depends(get_db), user: Users = Depends(get_current_user_from_token)):
    # Save/update business profile
    profile = db.query(BusinessProfile).filter(BusinessProfile.user_id == user.id).first()
    if not profile:
        profile = BusinessProfile(user_id=user.id, unique_id=user.unique_id)
        db.add(profile)
    else:
        profile.unique_id = user.unique_id
    
    # Map profile fields
    data = payload.dict(exclude_unset=True)
    user_fields = {"two_fa_enabled", "two_fa_method", "transaction_pin", "recovery_email"}
    
    for field, val in data.items():
        if field in user_fields:
            if hasattr(user, field):
                setattr(user, field, val)
        elif hasattr(profile, field):
            setattr(profile, field, val)
        
    user.onboarding_complete = True
    user.account_status = "active"
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    return {"message": "Onboarding completed successfully"}


@app.get("/profile/details")
def get_profile_details(db: Session = Depends(get_db), user: Users = Depends(get_current_user_from_token)):
    profile = db.query(BusinessProfile).filter(BusinessProfile.user_id == user.id).first()
    profile_data = {}
    if profile:
        profile_data = {c.name: getattr(profile, c.name) for c in profile.__table__.columns}
    
    return {
        "user": {
            "email": user.email,
            "username": user.username,
            "full_name": user.full_name,
            "mobile": user.mobile,
            "two_fa_enabled": user.two_fa_enabled,
            "onboarding_complete": user.onboarding_complete
        },
        "business": profile_data
    }


@app.post("/upload")
def upl(payload: InputSchema):
    file_id=str(uuid.uuid4())
    key=f"docs/{file_id}-{payload.file_name}"
    pres=s3.generate_presigned_url(
        ClientMethod = 'put_object',
        Params = {
            'Bucket': bucket,
            "Key" : key,
            "ContentType": payload.content_type
        },
        ExpiresIn = 600
    )
    status="uploaded"
    return {"upload_url": pres, "file_key": key, "status": status}

@app.post("/extract")
def extr(payload: ExtractSchema):
    from utils.direct_ocr_extractor import append_extracted_data, invoice_json_records, ocr_extraction

    last_csv = ""
    for idx, file_key in enumerate(payload.file_keys):
        file_ext = "pdf"
        if idx < len(payload.file_type) and payload.file_type[idx]:
            file_ext = (payload.file_type[idx] or '').lower().strip(".")
        else:
            file_ext = file_key.split(".")[-1].lower()

        response = s3.get_object(
            Bucket=bucket,
            Key=file_key
        )
        file_bytes = response["Body"].read()

        content_type = "application/pdf"
        if file_ext in {"jpg", "jpeg"}:
            content_type = "image/jpeg"
        elif file_ext == "png":
            content_type = "image/png"
        elif file_ext == "pdf":
            content_type = "application/pdf"

        result = ocr_extraction(file_bytes, content_type, 'invoice')
        normal = result.get('normal') if isinstance(result, dict) else None
        if normal is None:
            continue

        if isinstance(normal, list):
            for page_data in normal:
                if not isinstance(page_data, dict):
                    continue
                presigned_url, _key = append_extracted_data(page_data)
                last_csv = presigned_url
        elif isinstance(normal, dict):
            presigned_url, _key = append_extracted_data(normal)
            last_csv = presigned_url

    return {"csv_file": last_csv, "normal": list(invoice_json_records)}



@app.post("/clear-extractions")
def clear_ext():
    from utils.direct_ocr_extractor import clear_extractions
    clear_extractions()
    return {"message": "Extractions cleared"}




ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"]
MIME_TO_EXT = {"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png"}


def _normalise_mime(raw: str) -> str:
    """Strip parameters, lowercase, and alias image/jpg -> image/jpeg."""
    mime = raw.split(";")[0].strip().lower() if raw else ""
    return "image/jpeg" if mime == "image/jpg" else mime


@app.post("/extract-OCR")
async def extractOCR(request: Request):
    content_type = _normalise_mime(request.headers.get("Content-Type", ""))
    schema = request.headers.get("Schema")

    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported Content-Type '{content_type}'. Must be one of: {ALLOWED_MIME_TYPES}"
        )
    if schema not in {"voucher", "bankStatement", "invoice"}:
        raise HTTPException(
            status_code=400,
            detail=f"Missing or invalid Schema header: '{schema}'. Must be voucher, bankStatement, or invoice."
        )

    file_bytes = await request.body()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Request body is empty — no file data received.")

    # Cache for the optional subsequent /upload-to-AWS call
    binary_redis_client.set('cached_file', file_bytes, ex=600)
    redis_client.set('cached_file_type', content_type, ex=600)

    try:
        return ocr_extraction(file_bytes, content_type, schema)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR extraction failed: {str(e)}")


@app.post("/upload-to-AWS")
async def upload_to_AWS(request: Request, current_uid: str = Depends(get_current_unique_id)):
    content_type = redis_client.get('cached_file_type') or ""
    schema = request.headers.get("Schema")

    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid cached file type: '{content_type}'")

    file_bytes = binary_redis_client.get('cached_file')
    if not file_bytes:
        raise HTTPException(status_code=400, detail="No cached file found. Call /extract-OCR first.")

    ext = MIME_TO_EXT[content_type]
    file_name = str(uuid.uuid4())
    s3_key = f"{'bank_statements' if schema == 'bankStatement' else 'vouchers'}/{file_name}{ext}"
    # Namespace by unique_id so concurrent uploads from different users don't collide
    redis_client.set(f"file_key:{current_uid}", s3_key, ex=600)

    try:
        response = s3.put_object(
            Bucket=bucket,
            Key=s3_key,
            Body=file_bytes,
            ContentType=content_type
        )
        status_code = response['ResponseMetadata']['HTTPStatusCode']
        if status_code == 200:
            print(f"Upload successful! ETag: {response['ETag']}")
        else:
            print(f"Upload failed with status code: {status_code}")
    except ClientError as e:
        print(f"AWS Error: {e.response['Error']['Message']}")
        raise HTTPException(status_code=502, detail=f"AWS upload failed: {e.response['Error']['Message']}")
    except Exception as e:
        print(f"Unexpected error during upload: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/add-voucher")
def add_voucher(payload: List[VoucherSchema], db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    # Use per-user namespaced key to avoid cross-user race conditions
    file_key = redis_client.get(f"file_key:{current_uid}")
    vouchers_added = []
    for item in payload:
        voucher = Vouchers(
            unique_id=current_uid,
            voucher_type=item.voucher_type,
            date=item.date,
            voucher_no=item.voucher_no,
            party=item.party,
            items=item.items,
            amount=item.amount,
            gst_amount=item.gst_amount,
            discount=item.discount,
            status=item.status,
            file_key=file_key,
            meta_type=item.meta_type,
            meta=item.meta,
        )
        db.add(voucher)
        vouchers_added.append(voucher)
    
    try:
        db.commit()
        redis_client.delete(f"file_key:{current_uid}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        
    for v in vouchers_added:
        db.refresh(v)
        
    return [
        {
            "id": v.id,
            "voucher_type": v.voucher_type,
            "date": v.date,
            "voucher_no": v.voucher_no,
            "party": v.party,
            "items": v.items,
            "amount": v.amount,
            "gst_amount": v.gst_amount,
            "discount": v.discount,
            "status": v.status,
            "meta_type": v.meta_type,
            "meta": v.meta,
        }
        for v in vouchers_added
    ]

@app.get("/vouchers")
def get_vouchers(db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    rows = db.query(Vouchers).filter(Vouchers.unique_id == current_uid).order_by(Vouchers.id.desc()).all()
    return [
        {
            "id": v.id,
            "voucher_type": v.voucher_type,
            "date": v.date,
            "voucher_no": v.voucher_no,
            "party": v.party,
            "items": v.items,
            "amount": v.amount,
            "gst_amount": v.gst_amount,
            "discount": v.discount,
            "status": v.status,
            "meta_type": v.meta_type,
            "meta": v.meta,
        }
        for v in rows
    ]

@app.put("/vouchers/{voucher_id}")
def update_voucher(voucher_id: int, payload: VoucherSchema, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    voucher = db.query(Vouchers).filter(Vouchers.id == voucher_id, Vouchers.unique_id == current_uid).first()
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    voucher.voucher_type = payload.voucher_type
    voucher.date = payload.date
    voucher.voucher_no = payload.voucher_no
    voucher.party = payload.party
    voucher.items = payload.items
    voucher.amount = payload.amount
    voucher.gst_amount = payload.gst_amount
    voucher.discount = payload.discount
    voucher.status = payload.status
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    db.refresh(voucher)
    return {
        "id": voucher.id,
        "voucher_type": voucher.voucher_type,
        "date": voucher.date,
        "voucher_no": voucher.voucher_no,
        "party": voucher.party,
        "items": voucher.items,
        "amount": voucher.amount,
        "gst_amount": voucher.gst_amount,
        "discount": voucher.discount,
        "status": voucher.status
    }

@app.get("/vouchers/{voucher_id}")
def get_single_voucher(voucher_id: int, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    voucher = db.query(Vouchers).filter(Vouchers.id == voucher_id, Vouchers.unique_id == current_uid).first()
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    return {
        "id": voucher.id,
        "voucher_type": voucher.voucher_type,
        "date": voucher.date,
        "voucher_no": voucher.voucher_no,
        "party": voucher.party,
        "items": voucher.items,
        "amount": voucher.amount,
        "gst_amount": voucher.gst_amount,
        "discount": voucher.discount,
        "status": voucher.status
    }

@app.delete("/vouchers/{voucher_id}")
def delete_voucher(voucher_id: int, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    voucher = db.query(Vouchers).filter(Vouchers.id == voucher_id, Vouchers.unique_id == current_uid).first()
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    try:
        db.delete(voucher)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    return {"message": "Voucher deleted successfully"}

@app.get("/get-presigned-url")
def get_presigned_url(file_key: str):
    try:
        presigned_url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": file_key},
            ExpiresIn=3600
        )
        return {"url": presigned_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"S3 error: {str(e)}")

@app.get("/get-file")
def get_file(file_key: str):
    """Download a file from S3 server-side and stream it to the client.
    Avoids direct browser → S3 fetch which fails when S3 CORS is not configured.
    Falls back to prefixed keys to handle legacy records stored without folder prefix.
    """
    ext_to_mime = {
        "pdf":  "application/pdf",
        "jpg":  "image/jpeg",
        "jpeg": "image/jpeg",
        "png":  "image/png",
        "gif":  "image/gif",
        "webp": "image/webp",
    }
    ext = file_key.rsplit(".", 1)[-1].lower() if "." in file_key else ""
    media_type = ext_to_mime.get(ext, "application/octet-stream")

    # Build candidate keys: try the key as-is first, then common folder prefixes
    # for legacy records that were stored without the folder prefix.
    bare_name = file_key.split("/")[-1]   # strips any existing prefix
    candidates = [file_key]
    if "/" not in file_key:
        # Key has no folder — it's a legacy bare filename; try both folders
        candidates += [f"vouchers/{file_key}", f"bank_statements/{file_key}"]

    file_bytes = None
    resolved_key = None
    last_error = None

    for key in candidates:
        try:
            obj = s3.get_object(Bucket=bucket, Key=key)
            file_bytes = obj["Body"].read()
            resolved_key = key
            break
        except ClientError as e:
            code = e.response["Error"]["Code"]
            if code == "NoSuchKey":
                last_error = e
                continue   # try next candidate
            raise HTTPException(status_code=502, detail=f"S3 error ({code}): {e.response['Error']['Message']}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    if file_bytes is None:
        raise HTTPException(
            status_code=404,
            detail=f"File not found in S3. Tried keys: {candidates}"
        )

    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{bare_name}"'},
    )



@app.post("/pending-vouchers")
def create_pending_voucher(payload: PendingVoucherInputSchema, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    file_key = payload.file_key or redis_client.get(f"file_key:{current_uid}")
    if isinstance(file_key, bytes):
        file_key = file_key.decode("utf-8")
    db_item = PendingVouchers(
        unique_id=current_uid,
        voucher_type=payload.voucher_type,
        date=payload.date,
        voucher_no=payload.voucher_no,
        party=payload.party,
        items=payload.items or [],
        amount=payload.amount or 0.0,
        gst_amount=payload.gst_amount or 0.0,
        discount=payload.discount or 0.0,
        file_key=file_key,
        status="pending"
    )
    db.add(db_item)
    try:
        db.commit()
        db.refresh(db_item)
        if not payload.file_key:
            redis_client.delete(f"file_key:{current_uid}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    return _pv_to_dict(db_item)

def _pv_to_dict(pv):
    return {
        "id": pv.id,
        "voucher_type": pv.voucher_type,
        "date": pv.date,
        "voucher_no": pv.voucher_no,
        "party": pv.party,
        "items": pv.items,
        "amount": pv.amount,
        "gst_amount": pv.gst_amount,
        "discount": pv.discount,
        "file_key": pv.file_key,
        "status": pv.status,
    }

@app.get("/pending-vouchers")
def get_pending_vouchers(db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    rows = db.query(PendingVouchers).filter(PendingVouchers.status == "pending", PendingVouchers.unique_id == current_uid).order_by(PendingVouchers.id.asc()).all()
    return [_pv_to_dict(r) for r in rows]

@app.get("/pending-vouchers/stats")
def get_pending_stats(db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    pending_count = db.query(PendingVouchers).filter(PendingVouchers.status == "pending", PendingVouchers.unique_id == current_uid).count()
    done_count = db.query(PendingVouchers).filter(PendingVouchers.status.in_(["accepted", "rejected"]), PendingVouchers.unique_id == current_uid).count()
    total_count = db.query(PendingVouchers).filter(PendingVouchers.unique_id == current_uid).count()
    return {
        "pending": pending_count,
        "done": done_count,
        "total": total_count
    }

@app.post("/pending-vouchers/{item_id}/accept")
def accept_pending_voucher(item_id: int, payload: VoucherSchema, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    pending = db.query(PendingVouchers).filter(PendingVouchers.id == item_id, PendingVouchers.unique_id == current_uid).first()
    if not pending:
        raise HTTPException(status_code=404, detail="Pending voucher not found")
    
    # Check if a Voucher record with this file_key or voucher_no already exists in Vouchers table
    existing_v = None
    if pending.file_key:
        existing_v = db.query(Vouchers).filter(Vouchers.file_key == pending.file_key, Vouchers.unique_id == current_uid).first()
    if not existing_v and pending.voucher_no:
        existing_v = db.query(Vouchers).filter(Vouchers.voucher_no == pending.voucher_no, Vouchers.unique_id == current_uid).first()

    if existing_v:
        existing_v.voucher_type = payload.voucher_type
        existing_v.date = payload.date
        existing_v.voucher_no = payload.voucher_no
        existing_v.party = payload.party
        existing_v.items = payload.items
        existing_v.amount = payload.amount
        existing_v.gst_amount = payload.gst_amount
        existing_v.discount = payload.discount
        existing_v.status = "accepted"
        existing_v.meta_type = payload.meta_type
        existing_v.meta = payload.meta
        voucher = existing_v
    else:
        # Add to Vouchers table
        voucher = Vouchers(
            unique_id=current_uid,
            voucher_type=payload.voucher_type,
            date=payload.date,
            voucher_no=payload.voucher_no,
            party=payload.party,
            items=payload.items,
            amount=payload.amount,
            gst_amount=payload.gst_amount,
            discount=payload.discount,
            status="accepted",
            file_key=pending.file_key,
            meta_type=payload.meta_type,
            meta=payload.meta
        )
        db.add(voucher)
    pending.status = "accepted"
    
    try:
        db.commit()
        db.refresh(voucher)
        db.refresh(pending)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    return {"message": "Voucher approved and saved", "voucher_id": voucher.id}

@app.post("/pending-vouchers/{item_id}/reject")
def reject_pending_voucher(item_id: int, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    pending = db.query(PendingVouchers).filter(PendingVouchers.id == item_id, PendingVouchers.unique_id == current_uid).first()
    if not pending:
        raise HTTPException(status_code=404, detail="Pending voucher not found")
    pending.status = "rejected"
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    return {"message": "Voucher rejected"}
    if not pending:
        raise HTTPException(status_code=404, detail="Pending voucher not found")
    pending.status = "rejected"
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    return {"message": "Voucher rejected"}

def _bs_to_dict(bs):
    return {
        "id": bs.id,
        "bank_name": bs.bank_name,
        "account_number": bs.account_number,
        "referrence_no": bs.referrence_no,
        "transaction_date": bs.transaction_date,
        "description": bs.description,
        "transaction_type": bs.transaction_type,
        "amount": bs.amount,
        "category": bs.category,
        "reconciliation_status": bs.reconciliation_status,
        "party_name": bs.party_name,
        "voucher_ref": bs.voucher_ref
    }

@app.post("/bank-statements")
def add_bank_statements(payload: List[BankStatementInputSchema], db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    records_added = []
    for item in payload:
        bs = BankStatements(
            unique_id=current_uid,
            bank_name=item.bank_name,
            account_number=item.account_number,
            referrence_no=item.referrence_no,
            transaction_date=item.transaction_date,
            description=item.description,
            transaction_type=item.transaction_type,
            amount=item.amount,
            category=item.category,
            reconciliation_status=item.reconciliation_status,
            party_name=item.party_name,
            voucher_ref=item.voucher_ref
        )
        db.add(bs)
        records_added.append(bs)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    for r in records_added:
        db.refresh(r)
    return [_bs_to_dict(r) for r in records_added]

@app.get("/bank-statements")
def get_bank_statements(db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    rows = db.query(BankStatements).filter(BankStatements.unique_id == current_uid).order_by(BankStatements.id.desc()).all()
    return [_bs_to_dict(r) for r in rows]

@app.get("/bank-statements/{bs_id}")
def get_bank_statement(bs_id: int, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    bs = db.query(BankStatements).filter(BankStatements.id == bs_id, BankStatements.unique_id == current_uid).first()
    if not bs:
        raise HTTPException(status_code=404, detail="Bank statement not found")
    return _bs_to_dict(bs)

@app.put("/bank-statements/{bs_id}")
def update_bank_statement(bs_id: int, payload: BankStatementInputSchema, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    bs = db.query(BankStatements).filter(BankStatements.id == bs_id, BankStatements.unique_id == current_uid).first()
    if not bs:
        raise HTTPException(status_code=404, detail="Bank statement not found")
    bs.bank_name = payload.bank_name
    bs.account_number = payload.account_number
    bs.referrence_no = payload.referrence_no
    bs.transaction_date = payload.transaction_date
    bs.description = payload.description
    bs.transaction_type = payload.transaction_type
    bs.amount = payload.amount
    bs.category = payload.category or "Miscellaneous"
    bs.reconciliation_status = payload.reconciliation_status or "pending"
    bs.party_name = payload.party_name or ''
    bs.voucher_ref = payload.voucher_ref or ''
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    db.refresh(bs)
    return _bs_to_dict(bs)

@app.delete("/bank-statements/{bs_id}")
def delete_bank_statement(bs_id: int, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    bs = db.query(BankStatements).filter(BankStatements.id == bs_id, BankStatements.unique_id == current_uid).first()
    if not bs:
        raise HTTPException(status_code=404, detail="Bank statement not found")
    try:
        db.delete(bs)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    return {"message": "Bank statement deleted successfully"}

def _brs_to_dict(b):
    return {
        "id": b.id,
        "transaction_id": b.transaction_id,
        "voucher_no": b.voucher_no,
        "description": b.description,
        "amount": b.amount,
        "gst_amount": b.gst_amount,
    }

@app.post("/BRS")
def add_BRS(payload: BRSInputSchema, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    brs = BRS(
        unique_id=current_uid,
        transaction_id=payload.transaction_id,
        voucher_no=payload.voucher_no,
        description=payload.description,
        amount=payload.amount,
        gst_amount=payload.gst_amount,
    )
    db.add(brs)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    db.refresh(brs)
    return _brs_to_dict(brs)

@app.get("/BRS")
def get_BRS(db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    rows = db.query(BRS).filter(BRS.unique_id == current_uid).order_by(BRS.id.desc()).all()
    return [_brs_to_dict(r) for r in rows]

@app.delete("/BRS/{brs_id}")
def delete_BRS(brs_id: int, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    brs = db.query(BRS).filter(BRS.id == brs_id, BRS.unique_id == current_uid).first()
    if not brs:
        raise HTTPException(status_code=404, detail="BRS record not found")
    bs_id     = brs.transaction_id
    voucher_no = brs.voucher_no
    try:
        db.delete(brs)
        # Revert bank statement to pending, clear party and voucher ref
        bs = db.query(BankStatements).filter(BankStatements.id == bs_id, BankStatements.unique_id == current_uid).first()
        if bs:
            bs.reconciliation_status = "pending"
            bs.party_name = ''
            bs.voucher_ref = ''
        # Revert voucher status to Pending
        vch = db.query(Vouchers).filter(Vouchers.voucher_no == voucher_no, Vouchers.unique_id == current_uid).first()
        if vch:
            vch.status = "Pending"
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    return {"message": "BRS record deleted and related records reverted to pending"}

def _godown_to_dict(g):
    return {
        "id": g.id,
        "godown_name": g.godown_name,
        "location": g.location,
        "items": g.items
    }

@app.post("/godown")
def add_godown(payload: GodownSchema, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    new_godown = godown(
        unique_id = current_uid,
        godown_name = payload.godown_name,
        location = payload.location,
        items = payload.items or []
    )
    db.add(new_godown)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    db.refresh(new_godown)
    return new_godown

@app.get("/godown")
def get_godown(db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    rows = db.query(godown).filter(godown.unique_id == current_uid).order_by(godown.id.desc()).all()
    return [_godown_to_dict(r) for r in rows]

def _units_to_dict(u):
    return {
        "id": u.id,
        "symbol": u.symbol,
        "name": u.name,
        "conversion": u.conversion,
        "decimals": u.decimals,
        "type": u.type,
        "used": u.used
    }

@app.put("/godown/{godown_name}")
def update_godown(godown_name:str, payload:GodownSchema, db:Session=Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    stock_item: Any
    row = db.query(godown).filter(godown.godown_name == godown_name, godown.unique_id == current_uid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Godown not found")
    old_items = copy.deepcopy(row.items) or []
    new_items = payload.items or []

    item_names = list({(item.get('name') or item.get('itemName')) for item in old_items + new_items if (item.get('name') or item.get('itemName'))})

    stock_rows = db.query(stock).filter(stock.item.in_(item_names), stock.unique_id == current_uid).all()
    stock_map = {s.item: s for s in stock_rows}
    
    # Update stock item quantities. If a stock item isn't created yet, we do not throw 400.
    for item in old_items:
        it_name = item.get('name') or item.get('itemName')
        if not it_name:
            continue
        stock_item = stock_map.get(it_name)
        if stock_item:
            stock_item.quantity = max(0, stock_item.quantity - item.get('quantity', 0))
            current_godowns = dict(stock_item.godowns or {})
            current_godowns[godown_name] = max(0, current_godowns.get(godown_name, 0) - item.get('quantity', 0))
            stock_item.godowns = current_godowns

    for item in new_items:
        it_name = item.get('name') or item.get('itemName')
        if not it_name:
            continue
        stock_item = stock_map.get(it_name)
        if stock_item:
            stock_item.quantity += item.get('quantity', 0)
            current_godowns = dict(stock_item.godowns or {})
            current_godowns[godown_name] = current_godowns.get(godown_name, 0) + item.get('quantity', 0)
            stock_item.godowns = current_godowns
    
    row.godown_name = payload.godown_name
    row.location = payload.location
    row.items = payload.items or []

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    db.refresh(row)
    return row

@app.get("/godown/{godown_name}")
def get_single_godown(godown_name: str, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    row = db.query(godown).filter(godown.godown_name == godown_name, godown.unique_id == current_uid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Godown not found")
    return _godown_to_dict(row)

@app.delete("/godown/{godown_name}")
def delete_godown(godown_name: str, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    row = db.query(godown).filter(godown.godown_name == godown_name, godown.unique_id == current_uid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Godown not found")

    # For each item stored in this godown, deduct its quantity from stock
    # and remove this godown from the stock's godowns dict
    for item_entry in (row.items or []):
        item_name = item_entry.get("itemName") or item_entry.get("name") or ""
        item_qty = item_entry.get("quantity", 0)
        if not item_name:
            continue
        stock_row = db.query(stock).filter(stock.item == item_name, stock.unique_id == current_uid).first()
        if stock_row:
            stock_row.quantity = max(0, (stock_row.quantity or 0) - item_qty)
            current_godowns = dict(stock_row.godowns or {})
            current_godowns.pop(godown_name, None)
            stock_row.godowns = current_godowns

    try:
        db.delete(row)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    return {"message": f"Godown '{godown_name}' deleted successfully"}

@app.put("/stock/{item_name}")
def update_stock(item_name: str, payload: StockSchema, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    row = db.query(stock).filter(stock.item == item_name, stock.unique_id == current_uid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Stock item not found")

    old_godowns: dict = dict(row.godowns or {})
    new_godowns: dict = dict(payload.godowns or {})

    # Adjust all affected godown records
    all_godown_names = set(old_godowns.keys()) | set(new_godowns.keys())
    for gd_name in all_godown_names:
        gd_row = db.query(godown).filter(godown.godown_name == gd_name, godown.unique_id == current_uid).first()
        if not gd_row:
            continue
        items_list: list = list(gd_row.items or [])
        # Remove old entry for this stock item
        items_list = [i for i in items_list if (i.get("itemName") or i.get("name")) != item_name]
        # Add updated entry if quantity > 0 in new payload
        new_qty = new_godowns.get(gd_name, 0)
        if new_qty > 0:
            items_list.append({
                "itemName": payload.item,
                "quantity": new_qty,
                "unit": payload.unit
            })
        gd_row.items = items_list

    row.item = payload.item
    row.quantity = payload.quantity
    row.unit = payload.unit
    row.rate = payload.rate
    row.godowns = payload.godowns
    row.gst_rate = payload.gst_rate
    row.hsn_code = payload.hsn_code

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    db.refresh(row)
    return _items_to_dict(row)

@app.delete("/stock/{item_name}")
def delete_stock(item_name: str, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    row = db.query(stock).filter(stock.item == item_name, stock.unique_id == current_uid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Stock item not found")

    # Remove this stock item from every godown it belongs to
    for gd_name, gd_qty in (row.godowns or {}).items():
        gd_row = db.query(godown).filter(godown.godown_name == gd_name, godown.unique_id == current_uid).first()
        if gd_row:
            items_list = [
                i for i in (gd_row.items or [])
                if (i.get("itemName") or i.get("name")) != item_name
            ]
            gd_row.items = items_list

    try:
        db.delete(row)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    return {"message": f"Stock item '{item_name}' deleted successfully"}

@app.post("/units")
def add_unit(payload: UnitSchema, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    new_unit = units(
        unique_id = current_uid,
        symbol = payload.symbol,
        name = payload.name,
        conversion = payload.conversion,
        decimals = payload.decimals,
        type = payload.type,
        used = 0
    )
    db.add(new_unit)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    db.refresh(new_unit)
    return new_unit

@app.get("/units")
def get_units(db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    rows = db.query(units).filter(units.unique_id == current_uid).order_by(units.id.desc()).all()
    return [_units_to_dict(r) for r in rows]

@app.get("/units/{unit_symbol}")
def get_conversion(unit_symbol: str, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    row = db.query(units).filter(units.symbol == unit_symbol, units.unique_id == current_uid).first()
    try:
        if row is not None:
            return row.conversion
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
@app.delete("/units/{unit_symbol}")
def delete_unit(unit_symbol: str, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    row = db.query(units).filter(units.symbol == unit_symbol, units.unique_id == current_uid).first()
    try:
        if row is not None:
            if row.type == 'simple' and row.used > 0:
                return {"status": "Unsuccesful operation", "detail": "Simple units can't be deleted unless completely unused. You are using this unit to count some stock items. Kindly check and retry."}
            else:
                db.delete(row)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
def _items_to_dict(i):
    return {
        "id": i.id,
        "item": i.item,
        "quantity": i.quantity,
        "unit": i.unit,
        "rate": i.rate,
        "godowns": i.godowns,
        "gst_rate": i.gst_rate,
        "hsn_code": i.hsn_code
    }

@app.post("/stock")
def add_stock(payload: StockSchema, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    new_stock = stock(
        unique_id = current_uid,
        item = payload.item,
        quantity = payload.quantity,
        unit = payload.unit,
        rate = payload.rate,
        godowns = payload.godowns,
        gst_rate = payload.gst_rate,
        hsn_code = payload.hsn_code
    )
    db.add(new_stock)

    # Sync: For every godown specified in the stock item payload, add the item to that godown's items list
    for gd_name, gd_qty in (payload.godowns or {}).items():
        gd_row = db.query(godown).filter(godown.godown_name == gd_name, godown.unique_id == current_uid).first()
        if gd_row:
            items_list = list(gd_row.items or [])
            # Filter out existing entries for safety
            items_list = [i for i in items_list if (i.get("itemName") or i.get("name")) != payload.item]
            if gd_qty > 0:
                items_list.append({
                    "itemName": payload.item,
                    "quantity": gd_qty,
                    "unit": payload.unit
                })
            gd_row.items = items_list

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    db.refresh(new_stock)
    return new_stock
    
@app.get("/stock")
def get_stock(db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    rows = db.query(stock).filter(stock.unique_id == current_uid).order_by(stock.id.desc()).all()
    return [_items_to_dict(r) for r in rows]

def _log_to_dict(l):
    return {
        "id": l.id,
        "created_at": l.created_at,
        "detail": l.detail,
    }

@app.post("/notification-log")
def add_log(payload: NotificationLogSchema, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    new_log = notificationLogs(
        unique_id = current_uid,
        detail = payload.detail
    )
    db.add(new_log)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    db.refresh(new_log)
    return new_log

@app.get("/notification-log")
def get_log(db: Session = Depends(get_db)):
    rows = db.query(notificationLogs).order_by(notificationLogs.id.desc()).all()
    return [_log_to_dict(r) for r in rows]

@app.post("/generate-invoice")
def gen_invoice(payload: InvoiceGenerationSchema):
    from utils.invoice_gen import _DEFAULT_PDF

    voucher_type = payload.voucher_type or "Sales"

    # ── Sales (and legacy) path: build the classic data dict ──────────────────
    if voucher_type == "Sales" and payload.invoice_no and payload.issued_to and payload.items:
        data = {
            "invoice_no":   payload.invoice_no,
            "company_name": payload.company_name,
            "issued_to": {
                "name":    payload.issued_to.name,
                "address": payload.issued_to.address,
                "phone":   payload.issued_to.phone,
                "email":   payload.issued_to.email,
            },
            "items": [
                {"desc": item.desc, "qty": item.qty, "price": item.price}
                for item in payload.items
            ],
            "tax_rate":        payload.tax_rate,
            "payment_details": {
                "bank":         payload.payment_details.bank        if payload.payment_details else "",
                "account_no":   payload.payment_details.account_no  if payload.payment_details else "",
                "account_name": payload.payment_details.account_name if payload.payment_details else "",
            },
        }
        for key in ["issued_date", "due_date"]:
            date_str = getattr(payload, key)
            if not date_str:
                data[key] = date_str
                continue
            parsed = None
            for fmt in ("%Y-%m-%d", "%d %B %Y", "%d-%m-%Y"):
                try:
                    parsed = datetime.strptime(date_str, fmt)
                    break
                except ValueError:
                    continue
            data[key] = parsed or date_str
        generate_invoice(output_path=_DEFAULT_PDF, data=data)

    # ── All other voucher types: pass meta dict to the type-aware dispatcher ──
    else:
        meta = payload.meta or {}
        # Merge top-level convenience fields into meta for the PDF generator
        meta["voucher_type"]  = voucher_type
        meta["company_name"]  = payload.company_name or meta.get("company_name", "")
        meta["invoice_no"]    = payload.invoice_no   or meta.get("voucher_number", "")
        meta["issued_date"]   = payload.issued_date  or meta.get("date", "")
        generate_voucher_pdf(voucher_type=voucher_type, output_path=_DEFAULT_PDF, data=meta)

    if not os.path.exists(_DEFAULT_PDF):
        raise HTTPException(status_code=500, detail="Failed to generate voucher PDF")

    with open(_DEFAULT_PDF, "rb") as f:
        pdf_bytes = f.read()

    clear()
    return Response(content=pdf_bytes, media_type="application/pdf")


@app.post("/sync-invoice-stock")
def sync_invoice_stock(payload: InvoiceSyncSchema, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    """
    Deduct (revert=False) or restore (revert=True) stock and godown quantities
    based on the items listed in an invoice. Each item specifies an exact godown.
    """
    warnings_list = []
    for entry in payload.items:
        item_name   = (entry.item_name or '').strip()
        qty         = entry.qty
        godown_name = (entry.godown or '').strip()

        if not item_name:
            continue

        # Case-insensitive stock lookup scoped to current_uid
        stock_row = db.query(stock).filter(func.lower(stock.item) == item_name.lower(), stock.unique_id == current_uid).first()
        if not stock_row:
            warnings_list.append(f"Stock item '{item_name}' not found – skipped.")
            continue

        # ── Adjust total stock quantity ────────────────────────────────────────
        if payload.revert:
            stock_row.quantity = (stock_row.quantity or 0) + qty
        else:
            stock_row.quantity = max(0, (stock_row.quantity or 0) - qty)

        # ── Adjust the specific godown quantity ────────────────────────────────
        if godown_name:
            current_godowns = dict(stock_row.godowns or {})
            
            # Find matching key in current_godowns dict ignoring case
            target_key = godown_name
            for k in current_godowns.keys():
                if k.strip().lower() == godown_name.lower():
                    target_key = k
                    break

            if payload.revert:
                current_godowns[target_key] = current_godowns.get(target_key, 0) + qty
            else:
                current_godowns[target_key] = max(0, current_godowns.get(target_key, 0) - qty)
            stock_row.godowns = current_godowns

            # Sync the godown table record (items list inside each godown) scoped by current_uid
            gd_row = db.query(godown).filter(func.lower(godown.godown_name) == godown_name.lower(), godown.unique_id == current_uid).first()
            if gd_row:
                items_list = list(gd_row.items or [])
                updated    = False
                new_items  = []
                for gd_item in items_list:
                    e_name = (gd_item.get('itemName') or gd_item.get('name') or '').strip()
                    if e_name.lower() == item_name.lower():
                        new_qty = gd_item.get('quantity', 0)
                        new_qty = (new_qty + qty) if payload.revert else max(0, new_qty - qty)
                        gd_item = dict(gd_item)
                        gd_item['quantity'] = new_qty
                        updated = True
                    new_items.append(gd_item)

                # If reverting and item wasn't found in godown's list, add it back
                if not updated and payload.revert:
                    new_items.append({
                        'itemName': item_name,
                        'quantity': qty,
                        'unit':     stock_row.unit
                    })
                gd_row.items = new_items

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    result: dict = {"message": "Inventory synced successfully"}
    if warnings_list:
        result["warnings"] = warnings_list
    return result

@app.get("/whatsapp/status")
def whatsapp_get():
    return {"status": "ok", "detail": "success"}

@app.post("/whatsapp/read")
def whatsapp_read():
    return {"status": "ok", "detail": "success"}

# ── WhatsApp Integration Endpoints ─────────────────────────────────────────────

@app.get("/webhook/whatsapp")
def verify_whatsapp_webhook(request: Request):
    """WhatsApp Cloud API Webhook Verification Endpoint."""
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and token == WHATSAPP_VERIFY_TOKEN:
        return Response(content=challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification failed")

@app.post("/webhook/whatsapp")
async def whatsapp_webhook(request: Request, db: Session = Depends(get_db)):
    """Inbound WhatsApp Event & Message Webhook."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    result = process_whatsapp_event(body, db)
    return result

@app.post("/whatsapp/session/reset")
def reset_whatsapp_session(payload: WhatsAppResetSessionSchema):
    """Internal endpoint to force-reset a WhatsApp conversation session."""
    clear_session(payload.wa_id)
    return {"message": f"Session for wa_id '{payload.wa_id}' reset to MAIN_MENU"}

@app.post("/invoices/ingest")
def ingest_invoice(payload: WhatsAppIngestInvoiceSchema, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    """Accepts file/file_key + business_id/user_id + source=whatsapp, performs OCR extraction, and creates voucher records."""
    file_key = payload.file_key or f"whatsapp/ingest_{uuid.uuid4()}.pdf"
    
    file_bytes = None
    content_type = "application/pdf"
    if payload.file_key and s3 and bucket:
        try:
            res = s3.get_object(Bucket=bucket, Key=payload.file_key)
            file_bytes = res["Body"].read()
            content_type = res.get("ContentType") or "application/pdf"
        except Exception as e:
            print(f"S3 fetch error in ingest_invoice: {e}")

    report = {}
    if file_bytes:
        try:
            from utils.direct_ocr_extractor import ocr_extraction
            extracted = ocr_extraction(file_bytes, content_type, schema="voucher")
            if isinstance(extracted, dict):
                reports = extracted.get("reports")
                if isinstance(reports, list) and len(reports) > 0 and isinstance(reports[0], dict):
                    report = reports[0]
                elif "party" in extracted or "voucher_type" in extracted:
                    report = extracted
        except Exception as e:
            print(f"OCR error in ingest_invoice: {e}")

    voucher_type = report.get("voucher_type") or "Purchase"
    if not voucher_type or str(voucher_type).upper() == "NA":
        voucher_type = "Purchase"

    date_val = report.get("date")
    if not date_val or str(date_val).upper() == "NA":
        date_val = datetime.utcnow().strftime("%Y-%m-%d")
    else:
        date_val = str(date_val)

    party = report.get("party") or report.get("supplier_name")
    if not party or str(party).upper() == "NA":
        party = "WhatsApp Ingest"
    else:
        party = str(party)

    raw_vno = report.get("voucher_no")
    if not raw_vno or str(raw_vno).upper() == "NA":
        voucher_no = f"WA-{uuid.uuid4().hex[:8].upper()}"
    else:
        voucher_no = str(raw_vno)

    def _to_float(val):
        if val is None or str(val).upper() == "NA":
            return 0.0
        try:
            return float(val)
        except (ValueError, TypeError):
            return 0.0

    amount = _to_float(report.get("amount") or report.get("taxable_value"))
    gst_amount = _to_float(report.get("gst_amount") or report.get("cgst_amount"))
    discount = _to_float(report.get("discount"))
    items = report.get("items") or []

    pv = PendingVouchers(
        unique_id=current_uid,
        voucher_type=voucher_type,
        voucher_no=voucher_no,
        date=date_val,
        party=party,
        items=items,
        amount=amount,
        gst_amount=gst_amount,
        discount=discount,
        file_key=file_key,
        status="pending"
    )
    db.add(pv)

    vch = Vouchers(
        unique_id=current_uid,
        voucher_type=voucher_type,
        date=date_val,
        voucher_no=voucher_no,
        party=party,
        items=items,
        amount=amount,
        gst_amount=gst_amount,
        discount=discount,
        status="pending",
        file_key=file_key
    )
    db.add(vch)

    try:
        db.commit()
        db.refresh(pv)
        db.refresh(vch)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    return {
        "message": "Invoice ingested successfully into processing queue and voucher ledger",
        "pending_voucher_id": pv.id,
        "voucher_id": vch.id,
        "file_key": file_key,
        "source": payload.source,
        "extracted_party": party,
        "extracted_amount": amount,
        "extracted_gst": gst_amount
    }

@app.get("/invoices/batch-status/{batch_id}")
def get_batch_status(batch_id: str, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    """Poll/aggregate batch processing results for summary message."""
    pattern = f"%{batch_id}%"
    pending_items = db.query(PendingVouchers).filter(PendingVouchers.file_key.like(pattern), PendingVouchers.unique_id == current_uid).all()
    total_received = len(pending_items)
    processed_count = sum(1 for item in pending_items if item.status == "accepted")
    rejected_count = sum(1 for item in pending_items if item.status == "rejected")
    pending_count = sum(1 for item in pending_items if item.status == "pending")

    return {
        "batch_id": batch_id,
        "total_received": total_received,
        "processed_count": processed_count,
        "rejected_count": rejected_count,
        "pending_review": pending_count,
        "status": "completed" if pending_count == 0 else "processing"
    }

@app.post("/reports/generate")
def generate_report_endpoint(payload: ReportGenerateSchema, db: Session = Depends(get_db), current_uid: str = Depends(get_current_unique_id)):
    """{business_id/user_id, report_type, period} -> returns report file & summary."""
    user_id = payload.user_id or payload.business_id or 1
    report_type = payload.report_type.strip()
    period = payload.period.strip()

    if report_type.lower() == "inventory":
        file_path, text_digest = generate_inventory_report(db, user_id, period, unique_id=current_uid)
    elif report_type.lower() == "reconciliation":
        file_path, text_digest = generate_reconciliation_report(db, user_id, period, unique_id=current_uid)
    elif report_type.lower() == "summary":
        file_path, text_digest = generate_summary_report(db, user_id, period, unique_id=current_uid)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported report_type '{report_type}'")

    filename = os.path.basename(file_path)
    return {
        "report_type": report_type,
        "period": period,
        "text_digest": text_digest,
        "file_name": filename,
        "download_url": f"/get-file?file_key={filename}"
    }

@app.get("/whatsapp/accounts/{wa_id}")
def get_whatsapp_account(wa_id: str, db: Session = Depends(get_db)):
    """Resolve wa_id -> business_id/user_id or check linking status."""
    acc = db.query(WhatsAppAccount).filter(WhatsAppAccount.wa_id == wa_id).first()
    if not acc or acc.status != "active" or not acc.user_id:
        return {
            "wa_id": wa_id,
            "linked": False,
            "status": acc.status if acc else "unlinked",
            "message": "Account is not linked to any VyomPlus user"
        }
    user = db.query(Users).filter(Users.id == acc.user_id).first()
    return {
        "wa_id": wa_id,
        "linked": True,
        "user_id": acc.user_id,
        "business_id": acc.user_id,
        "unique_id": acc.unique_id or (user.unique_id if user else None),
        "status": acc.status,
        "verified_at": acc.verified_at,
        "user": {
            "email": user.email if user else None,
            "full_name": user.full_name if user else None,
            "mobile": user.mobile if user else None
        }
    }

@app.post("/whatsapp/accounts/link")
def link_whatsapp_account(payload: WhatsAppLinkSchema, db: Session = Depends(get_db)):
    """Explicitly link a wa_id to a user_id."""
    user = db.query(Users).filter(Users.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.unique_id:
        user.unique_id = str(uuid.uuid4())
        db.commit()

    acc = db.query(WhatsAppAccount).filter(WhatsAppAccount.wa_id == payload.wa_id).first()
    if not acc:
        acc = WhatsAppAccount(
            wa_id=payload.wa_id,
            user_id=payload.user_id,
            unique_id=user.unique_id,
            mobile=payload.mobile or user.mobile,
            status="active",
            verified_at=datetime.utcnow()
        )
        db.add(acc)
    else:
        acc.user_id = payload.user_id
        acc.unique_id = user.unique_id
        acc.mobile = payload.mobile or user.mobile
        acc.status = "active"
        acc.verified_at = datetime.utcnow()

    try:
        db.commit()
        db.refresh(acc)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    return {
        "message": f"WhatsApp account {payload.wa_id} successfully linked to user {user.email}",
        "wa_id": acc.wa_id,
        "user_id": acc.user_id,
        "unique_id": acc.unique_id,
        "status": acc.status
    }

    
keepalive.ping()

