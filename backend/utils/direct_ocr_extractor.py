import json
import os
import uuid
from io import StringIO

import boto3
import pandas as pd
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from schema import VoucherReportList, BankStatementReportList

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

load_dotenv()

s3 = boto3.client(
    "s3",
    region_name=os.getenv("S3_REGION"),
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
)
bucket = os.getenv("S3_BUCKET_NAME")

# Same rolling memory as the previous agent-based flow
invoice_rows = []
invoice_json_records = []
global_rows = invoice_rows
global_json_records = invoice_json_records


def clear_extractions():
    invoice_rows.clear()
    invoice_json_records.clear()
    global_rows.clear()
    global_json_records.clear()


def _normalize_invoice_record(data: dict) -> dict:
    normalized = {}
    for field in [
        "invoice_number",
        "invoice_date",
        "invoice_type",
        "supplier_gstin",
        "buyer_gstin",
        "supplier_name",
        "place_of_supply",
        "hsn_sac_code",
        "item_description",
        "quantity",
        "unit_price",
        "taxable_value",
        "gst_rate",
        "cgst_amount",
        "sgst_amount",
        "igst_amount",
        "cess_amount",
        "total_invoice_value",
        "reverse_charge",
    ]:
        normalized[field] = data.get(field) or "NA"
    return normalized


def append_extracted_data(data: dict):
    normalized_data = _normalize_invoice_record(data)
    invoice_json_records.append(normalized_data)

    invoice_row = {
        "invoice_number": normalized_data.get("invoice_number"),
        "invoice_date": normalized_data.get("invoice_date"),
        "supplier_name": normalized_data.get("supplier_name"),
        "buyer_name": normalized_data.get("buyer_name") if normalized_data.get("buyer_name") else "NA",
        "grand_total": normalized_data.get("total_invoice_value") or normalized_data.get("grand_total") or "NA",
        "invoice_type": normalized_data.get("invoice_type"),
        "supplier_gstin": normalized_data.get("supplier_gstin"),
        "place_of_supply": normalized_data.get("place_of_supply"),
        "hsn_sac_code": normalized_data.get("hsn_sac_code"),
        "item_description": normalized_data.get("item_description"),
        "quantity": normalized_data.get("quantity"),
        "unit_price": normalized_data.get("unit_price"),
        "taxable_value": normalized_data.get("taxable_value"),
        "gst_rate": normalized_data.get("gst_rate"),
        "cgst_amount": normalized_data.get("cgst_amount"),
        "sgst_amount": normalized_data.get("sgst_amount"),
        "igst_amount": normalized_data.get("igst_amount"),
        "cess_amount": normalized_data.get("cess_amount"),
        "total_invoice_value": normalized_data.get("total_invoice_value"),
        "reverse_charge": normalized_data.get("reverse_charge"),
    }

    invoice_rows.append(invoice_row)

    buffer = StringIO()
    pd.DataFrame(invoice_rows).to_csv(buffer, index=False)

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
        Params={"Bucket": bucket, "Key": s3_key},
        ExpiresIn=3600
    )
    return presigned_url, s3_key


def ocr_extraction(file_bytes, content_type, schema):
    client = genai.Client()
    if schema in {'invoice', 'invoiceExtraction', 'invoice-extraction', 'invoice_extraction'}:
        output_schema = LLMSchema.model_json_schema()
        schema_prompt = 'Analyse the uploaded invoice/document and extract the required invoice fields according to the output schema. If a field is not found, return "NA".'
    elif schema == 'voucher':
        output_schema = VoucherReportList.model_json_schema()
        schema_prompt = 'Analyse the file and extract the text required according to the output schema and for any field where you are confused or can\'t find the correct data write NA or 0'
    elif schema == 'bankStatement':
        output_schema = BankStatementReportList.model_json_schema()
        schema_prompt = 'Analyse the file and extract the text required according to the output schema and for any field where you are confused or can\'t find the correct data write NA or 0'
    else:
        raise ValueError(f"Unsupported OCR extraction schema: {schema}")

    response = client.models.generate_content(
        model='gemini-3.5-flash-lite',
        contents=[
            types.Part(
                inline_data=types.Blob(
                    mime_type=content_type,
                    data=file_bytes
                )
            ),
            schema_prompt
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_json_schema=output_schema,
            temperature=0.1
        )
    )

    parsed = None
    if hasattr(response, 'parsed') and response.parsed is not None:
        parsed = response.parsed
    elif hasattr(response, 'text') and response.text:
        try:
            parsed = json.loads(response.text)
        except Exception:
            parsed = None

    if schema in {'invoice', 'invoiceExtraction', 'invoice-extraction', 'invoice_extraction'}:
        if isinstance(parsed, BaseModel):
            parsed = parsed.model_dump()
        if isinstance(parsed, dict):
            normalized = _normalize_invoice_record(parsed)
            return {
                'normal': normalized,
                'raw_response': response,
                'csv_file': None,
            }
        if isinstance(parsed, list):
            normalized_list = []
            for item in parsed:
                if isinstance(item, BaseModel):
                    item = item.model_dump()
                normalized_list.append(_normalize_invoice_record(item))
            return {
                'normal': normalized_list,
                'raw_response': response,
                'csv_file': None,
            }

    # For other schemas like voucher / bankStatement, return the parsed schema object directly
    # so that the root JSON object has the 'reports' key directly as expected by the frontend.
    if parsed is None:
        return {"reports": []}
    if isinstance(parsed, BaseModel):
        parsed = parsed.model_dump()
    return parsed