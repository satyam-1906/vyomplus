import os
import resend
from dotenv import load_dotenv

load_dotenv()

resend_api_key = os.getenv("RESEND_API_KEY")
sender_email = os.getenv("SENDER_EMAIL") or os.getenv("MY_EMAIL") or "onboarding@resend.dev"

def email_send(email, otp):
    if not resend_api_key:
        raise ValueError("creds missing in env")
    if not email:
        raise ValueError("email address missing")
    
    resend.api_key = resend_api_key
    subject = "Please verify your email"
    body = f"""
     Hello, thanks for choosing our platform.
     Enter this OTP to login: {otp}
     Happy researching!!
     """
    try:
        resend.Emails.send({
            "from": sender_email,
            "to": [email],
            "subject": subject,
            "text": body
        })
        return True
    except Exception as e:
        raise e



