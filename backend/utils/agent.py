from langgraph.graph import StateGraph, END
from pydantic import BaseModel, SecretStr, Field
from typing import Optional, Any
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv
import os
import json
import uuid
import pandas as pd
from io import StringIO
from pydantic import SecretStr

load_dotenv()
import boto3
llm = ChatGoogleGenerativeAI(
    model="gemini-3.5-flash-lite",
    temperature=0,
    max_tokens=None,
    reasoning_format="hidden",
    timeout=None,
    max_retries=2
)
s3 = boto3.client(
    "s3",
    region_name=os.getenv("S3_REGION"),
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
)
bucket = os.getenv("S3_BUCKET_NAME")
class State(BaseModel):
    content: str
    normal: Optional[Any] = None
    fin: Optional[str] = ""
    key: Optional[str] = ""
SCHEMA = """
{
   "invoice_number": "",
   "invoice_date": "",
   "invoice_type": "",
   "supplier_gstin": "",
   "buyer_gstin": "",
   "supplier_name": "",
   "place_of_supply": "",
   "hsn_sac_code" : "",
   "item_description": "",
   "quantity": "",
   "unit_price": "",
   "taxable_value": "",
   "gst_rate" : "",
   "cgst_amount": "",
   "sgst_amount": "",
   "igst_amount": "",
   "cess_amount": "",
   "total_invoice_value": "",
   "reverse_charge": ""
}
"""

class LLMSchema(BaseModel):
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

def clean_json_response(text: str) -> str:
    text = text.strip()
    if text.startswith("```json"):
        text = text[len("```json"):]
    if text.startswith("```"):
        text = text[len("```"):]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        text = text[start:end + 1]
    return text

def normal_node(state: State):
    prompt = f"""You are an invoice extraction system. 
Extract invoice information according to the requested format.
Note: if HSN code is missing then do a small web search across the gov portals to find the accurate HSN code for the product/service.
Note: if IGST/CGST/SGST is missing then check if state of supplier and buyer are different than calculate igst else cgst and sgst.
Note: if taxable value is missing then calculate it by unit price * quantity.
Note: if total invoice value is missing then calculate it by sum of all the tax values plus the taxable value
Note: if reverse charge is missing then check if the invoice is raised by a supplier registered under GST or not and if not then add reverse charge as "Yes" else "No".
Note: cross validate CGST/SGST/IGST across fields by ccalculating with the percentages mentioned.
Note: if cess amount is missing then calculate it by (taxable value + tax values) * cess percentage.
Note: if total invoice value is missing then calculate it by sum of all the tax values plus the taxable value.
Note: if gst rate is missing then calculate it by (taxable value / 100) * gst rate.
Note: check date and validate the date. If the date is in dd/mm/yyyy format then convert it to yyyy-mm-dd format.
Note: if item_description is missing then check if the invoice is raised by a supplier registered under GST or not and if not then add item_description as "NA" else "NA".
Note: if total_invoice_value is missing then calculate it by sum of all the tax values plus the taxable value.
Note: if place of supply is missing then check if the invoice is raised by a supplier registered under GST or not and if not then add place of supply as "NA" else "NA".
Note: look for buyer name or party name. if "bill to" is present then it is the buyer name else it is the party name. if not found then "NA".
Note: try your best to mention the GSTIN. It maybe mentioned as GST NO. or GST No. or GST No or GSTIN. It's a 15 character alphanumeri code mentioned in the invoice.
Note: there will be two GSTIN's one for buyer and one for seller look correctly for both.

Invoice Text:
{state.content}"""

    # Bind the structured output schema directly to your LLM execution
    structured_llm = llm.with_structured_output(LLMSchema)
    
    try:
        # This will return a parsed Pydantic object automatically!
        structured_resp = structured_llm.invoke(prompt)
        # Convert to standard Python dict for your State
        normal_data = structured_resp.model_dump()
    except Exception as e:
        print("Structured extraction failed:", e)
        raise ValueError(f"LLM failed to provide valid data: {str(e)}")

    return {"normal": normal_data}

# Global storage for extractions
global_rows = []
global_json_records = []

def clear_extractions():
    global_rows.clear()
    global_json_records.clear()

def append_extracted_data(data: dict):
    global_json_records.append(data)

    supplier = data.get("supplier")
    supplier_name = data.get("supplier_name")
    if isinstance(supplier, dict):
        supplier_name = supplier.get("name") or supplier_name

    buyer = data.get("buyer")
    buyer_name = data.get("buyer_name")
    if isinstance(buyer, dict):
        buyer_name = buyer.get("name") or buyer_name

    totals = data.get("totals")
    grand_total = data.get("total_invoice_value") or data.get("grand_total")
    if isinstance(totals, dict):
        grand_total = totals.get("grand_total") or grand_total

    invoice_row = {
        "invoice_number": data.get("invoice_number"),
        "invoice_date": data.get("invoice_date"),
        "supplier_name": supplier_name,
        "buyer_name": buyer_name,
        "grand_total": grand_total,
        "invoice_number": data.get("invoice_number"),
        "invoice_date": data.get("invoice_date"),
        "invoice_type": data.get("invoice_type"),
        "supplier_gstin": data.get("supplier_gstin"),
        "supplier_name": data.get("supplier_name"),
        "place_of_supply": data.get("place_of_supply"),
        "hsn_sac_code" : data.get("hsn_sac_code"),
        "item_description": data.get("item_description"),
        "quantity": data.get("quantity"),
        "unit_price": data.get("unit_price"),
        "taxable_value": data.get("taxable_value"),
        "gst_rate" : data.get("gst_rate"),
        "cgst_amount": data.get("cgst_amount"),
        "sgst_amount": data.get("sgst_amount"),
        "igst_amount": data.get("igst_amount"),
        "cess_amount": data.get("cess_amount"),
        "total_invoice_value": data.get("total_invoice_value"),
        "reverse_charge": data.get("reverse_charge")
    }

    global_rows.append(invoice_row)

    buffer = StringIO()
    pd.DataFrame(global_rows).to_csv(
        buffer,
        index=False
    )

    filename = f"{uuid.uuid4()}.csv"
    s3_key = f"processed-csv/{filename}"

    s3.put_object(
        Bucket=bucket,
        Key=s3_key,
        Body=buffer.getvalue(),
        ContentType="text/csv"
    )

    presigned_url = s3.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": bucket,
            "Key": s3_key
        },
        ExpiresIn=3600
    )
    return presigned_url, s3_key

def final_node(state: State):
    data = state.normal

    if data is None:
        raise ValueError("No extracted invoice data found")

    presigned_url, s3_key = append_extracted_data(data)

    return {
        "fin": presigned_url,
        "key": s3_key,
        "normal": global_json_records
    }



graph = StateGraph(State)

graph.add_node("normal", normal_node)
graph.add_node("final", final_node)

graph.set_entry_point("normal")

graph.add_edge("normal", "final")
graph.add_edge("final", END)

lang_app = graph.compile()

def run_agent_for_pages(page_texts: list) -> dict:
    """Run the extraction agent once per page and accumulate rows in the CSV.
    
    Each non-empty page produces its own row, identical to the behaviour of
    submitting multiple single-page files for extraction.
    
    Returns the presigned URL of the final (accumulated) CSV and the full
    list of JSON records gathered so far.
    """
    last_csv = ""
    for page_text in page_texts:
        if not page_text or len(page_text.strip()) < 10:
            # Skip blank / nearly-blank pages
            continue
        result = lang_app.invoke(State(content=page_text))
        last_csv = result.get("fin") or last_csv
    return {"fin": last_csv, "normal": list(global_json_records)}
