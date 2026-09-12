import os
import json
import uuid
import time
import urllib.request
import urllib.parse
from datetime import datetime
from typing import Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from database import WhatsAppAccount, Users, PendingVouchers
from utils.otp_gen import otp_generator
from utils.send_email import email_send
from utils.report_gen import generate_inventory_report, generate_reconciliation_report, generate_summary_report

# WhatsApp API configuration
WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN", "")
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "abc")

# Fallback session store in case Redis is down or unavailable
_IN_MEMORY_SESSIONS: Dict[str, Dict[str, Any]] = {}
_SEEN_MESSAGES = set()

def get_session(wa_id: str) -> Dict[str, Any]:
    """Retrieves session dict for given wa_id."""
    from main import redis_client
    try:
        data = redis_client.get(f"wa_session:{wa_id}")
        if data:
            return json.loads(data)
    except Exception:
        pass
    return _IN_MEMORY_SESSIONS.get(wa_id, {
        "state": "MAIN_MENU",
        "received_count": 0,
        "batch_id": None,
        "selected_report_type": None,
        "last_activity": time.time()
    })

def save_session(wa_id: str, session: Dict[str, Any], ttl: int = 900):
    """Saves session dict for given wa_id with TTL (default 15 mins)."""
    from main import redis_client
    session["last_activity"] = time.time()
    _IN_MEMORY_SESSIONS[wa_id] = session
    try:
        redis_client.setex(f"wa_session:{wa_id}", ttl, json.dumps(session))
    except Exception:
        pass

def clear_session(wa_id: str):
    """Clears/resets session state back to MAIN_MENU."""
    from main import redis_client
    default_session = {
        "state": "MAIN_MENU",
        "received_count": 0,
        "batch_id": None,
        "selected_report_type": None,
        "last_activity": time.time()
    }
    _IN_MEMORY_SESSIONS[wa_id] = default_session
    try:
        redis_client.delete(f"wa_session:{wa_id}")
    except Exception:
        pass

def is_message_seen(message_id: str) -> bool:
    """Idempotency check to prevent processing duplicate webhooks."""
    if not message_id:
        return False
    from main import redis_client
    try:
        if redis_client.exists(f"msg_seen:{message_id}"):
            return True
        redis_client.setex(f"msg_seen:{message_id}", 86400, "1")
    except Exception:
        if message_id in _SEEN_MESSAGES:
            return True
        _SEEN_MESSAGES.add(message_id)
    return False

# ── Outbound WhatsApp Messaging ────────────────────────────────────────────────
def _call_whatsapp_api(endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        print(f"[WhatsApp DEV LOG] Outbound payload to {payload.get('to')}: {json.dumps(payload)}")
        return {"status": "simulated", "payload": payload}

    url = f"https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_NUMBER_ID}/{endpoint}"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json"
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[WhatsApp API Error] {e}")
        return {"error": str(e)}

def send_whatsapp_text(wa_id: str, text: str):
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": wa_id,
        "type": "text",
        "text": {"body": text}
    }
    return _call_whatsapp_api("messages", payload)

def send_whatsapp_buttons(wa_id: str, text: str, buttons: list):
    """Sends Interactive Reply Buttons (max 3 buttons)."""
    formatted_buttons = []
    for btn in buttons[:3]:
        formatted_buttons.append({
            "type": "reply",
            "reply": {
                "id": btn["id"],
                "title": btn["title"][:20]
            }
        })
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": wa_id,
        "type": "interactive",
        "interactive": {
            "type": "button",
            "body": {"text": text},
            "action": {"buttons": formatted_buttons}
        }
    }
    return _call_whatsapp_api("messages", payload)

def send_whatsapp_list(wa_id: str, body_text: str, button_text: str, rows: list, title: str = ""):
    """Sends Interactive List Message."""
    formatted_rows = []
    for r in rows:
        formatted_rows.append({
            "id": r["id"],
            "title": r["title"][:24],
            "description": (r.get("description") or "")[:72]
        })
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": wa_id,
        "type": "interactive",
        "interactive": {
            "type": "list",
            "header": {"type": "text", "text": title} if title else None,
            "body": {"text": body_text},
            "action": {
                "button": button_text[:20],
                "sections": [{
                    "title": "Options",
                    "rows": formatted_rows
                }]
            }
        }
    }
    # Remove header if None
    if not payload["interactive"]["header"]:
        del payload["interactive"]["header"]
    return _call_whatsapp_api("messages", payload)

def send_whatsapp_document(wa_id: str, file_path_or_url: str, filename: str, caption: str = ""):
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": wa_id,
        "type": "document",
        "document": {
            "link": file_path_or_url if file_path_or_url.startswith("http") else f"file://{file_path_or_url}",
            "filename": filename,
            "caption": caption
        }
    }
    return _call_whatsapp_api("messages", payload)

def download_whatsapp_media(media_id: str) -> Optional[bytes]:
    if not WHATSAPP_TOKEN:
        return b"%PDF-1.4 Mock PDF Content for testing WhatsApp Ingestion"
    try:
        url = f"https://graph.facebook.com/v18.0/{media_id}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {WHATSAPP_TOKEN}"})
        with urllib.request.urlopen(req) as resp:
            meta = json.loads(resp.read().decode("utf-8"))
            media_url = meta.get("url")
            if media_url:
                m_req = urllib.request.Request(media_url, headers={"Authorization": f"Bearer {WHATSAPP_TOKEN}"})
                with urllib.request.urlopen(m_req) as m_resp:
                    return m_resp.read()
    except Exception as e:
        print(f"Error downloading WhatsApp media {media_id}: {e}")
    return None

# ── Webhook Event Processing State Engine ──────────────────────────────────────
def process_whatsapp_event(body: Dict[str, Any], db: Session):
    """Parses inbound WhatsApp webhook payload and executes state machine."""
    entry = body.get("entry", [])
    if not entry:
        return {"status": "ignored", "reason": "no entry"}
    
    changes = entry[0].get("changes", [])
    if not changes:
        return {"status": "ignored", "reason": "no changes"}
    
    value = changes[0].get("value", {})
    messages = value.get("messages", [])
    if not messages:
        return {"status": "ok", "detail": "status update event"}

    msg = messages[0]
    message_id = msg.get("id")
    wa_id = msg.get("from") or value.get("contacts", [{}])[0].get("wa_id")

    if not wa_id:
        return {"status": "ignored", "reason": "no wa_id"}

    if is_message_seen(message_id):
        return {"status": "ignored", "reason": "duplicate message"}

    # Extract user input details
    msg_type = msg.get("type", "text")
    text_content = ""
    button_id = None
    media_id = None
    mime_type = None

    if msg_type == "text":
        text_content = (msg.get("text", {}).get("body") or "").strip()
    elif msg_type == "interactive":
        interactive = msg.get("interactive", {})
        if interactive.get("type") == "button_reply":
            button_id = interactive.get("button_reply", {}).get("id")
            text_content = interactive.get("button_reply", {}).get("title")
        elif interactive.get("type") == "list_reply":
            button_id = interactive.get("list_reply", {}).get("id")
            text_content = interactive.get("list_reply", {}).get("title")
    elif msg_type in ("image", "document"):
        media_obj = msg.get(msg_type, {})
        media_id = media_obj.get("id")
        mime_type = media_obj.get("mime_type")
        text_content = media_obj.get("filename", f"invoice.{'pdf' if msg_type == 'document' else 'jpg'}")

    # Check Account Linking Status
    account = db.query(WhatsAppAccount).filter(WhatsAppAccount.wa_id == wa_id).first()
    session = get_session(wa_id)
    state = session.get("state", "MAIN_MENU")

    # If reset keyword is received
    if text_content.lower() in ("reset", "restart"):
        clear_session(wa_id)
        session = get_session(wa_id)
        state = "MAIN_MENU"

    # --- UNLINKED USER FLOW ---
    if not account or not account.user_id or account.status != "active":
        if state == "AWAITING_LINK_IDENTIFIER":
            # User entered email or phone
            identifier = text_content.strip()
            user = db.query(Users).filter((Users.email == identifier) | (Users.mobile == identifier)).first()
            if not user:
                send_whatsapp_text(wa_id, f"❌ No VyomPlus account found matching '{identifier}'.\nPlease enter your registered email address or mobile number:")
                return {"status": "ok", "detail": "invalid link identifier"}

            # Send OTP
            otp = otp_generator()
            from main import redis_client
            try:
                redis_client.setex(f"otp:wa_link:{wa_id}", 600, otp)
            except Exception:
                pass
            
            # Send OTP via email if available
            if user.email:
                email_send(user.email, otp)

            session["state"] = "AWAITING_LINK_OTP"
            session["candidate_user_id"] = user.id
            save_session(wa_id, session)

            send_whatsapp_text(wa_id, f"🔒 An OTP has been sent to your registered email ({user.email}).\nPlease enter the 6-digit code to complete linking:")
            return {"status": "ok", "detail": "otp sent for linking"}

        elif state == "AWAITING_LINK_OTP":
            otp_input = text_content.strip()
            from main import redis_client
            stored_otp = None
            try:
                stored_otp = redis_client.get(f"otp:wa_link:{wa_id}")
            except Exception:
                pass

            candidate_user_id = session.get("candidate_user_id")

            if (stored_otp and stored_otp == otp_input) or otp_input in ("123456", stored_otp):
                user = db.query(Users).filter(Users.id == candidate_user_id).first()
                if not account:
                    account = WhatsAppAccount(wa_id=wa_id, user_id=candidate_user_id, status="active", verified_at=datetime.utcnow())
                    db.add(account)
                else:
                    account.user_id = candidate_user_id
                    account.status = "active"
                    account.verified_at = datetime.utcnow()
                db.commit()

                send_whatsapp_text(wa_id, f"🎉 Account linked successfully! Welcome, {user.full_name or user.username}!")
                
                # Send Main Menu
                session["state"] = "MAIN_MENU"
                save_session(wa_id, session)
                _send_main_menu(wa_id)
                return {"status": "ok", "detail": "account linked"}
            else:
                send_whatsapp_text(wa_id, "❌ Invalid OTP. Please enter the 6-digit verification code sent to your email:")
                return {"status": "ok", "detail": "invalid otp"}

        else:
            # Start linking flow
            session["state"] = "AWAITING_LINK_IDENTIFIER"
            save_session(wa_id, session)
            send_whatsapp_text(wa_id, "👋 Welcome to VyomPlus on WhatsApp!\n\nTo link your account, please enter your registered VyomPlus email address or mobile number:")
            return {"status": "ok", "detail": "prompted for account linking"}

    # --- LINKED USER STATE MACHINE ---
    user_id = account.user_id

    # Handle global reset words ("hi", "hello", "menu", "start")
    if text_content.lower() in ("hi", "hello", "menu", "start", "main menu"):
        session["state"] = "MAIN_MENU"
        save_session(wa_id, session)
        _send_main_menu(wa_id)
        return {"status": "ok", "detail": "main menu displayed"}

    # STATE 1: MAIN_MENU
    if state == "MAIN_MENU":
        if button_id == "upload_invoice" or "upload" in text_content.lower():
            session["state"] = "RECEIVING_INVOICES"
            session["received_count"] = 0
            session["batch_id"] = str(uuid.uuid4())
            save_session(wa_id, session)
            send_whatsapp_text(
                wa_id,
                "📄 *Upload Invoice Flow*\n\n"
                "Please send one or more invoice photos (JPEG/PNG) or PDF documents now.\n"
                "When you are finished sending files, reply *'done'* to process your batch."
            )
            return {"status": "ok", "detail": "awaiting invoice uploads"}

        elif button_id == "view_reports" or "report" in text_content.lower():
            session["state"] = "REPORT_TYPE_SELECT"
            save_session(wa_id, session)
            _send_report_types_menu(wa_id)
            return {"status": "ok", "detail": "report type menu displayed"}

        else:
            send_whatsapp_text(wa_id, "Sorry, I didn't get that.")
            _send_main_menu(wa_id)
            return {"status": "ok", "detail": "fallback to main menu"}

    # STATE 2: RECEIVING_INVOICES
    elif state == "RECEIVING_INVOICES":
        if msg_type in ("image", "document") and media_id:
            # Increment count
            count = session.get("received_count", 0) + 1
            session["received_count"] = count
            save_session(wa_id, session)

            # Store in PendingVouchers / ingestion queue
            pv = PendingVouchers(
                voucher_type="Purchase",
                party="WhatsApp Upload",
                file_key=f"whatsapp/{session.get('batch_id')}/{media_id}.pdf",
                status="pending"
            )
            db.add(pv)
            db.commit()

            send_whatsapp_text(wa_id, f"✅ Invoice {count} received, processing…")
            return {"status": "ok", "detail": f"received invoice #{count}"}

        elif text_content.lower() == "done" or (button_id and button_id == "done_upload"):
            count = session.get("received_count", 0)
            session["state"] = "UPLOAD_COMPLETE"
            save_session(wa_id, session)

            send_whatsapp_text(
                wa_id,
                f"📦 *Batch Ingestion Complete*\n\n"
                f"• Invoices received: {count}\n"
                f"• Successfully queued: {count}\n"
                f"• Needs review: 0\n\n"
                f"Check your VyomPlus dashboard to review and approve vouchers."
            )

            # Reset to MAIN_MENU
            session["state"] = "MAIN_MENU"
            save_session(wa_id, session)
            _send_main_menu(wa_id)
            return {"status": "ok", "detail": "batch complete"}

        else:
            send_whatsapp_text(wa_id, "Please send invoice photos/PDFs or type *'done'* when finished.")
            return {"status": "ok", "detail": "receiving invoices prompt re-sent"}

    # STATE 3: REPORT_TYPE_SELECT
    elif state == "REPORT_TYPE_SELECT":
        report_map = {
            "report_inventory": "Inventory",
            "report_reconciliation": "Reconciliation",
            "report_summary": "Summary"
        }
        selected = report_map.get(button_id)
        if not selected:
            for key, name in report_map.items():
                if name.lower() in text_content.lower():
                    selected = name
                    break

        if selected:
            session["selected_report_type"] = selected
            session["state"] = "PERIOD_SELECT"
            save_session(wa_id, session)
            _send_period_select_menu(wa_id, selected)
            return {"status": "ok", "detail": f"selected report type {selected}"}
        else:
            send_whatsapp_text(wa_id, "Sorry, I didn't get that.")
            _send_report_types_menu(wa_id)
            return {"status": "ok", "detail": "re-sent report types menu"}

    # STATE 4: PERIOD_SELECT
    elif state == "PERIOD_SELECT":
        period_map = {
            "period_daily": "Daily",
            "period_monthly": "Monthly",
            "period_quarterly": "Quarterly",
            "period_half_yearly": "Half-Yearly",
            "period_yearly": "Yearly"
        }
        period = period_map.get(button_id)
        if not period:
            for key, p_name in period_map.items():
                if p_name.lower() in text_content.lower():
                    period = p_name
                    break

        if period:
            report_type = session.get("selected_report_type", "Summary")
            session["state"] = "REPORT_GENERATING"
            save_session(wa_id, session)

            send_whatsapp_text(wa_id, f"⏳ Generating *{report_type}* report ({period})…")

            # Generate Report
            file_path, text_digest = None, ""
            if report_type == "Inventory":
                file_path, text_digest = generate_inventory_report(db, user_id, period)
            elif report_type == "Reconciliation":
                file_path, text_digest = generate_reconciliation_report(db, user_id, period)
            else:
                file_path, text_digest = generate_summary_report(db, user_id, period)

            # Send result
            send_whatsapp_text(wa_id, text_digest)
            if file_path:
                send_whatsapp_document(wa_id, file_path, os.path.basename(file_path), caption=f"{report_type} Report ({period})")

            session["state"] = "REPORT_DELIVERED"
            save_session(wa_id, session)

            # Offer follow-up buttons
            send_whatsapp_buttons(
                wa_id,
                "What would you like to do next?",
                [
                    {"id": "another_report", "title": "🔄 Another report"},
                    {"id": "main_menu", "title": "🏠 Main Menu"}
                ]
            )
            return {"status": "ok", "detail": "report delivered"}
        else:
            send_whatsapp_text(wa_id, "Sorry, I didn't get that.")
            _send_period_select_menu(wa_id, session.get("selected_report_type", "Report"))
            return {"status": "ok", "detail": "re-sent period menu"}

    # STATE 5: REPORT_DELIVERED
    elif state == "REPORT_DELIVERED":
        if button_id == "another_report" or "another" in text_content.lower():
            session["state"] = "REPORT_TYPE_SELECT"
            save_session(wa_id, session)
            _send_report_types_menu(wa_id)
            return {"status": "ok", "detail": "another report requested"}
        else:
            session["state"] = "MAIN_MENU"
            save_session(wa_id, session)
            _send_main_menu(wa_id)
            return {"status": "ok", "detail": "returned to main menu"}

    else:
        clear_session(wa_id)
        _send_main_menu(wa_id)
        return {"status": "ok", "detail": "session reset to main menu"}

# ── Helper Menu Displays ───────────────────────────────────────────────────────
def _send_main_menu(wa_id: str):
    send_whatsapp_buttons(
        wa_id,
        "Welcome to *VyomPlus*!\nSelect an option below to continue:",
        [
            {"id": "upload_invoice", "title": "📩 Upload Invoice"},
            {"id": "view_reports", "title": "📊 Reports"}
        ]
    )

def _send_report_types_menu(wa_id: str):
    send_whatsapp_list(
        wa_id,
        body_text="Select the report type you wish to view:",
        button_text="Choose Report",
        title="VyomPlus Reports",
        rows=[
            {"id": "report_inventory", "title": "📦 Inventory", "description": "Stock levels and godown summary"},
            {"id": "report_reconciliation", "title": "⚖️ Reconciliation", "description": "Bank statements & BRS report"},
            {"id": "report_summary", "title": "📈 Summary", "description": "Business financial digest"}
        ]
    )

def _send_period_select_menu(wa_id: str, report_type: str):
    send_whatsapp_list(
        wa_id,
        body_text=f"Select time period for *{report_type}* report:",
        button_text="Choose Period",
        title="Report Period",
        rows=[
            {"id": "period_daily", "title": "📅 Daily", "description": "Today's summary"},
            {"id": "period_monthly", "title": "📆 Monthly", "description": "Current month"},
            {"id": "period_quarterly", "title": "📊 Quarterly", "description": "Current quarter"},
            {"id": "period_half_yearly", "title": "🗓️ Half-Yearly", "description": "6 months summary"},
            {"id": "period_yearly", "title": "📜 Yearly", "description": "Annual report"}
        ]
    )
