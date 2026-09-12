# Technical Documentation: VyomPlus (Upgraded Palm Tree)

## 1. System Overview & Architecture

VyomPlus is an enterprise-grade financial accounting, invoice extraction, and inventory management platform. The repository is structured into both a Feature-Rich Monolithic Backend (`backend/`) and an Event-Driven Distributed Microservices Architecture (`v2/`), complemented by dual frontend implementations (`frontend/` and `uploadfront/`).

### System Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                                  FRONTENDS                                        |
|  +----------------------------------+     +------------------------------------+  |
|  | Next.js 16 App (uploadfront/)   |     | Vanilla JS Web App (frontend/)     |  |
|  +----------------------------------+     +------------------------------------+  |
+------------------------------------------+----------------------------------------+
                                           | HTTP / REST / Webhooks
                                           v
+-----------------------------------------------------------------------------------+
|                            BACKEND SERVICES LAYER                                 |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | Monolithic FastAPI Core Backend (backend/main.py)                          |  |
|  | - Auth, Onboarding, Business Profiles                                       |  |
|  | - Voucher Operations (Sales, Purchase, Payment, Receipt, Journal, etc.)    |  |
|  | - Inventory (Stock, Godowns, Units Sync)                                    |  |
|  | - Bank Statements & BRS Reconciliation                                      |  |
|  | - PDF Invoice & Report Generation (ReportLab)                               |  |
|  | - WhatsApp Cloud API Direct Integration & Conversational Bot                |  |
|  +-----------------------------------------------------------------------------+  |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | Microservices v2/ Architecture                                              |  |
|  | - Auth Service (Python/FastAPI, Argon2, JWT, Redis OTP)                      |  |
|  | - Upload Service (Python/FastAPI, S3 Presigned URLs, Twilio Webhook)         |  |
|  | - Consumer Worker (Python, Kafka Consumer, LangChain/Gemini AI, Tesseract)    |  |
|  | - Result Service (Golang/Gin, Kafka Consumer, Real-time SSE Stream)          |  |
|  +-----------------------------------------------------------------------------+  |
+------------------------------------------+----------------------------------------+
                                           |
    +--------------------------------------+---------------------------------+
    |                                      |                                 |
    v                                      v                                 v
+-----------------------+     +--------------------------+     +------------------------+
|   PostgreSQL DB       |     |  Redis Cache & Messaging |     | Apache Kafka Pipeline  |
| (Relational + JSONB)  |     | (OTP, Token Blacklist)   |     | (doc-submit, etc.)     |
+-----------------------+     +--------------------------+     +------------------------+
                                           |
                                           v
                              +--------------------------+
                              |   AWS S3 Bucket Storage  |
                              | (Raw PDFs, Invoices, etc)|
                              +--------------------------+
```

---

## 2. Technology Stack & Key Dependencies

### Backend Monolith (`backend/`)
* **Framework**: Python 3.10+ / FastAPI (`0.141.1`)
* **ORM & Database**: SQLAlchemy (`2.0.51`), PostgreSQL dialect with `JSONB` support
* **Security & Auth**: Argon2 (`0.1.10`), PyJWT (`2.13.0`), Python-Dotenv (`1.2.2`)
* **AI & Document Processing**:
  * **LangChain & LangGraph**: `langchain_google_genai`, `langgraph` (`1.2.10`) for structured LLM parsing
  * **OCR & PDF Extraction**: PyMuPDF / `fitz` (`0.0.1.dev2`), PyTesseract (`0.3.13`), Pillow (`12.3.0`)
  * **LLM Engine**: Google Gemini API (`gemini-1.5-flash` / `gemini-1.5-pro`)
* **Report & Document Generation**: ReportLab (`5.0.0`), Pandas (`3.0.5`), SymPy (`1.14.0`)
* **Cloud Storage & Messaging**: Boto3 (`1.43.29`), Botocore, Redis (`8.1.0`)

### Microservices v2 Architecture (`v2/`)
* **Auth Service**: FastAPI, Argon2, PyJWT, Redis OTP store
* **Upload Service**: FastAPI, Boto3 S3 Client, Twilio Webhook handler
* **Consumer Worker**: Kafka-Python (`KafkaConsumer`, `KafkaProducer`), LangChain Gemini extraction engine, PyTesseract OCR
* **Result Service**: Go (Golang 1.20+), Gin Web Framework (`github.com/gin-gonic/gin`), IBM Sarama Kafka Consumer (`github.com/IBM/sarama`), Server-Sent Events (SSE)

### Frontends
* **Web Client (`frontend/`)**: Vanilla HTML5, CSS3 (Glassmorphism design tokens, CSS Variables), JavaScript (Fetch API)
* **Modern Document Portal (`uploadfront/`)**: Next.js (`16.2.9`), React (`19.2.4`), TypeScript (`^5`), Tailwind CSS (`^4`)

---

## 3. Database Schema & Data Models

The system relies on PostgreSQL with rich structured data and unstructured metadata using native `JSONB` columns.

### 1. `test` (`Users`)
* `id` (Integer, Primary Key)
* `email` (String, Unique)
* `username` (String, Unique)
* `password` (String, Argon2 Hashed)
* `isactive` (Boolean, default False)
* `full_name`, `mobile` (String, Nullable)
* `mobile_verified`, `onboarding_complete`, `two_fa_enabled` (Boolean)
* `two_fa_method`, `recovery_email`, `recovery_phone`, `transaction_pin` (String, Nullable)
* `last_login` (DateTime), `last_login_ip`, `last_login_device` (String)
* `account_status` (String, default `"pending_onboarding"`)
* `consent_tos`, `consent_privacy`, `marketing_consent` (Boolean)
* `communication_preferences` (`JSONB`, default `{"email": true, "sms": false, "whatsapp": false}`)

### 2. `business_profiles` (`BusinessProfile`)
* `id` (Integer, Primary Key)
* `user_id` (Integer, Unique FK)
* **General Info**: `entity_type`, `legal_name`, `trade_name`, `display_name`, `date_incorporation`, `date_commenced`, `business_constitution`, `nature_business`, `business_description`, `industry_sector`, `website`, `email`, `phone`, `employee_count`, `annual_turnover`, `expected_turnover`, `financial_year`, `accounting_start`, `currency`, `timezone`, `books_from_date`, `previous_software`
* **Taxation (PAN / TAN)**: `pan`, `pan_holder_name`, `pan_type`, `pan_verified`, `pan_doc_url`, `tan`, `tan_holder_name`, `tan_doc_url`, `tax_jurisdiction`, `assessing_officer`, `itr_filing_status`, `tax_audit_applicable`, `tax_regime`, `tds_applicable`, `tcs_applicable`
* **GST Profile**: `gstin`, `gst_status`, `gst_reg_date`, `gst_effective_date`, `updated_at`

### 3. `vouchers` (`Vouchers`)
* `id` (Integer, Primary Key)
* `voucher_type` (String: `"Sales"`, `"Purchase"`, `"Payment"`, `"Receipt"`, `"Journal"`, `"Debit Note"`, `"Credit Note"`)
* `date` (String)
* `voucher_no` (String, Unique, Index)
* `party` (String)
* `items` (`JSONB`, List of items with `item_name`, `qty`, `rate`)
* `amount` (Float, Net amount)
* `gst_amount` (Float, Total GST)
* `discount` (Float)
* `status` (String, default `"pending"`)
* `file_key` (String, S3 storage object path)
* `meta_type` (String, Optional voucher classification tag)
* `meta` (`JSONB`, Arbitrary voucher-specific structured fields e.g., GST breakdowns, TDS rates, IRN)

### 4. `pending_vouchers` (`PendingVouchers`)
* `id` (Integer, Primary Key)
* `voucher_type`, `date`, `voucher_no`, `party` (String, Nullable)
* `items` (`JSONB`, default `[]`)
* `amount`, `gst_amount`, `discount` (Float, default `0.0`)
* `file_key` (String, S3 file reference)
* `status` (String, default `"pending"`, `"accepted"`, `"rejected"`)

### 5. `bankStatements` (`BankStatements`)
* `id` (Integer, Primary Key)
* `bank_name`, `account_number`, `referrence_no`, `transaction_date`, `description`, `transaction_type` (String)
* `amount` (Float)
* `category` (String, default `"Miscellaneous"`)
* `reconciliation_status` (String, default `"Pending"`)
* `party_name`, `voucher_ref` (String, Unique)

### 6. `BRS` (`BRS`)
* `id` (Integer, Primary Key)
* `transaction_id` (String)
* `voucher_no`, `description` (String)
* `amount`, `gst_amount`, `statement_amount` (Float)

### 7. `godown` (`godown`)
* `id` (Integer, Primary Key)
* `godown_name` (String)
* `location` (String)
* `items` (`JSONB`, List of items and quantities stored in this godown)

### 8. `units` (`units`)
* `id` (Integer, Primary Key)
* `symbol` (String, Unique e.g. `"kg"`, `"pcs"`)
* `name` (String e.g. `"Kilogram"`)
* `conversion` (`JSONB`, Unit conversions mapping)
* `decimals` (Integer)
* `type` (String)
* `used` (Integer, Usage counter)

### 9. `stock` (`stock`)
* `id` (Integer, Primary Key)
* `item` (String)
* `quantity` (Float)
* `unit` (String)
* `rate` (Float)
* `godowns` (`JSONB`, Quantities mapped per godown)
* `gst_rate` (Float)
* `hsn_code` (Integer)

### 10. `notification_logs` (`notificationLogs`)
* `id` (Integer, Primary Key)
* `detail` (String)
* `created_at` (DateTime, default `now()`)

### 11. `whatsapp_accounts` (`WhatsAppAccount`)
* `id` (Integer, Primary Key)
* `wa_id` (String, Unique, Index e.g. `"919876543210"`)
* `user_id` (Integer, Nullable FK to `Users`)
* `mobile` (String, Nullable)
* `status` (String, default `"pending_link"` / `"active"`)
* `verified_at` (DateTime)
* `created_at` (DateTime)

---

## 4. Key Developments & Core Features

### 1. Intelligent AI Invoice & Document Extraction Pipeline
* **Multi-Engine Extraction**: Combines PDF direct text extraction (`PyMuPDF`), Tesseract OCR fallback for scanned images, and Google Gemini 1.5 (`langchain_google_genai` / `langgraph`).
* **Structured Parsing**: Transforms raw PDF/image content into standardized JSON schemas containing line items, HSN/SAC codes, CGST/SGST/IGST breakdown, reverse charges, party names, and payment metadata.
* **Pending Vouchers Queue**: Extracted documents enter a staging table (`pending_vouchers`) allowing human verification, edits, batch accepting, or rejection before mutating financial ledgers.

### 2. Dual Architecture (Monolith + Microservices v2)
* **Monolithic Core**: Handles interactive web requests, PDF report rendering, WhatsApp webhooks, and direct DB operations.
* **v2 Microservices**: Scalable asynchronous architecture using Kafka topics (`doc-submit`, `extract-web`, `extract-whatsapp`), S3 pre-signed upload URLs, background Python workers for AI OCR, and Go SSE endpoints for instant frontend updates.

### 3. Automated Inventory & Godown (Warehouse) Synchronization
* **Stock Tracking**: Tracks item quantities, base rates, GST rates, HSN codes, and unit types across multiple warehouses (`godown`).
* **Voucher Stock Sync**: Endpoint `/sync-invoice-stock` automatically deducts or credits item balances across linked Godowns when vouchers are finalized or reverted.

### 4. Bank Statement Reconciliation (BRS)
* Imports electronic bank statement lines and links them against voucher numbers.
* Automatically updates reconciliation status (`Pending` -> `Reconciled`) and maintains audit logs in the `BRS` table.

### 5. Multi-Voucher PDF & Report Generation System
* **ReportLab Document Engine**: Dynamically generates print-ready PDF invoices for Sales, Purchases, Receipts, Payments, and Journal vouchers.
* **Business Reports**: Automates PDF and text digest generation for **Inventory Valuation**, **Bank Reconciliation**, and **Executive Financial Summaries** over configurable time periods (Daily, Monthly, Quarterly, Yearly).

### 6. Conversational WhatsApp Integration Bot
* **Meta Cloud API Webhook**: Direct Webhook listener with verification challenge and event dispatcher.
* **Stateful Flow Engine**: Interactive WhatsApp bot supporting menu navigation, document upload ingestion, link code verification, session resets, and live invoice query status.
* **Twilio Webhook Support**: Alternative ingestion channel via Twilio WhatsApp media webhooks in `v2/uploadService`.

---

## 5. Backend API Endpoints (Complete Reference)

Below is the definitive reference for every single backend API endpoint in `backend/main.py` and `v2/`.

---

### A. Core System & System Health

#### `GET /`
* **Description**: Micro health check endpoint to confirm service availability.
* **Auth**: None
* **Request Parameters / Body**: None
* **Response**: `{"status": "Running"}`
* **Use Case**: Used by load balancers, container probes, and monitoring tools to check service liveness.

---

### B. Authentication & User Management

#### `POST /create`
* **Description**: Registers a new user, hashes the password using Argon2, creates a user record in `test` table, generates a 6-digit OTP stored in Redis, and sends an activation email.
* **Auth**: None
* **Request Body** (`CreateSchema`):
  ```json
  {
    "email": "user@example.com",
    "full_name": "John Doe",
    "mobile": "+919876543210",
    "password": "SecurePassword123"
  }
  ```
* **Response**: `{"message": "otp sent successfully"}`
* **Database / Cache Ops**:
  * Inserts record into `test` table with `isactive=False`.
  * Sets Redis key `verify_otp:<email>` with 600s TTL containing SHA-256 hashed OTP.
* **Use Case**: User account signup initialization.

#### `POST /verify`
* **Description**: Verifies the OTP sent during user registration. If valid, activates the account.
* **Auth**: None
* **Request Body** (`EmailSchema`):
  ```json
  {
    "email": "user@example.com",
    "otp": "123456"
  }
  ```
* **Response**: `{"message": "proceed to login"}`
* **Database / Cache Ops**:
  * Reads `verify_otp:<email>` from Redis.
  * Updates `test` table setting `isactive=True`.
* **Use Case**: OTP confirmation step required before login.

#### `POST /login`
* **Description**: Authenticates active user credentials against stored Argon2 hashes. Returns an HTTP-Only secure session token cookie.
* **Auth**: None
* **Request Body** (`LoginSchema`):
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123"
  }
  ```
* **Response**: Sets `session_token` cookie (JWT valid for 7 days) and returns:
  ```json
  {
    "message": "logged in successfully",
    "user": { "email": "user@example.com", "full_name": "John Doe" }
  }
  ```
* **Database Ops**: Queries `test` table for active user record and verifies password hash using `argon2.PasswordHasher`.
* **Use Case**: User authentication and session creation.

---

### C. Onboarding & Business Profiles

#### `GET /onboarding/status`
* **Description**: Fetches the onboarding completion state and business profile details for the authenticated user.
* **Auth**: Session Cookie
* **Response**:
  ```json
  {
    "onboarding_complete": false,
    "user_id": 1,
    "profile": { ... }
  }
  ```
* **Database Ops**: Reads `test` table and joins with `business_profiles`.
* **Use Case**: Dashboard gatekeeping to check if user needs to complete setup.

#### `POST /onboarding/complete`
* **Description**: Saves or updates the business entity profile, PAN/TAN info, GSTIN, financial year settings, and updates user's onboarding status.
* **Auth**: Session Cookie
* **Request Body** (`BusinessProfileSchema`): Complete business metadata including `entity_type`, `legal_name`, `gstin`, `pan`, `trade_name`, `annual_turnover`, etc.
* **Response**: `{"message": "Onboarding completed successfully"}`
* **Database Ops**: Upserts `business_profiles` table and updates `test.onboarding_complete = True`.
* **Use Case**: Business profile wizard submission.

#### `GET /profile/details`
* **Description**: Retrieves full profile attributes for both the individual user and their registered business.
* **Auth**: Session Cookie
* **Response**: Combined JSON object containing `user` details and `business_profile`.
* **Database Ops**: Queries `test` and `business_profiles` by `user_id`.
* **Use Case**: User Settings & Profile View page.

---

### D. File Ingestion, Extraction & S3 Operations

#### `POST /upload`
* **Description**: Uploads a local document file directly to the backend storage directory (`backend/Invoices/`).
* **Auth**: None / Session
* **Request Payload**: Multipart Form Data (`file: UploadFile`)
* **Response**:
  ```json
  {
    "filename": "invoice_101.pdf",
    "saved_path": "backend/Invoices/invoice_101.pdf"
  }
  ```
* **Use Case**: Local document upload for immediate server processing.

#### `POST /extract`
* **Description**: Extracts structured voucher information from uploaded files using Gemini LLM AI and PyMuPDF text parsing.
* **Auth**: None / Session
* **Request Body** (`ExtractSchema`):
  ```json
  {
    "file_type": ["pdf"],
    "file_keys": ["invoice_101.pdf"]
  }
  ```
* **Response**:
  ```json
  {
    "message": "extraction successful",
    "extracted_data": [ ... ]
  }
  ```
* **Use Case**: Triggering AI extraction on selected invoices.

#### `POST /clear-extractions`
* **Description**: Clears temporary extraction caches or intermediate state.
* **Auth**: None
* **Response**: `{"message": "extractions cleared"}`
* **Use Case**: Session reset during document review.

#### `POST /extract-OCR`
* **Description**: Runs Tesseract OCR on scanned documents/images where native text extraction fails.
* **Auth**: None
* **Request Body**: `ExtractSchema`
* **Response**: JSON containing OCR text extraction result.
* **Use Case**: Fallback OCR engine for legacy scanned documents.

#### `POST /upload-to-AWS`
* **Description**: Uploads a local file to AWS S3 bucket and returns the generated S3 Key.
* **Auth**: None
* **Request Payload**: Multipart Form Data (`file: UploadFile`)
* **Response**:
  ```json
  {
    "message": "successfully uploaded to AWS S3",
    "file_key": "invoices/2026/09/uuid_invoice.pdf"
  }
  ```
* **Use Case**: Syncing local files to long-term S3 storage.

#### `GET /get-presigned-url`
* **Description**: Generates an AWS S3 Pre-signed URL for direct browser uploads to S3.
* **Auth**: None
* **Query Parameters**: `file_name` (string), `content_type` (string, default `"application/pdf"`)
* **Response**: `{"presigned_url": "https://s3.amazonaws.com/...", "file_key": "..."}`
* **Use Case**: Secure client-side uploads directly to S3 without overloading app server.

#### `GET /get-file`
* **Description**: Downloads or streams a stored file from AWS S3 using its `file_key`.
* **Auth**: None
* **Query Parameters**: `file_key` (string)
* **Response**: Binary stream of the file content (`application/pdf`, `image/jpeg`, etc.)
* **Use Case**: Viewing stored invoice PDFs or generated reports in the browser.

---

### E. Voucher Management

#### `POST /add-voucher`
* **Description**: Creates a new financial voucher directly in the database.
* **Auth**: None
* **Request Body** (`VoucherSchema`): `voucher_type`, `date`, `voucher_no`, `party`, `items`, `amount`, `gst_amount`, `discount`, `status`, `meta_type`, `meta`.
* **Response**: `{"message": "Voucher added successfully", "voucher_id": 12}`
* **Database Ops**: Inserts row into `vouchers` table.
* **Use Case**: Manual voucher creation from UI forms.

#### `GET /vouchers`
* **Description**: Lists all recorded vouchers, optionally filtered by type or party.
* **Auth**: None
* **Query Parameters**: `voucher_type` (optional), `party` (optional)
* **Response**: List of voucher objects.
* **Database Ops**: Queries `vouchers` table.
* **Use Case**: Primary Voucher Register & Ledger View.

#### `GET /vouchers/{voucher_id}`
* **Description**: Retrieves detailed information for a single voucher by its primary ID.
* **Auth**: None
* **Path Parameter**: `voucher_id` (int)
* **Response**: Single voucher record JSON.
* **Database Ops**: `db.query(Vouchers).filter(Vouchers.id == voucher_id).first()`
* **Use Case**: Detailed voucher view modal.

#### `PUT /vouchers/{voucher_id}`
* **Description**: Updates an existing voucher's details.
* **Auth**: None
* **Path Parameter**: `voucher_id` (int)
* **Request Body**: `VoucherSchema`
* **Response**: `{"message": "Voucher updated successfully"}`
* **Database Ops**: Updates `vouchers` table record.
* **Use Case**: Editing voucher information.

#### `DELETE /vouchers/{voucher_id}`
* **Description**: Permanently deletes a voucher from the database.
* **Auth**: None
* **Path Parameter**: `voucher_id` (int)
* **Response**: `{"message": "Voucher deleted successfully"}`
* **Database Ops**: Removes record from `vouchers` table.
* **Use Case**: Voucher removal.

---

### F. Pending Vouchers Review Pipeline

#### `POST /pending-vouchers`
* **Description**: Adds an AI-extracted invoice into the staging queue for review.
* **Auth**: None
* **Request Body** (`PendingVoucherInputSchema`)
* **Response**: `{"message": "Added to pending vouchers", "id": 5}`
* **Database Ops**: Inserts into `pending_vouchers` with status `"pending"`.
* **Use Case**: Staging extracted documents before final ledger posting.

#### `GET /pending-vouchers`
* **Description**: Lists all documents currently in the pending review pipeline.
* **Auth**: None
* **Response**: Array of pending voucher objects.
* **Use Case**: Review Inbox for accounting team.

#### `GET /pending-vouchers/stats`
* **Description**: Provides aggregate statistics for the review queue.
* **Auth**: None
* **Response**: `{"total": 20, "pending": 15, "accepted": 4, "rejected": 1}`
* **Use Case**: Dashboard summary widgets.

#### `POST /pending-vouchers/{item_id}/accept`
* **Description**: Approves a pending voucher, transfers it to the official `vouchers` table, and sets status to `"accepted"`.
* **Auth**: None
* **Path Parameter**: `item_id` (int)
* **Response**: `{"message": "Pending voucher accepted and created as official voucher", "voucher_id": 42}`
* **Database Ops**: Atomic transaction that reads `pending_vouchers`, creates a `Vouchers` entry, and updates `pending_vouchers.status = "accepted"`.
* **Use Case**: Staging review approval.

#### `POST /pending-vouchers/{item_id}/reject`
* **Description**: Rejects a pending voucher and marks it as `"rejected"`.
* **Auth**: None
* **Path Parameter**: `item_id` (int)
* **Response**: `{"message": "Pending voucher rejected"}`
* **Database Ops**: Updates `pending_vouchers.status = "rejected"`.
* **Use Case**: Rejecting invalid/duplicate documents.

---

### G. Bank Statements & Reconciliation (BRS)

#### `POST /bank-statements`
* **Description**: Uploads/Records a bank statement transaction line.
* **Auth**: None
* **Request Body** (`BankStatementInputSchema`)
* **Response**: `{"message": "Bank statement added", "id": 8}`
* **Database Ops**: Inserts record into `bankStatements`.
* **Use Case**: Importing electronic bank transactions.

#### `GET /bank-statements`
* **Description**: Retrieves all bank statements.
* **Response**: Array of bank statement objects.
* **Use Case**: Viewing bank statement history.

#### `GET /bank-statements/{bs_id}`
* **Description**: Fetches single bank statement record by ID.
* **Use Case**: Statement detail inspector.

#### `PUT /bank-statements/{bs_id}`
* **Description**: Updates bank statement details or reconciliation status.
* **Use Case**: Categorizing bank transactions.

#### `DELETE /bank-statements/{bs_id}`
* **Description**: Deletes a bank statement line.
* **Use Case**: Removing duplicate bank statement entries.

#### `POST /BRS`
* **Description**: Creates a Bank Reconciliation Statement entry matching a bank statement transaction against a voucher number.
* **Auth**: None
* **Request Body** (`BRSInputSchema`): `transaction_id`, `voucher_no`, `description`, `amount`, `gst_amount`
* **Response**: `{"message": "BRS record created successfully"}`
* **Database Ops**: Inserts into `BRS` table and marks target bank statement `reconciliation_status = "Reconciled"`.
* **Use Case**: Bank reconciliation matching.

#### `GET /BRS`
* **Description**: Returns all BRS reconciliation records.
* **Use Case**: Viewing bank reconciliation reports.

#### `DELETE /BRS/{brs_id}`
* **Description**: Removes a BRS record and resets bank statement status to `"Pending"`.
* **Use Case**: Unlinking incorrect reconciliation matches.

---

### H. Inventory, Godowns & Stock Management

#### `POST /godown`
* **Description**: Registers a new godown (warehouse) location.
* **Auth**: None
* **Request Body** (`GodownSchema`): `godown_name`, `location`, `items`
* **Response**: `{"message": "Godown added successfully"}`
* **Database Ops**: Inserts into `godown` table.
* **Use Case**: Multi-warehouse setup.

#### `GET /godown`
* **Description**: Lists all registered godowns and their contents.
* **Response**: List of godown objects.
* **Use Case**: Inventory location overview.

#### `GET /godown/{godown_name}`
* **Description**: Retrieves specific godown details by name.
* **Use Case**: Warehouse inventory check.

#### `PUT /godown/{godown_name}`
* **Description**: Updates godown location or inventory item list.
* **Use Case**: Transferring items between godowns.

#### `DELETE /godown/{godown_name}`
* **Description**: Removes a godown location.
* **Use Case**: Warehouse decommissioning.

#### `POST /units` / `GET /units` / `GET /units/{unit_symbol}` / `DELETE /units/{unit_symbol}`
* **Description**: CRUD endpoints for measurement units (e.g., `kg`, `pcs`, `ltr`, `box`) including conversion rules and decimal precision settings.
* **Database Ops**: Manages `units` table records.
* **Use Case**: Unit conversion and master definitions.

#### `POST /stock` / `GET /stock` / `PUT /stock/{item_name}` / `DELETE /stock/{item_name}`
* **Description**: Master stock inventory management endpoints. Manages stock item rates, HSN codes, GST rates, unit types, and quantity allocation per godown.
* **Database Ops**: Manages `stock` table records.
* **Use Case**: Master item inventory control.

#### `POST /sync-invoice-stock`
* **Description**: Synchronizes stock levels automatically when an invoice is processed or reverted. Deducts/credits quantities from both master `stock` table and target `godown` items list.
* **Auth**: None
* **Request Body** (`InvoiceSyncSchema`):
  ```json
  {
    "items": [
      { "item_name": "Steel Rods", "qty": 50, "godown": "Main Warehouse" }
    ],
    "revert": false
  }
  ```
* **Response**: `{"message": "Inventory synced successfully", "warnings": []}`
* **Database Ops**: Transactional updates across `stock` and `godown` tables.
* **Use Case**: Automatic inventory sync on sales/purchase invoice completion.

---

### I. PDF Generation & Automated Reports

#### `POST /generate-invoice`
* **Description**: Generates a professional, formatted PDF document using ReportLab based on voucher data and metadata. Supports Sales Invoices, Purchase Orders, Receipts, Payments, and Journal Vouchers.
* **Auth**: None
* **Request Body** (`InvoiceGenerationSchema`): Includes `voucher_type`, `invoice_no`, `issued_to`, `items`, `payment_details`, `meta`.
* **Response**: `{"message": "Invoice PDF generated", "file_key": "generated_invoice_101.pdf", "download_url": "/get-file?file_key=generated_invoice_101.pdf"}`
* **Use Case**: Printing or downloading customer invoices and vouchers.

#### `POST /reports/generate`
* **Description**: Generates comprehensive PDF reports and text summaries for business operations.
* **Auth**: None
* **Request Body** (`ReportGenerateSchema`):
  ```json
  {
    "user_id": 1,
    "report_type": "Inventory", // "Inventory" | "Reconciliation" | "Summary"
    "period": "Monthly"          // "Daily" | "Monthly" | "Quarterly" | "Yearly"
  }
  ```
* **Response**:
  ```json
  {
    "report_type": "Inventory",
    "period": "Monthly",
    "text_digest": "Inventory Summary Digest...",
    "file_name": "inventory_report_monthly.pdf",
    "download_url": "/get-file?file_key=inventory_report_monthly.pdf"
  }
  ```
* **Database Ops**: Queries `stock`, `BRS`, `vouchers`, and compiles calculations into PDF via ReportLab.
* **Use Case**: Period-end financial reporting and auditing.

---

### J. WhatsApp Cloud API & Webhook Integration

#### `GET /webhook/whatsapp`
* **Description**: Direct WhatsApp Cloud API Webhook Verification Endpoint.
* **Query Parameters**: `hub.mode`, `hub.verify_token`, `hub.challenge`
* **Response**: Plain text challenge response if verification succeeds.
* **Use Case**: WhatsApp Cloud API webhook configuration.

#### `POST /webhook/whatsapp`
* **Description**: Receives inbound WhatsApp messages, media files (PDF/images), and interactive button responses. Triggers the stateful conversational bot engine (`process_whatsapp_event`).
* **Request Body**: Meta WhatsApp Webhook JSON Payload
* **Response**: `{"status": "success", "processed_events": 1}`
* **Use Case**: Conversational accounting bot and mobile invoice uploading via WhatsApp.

#### `POST /whatsapp/session/reset`
* **Description**: Force-resets a WhatsApp conversation state machine back to the `MAIN_MENU` for a given WhatsApp phone ID (`wa_id`).
* **Request Body**: `{"wa_id": "919876543210"}`
* **Use Case**: Internal reset for stuck conversation sessions.

#### `POST /invoices/ingest`
* **Description**: Direct API endpoint to push an invoice received from WhatsApp into the processing queue.
* **Request Body** (`WhatsAppIngestInvoiceSchema`)
* **Response**: `{"message": "Invoice ingested successfully", "pending_voucher_id": 15}`
* **Use Case**: Mobile upload ingestion pipeline.

#### `GET /invoices/batch-status/{batch_id}`
* **Description**: Aggregates batch processing results for multiple documents uploaded in a single session.
* **Path Parameter**: `batch_id` (string)
* **Response**: Summary count of total, processed, pending, and rejected items.
* **Use Case**: Real-time batch upload status updates on mobile.

#### `GET /whatsapp/accounts/{wa_id}` & `POST /whatsapp/accounts/link`
* **Description**: Manages linking between WhatsApp Phone Numbers (`wa_id`) and VyomPlus user accounts (`user_id`).
* **Database Ops**: Manages `whatsapp_accounts` table.
* **Use Case**: Account activation and authentication for WhatsApp users.

---

### K. Microservices `v2/` Endpoints

#### Auth Microservice (`v2/authService/main.py`)
* `GET /dbcheck` - Verifies DB connectivity (`SELECT 1`).
* `GET /redischeck` - Ping check for Redis server.
* `POST /createusers` - Creates user record, generates Redis OTP, sends verification email.
* `POST /verify` - Validates OTP from Redis and activates user account.
* `POST /login` - Password verification with Argon2, issues HTTP-Only JWT session token cookie.
* `GET /profile` - Decodes JWT cookie and returns user profile data.
* `GET /logout` - Revokes JWT cookie.

#### Upload Microservice (`v2/uploadService/main.py`)
* `POST /upload` - Generates AWS S3 pre-signed upload URL and pushes `doc-submit` event to Kafka.
* `POST /twilio/webhook` - Webhook for Twilio WhatsApp media ingestion. Downloads media, uploads to S3, and notifies Kafka worker.

#### Result Microservice (`v2/resultService/main.go`)
* `GET /events` - Server-Sent Events (SSE) endpoint streaming real-time Kafka extraction progress (`extract-web` topic) directly to the web client.

---

## 6. Frontend Architecture & Flow

```
+-----------------------------------------------------------------------------------+
|                            FRONTEND APP FLOW                                     |
|                                                                                   |
|  [ Login / Auth Page ] ---> [ Onboarding Wizard ] ---> [ Main Dashboard / Console ]
|         |                           |                             |               |
|         v                           v                             v               |
|   /login & /verify         /onboarding/complete           /vouchers, /stock       |
|                                                                   |               |
|                                                                   v               |
|                                                     [ Document Upload Hub ]       |
|                                                     (Web / Next.js / WhatsApp)    |
|                                                                   |               |
|                                                                   v               |
|                                                     [ AI Extraction Review ]      |
|                                                     (/pending-vouchers)           |
|                                                                   |               |
|                                                     +-------------+-------------+ |
|                                                     |                           | |
|                                                     v                           v |
|                                               [ ACCEPT ]                    [ REJECT ]
|                                                     |                             |
|                                                     v                             v
|                                           Promoted to Vouchers             Marked Rejected
|                                          & Synced to Inventory                            
+-----------------------------------------------------------------------------------+
```

1. **Auth & Onboarding Flow**:
   - `frontend/loginNAuth/`: Handles signup, email OTP validation, login cookie initialization.
   - `frontend/onboarding/`: Guides new businesses through filing GST, PAN, entity type, and accounting settings.

2. **Dashboard & Console**:
   - `frontend/console/`: Displays live sales metrics, voucher ledger, inventory godown balances, bank statement reconciliation tool, and PDF download buttons.

3. **Document Ingestion & AI Verification**:
   - `uploadfront/`: React 19 / Next.js 16 drag-and-drop dashboard supporting multi-file batch upload, presigned S3 uploading, live SSE status listener, line-item table editor, and one-click acceptance to `vouchers` and `stock`.

---

## 7. Deployment, Environment & Configuration

### Environment Variables (`backend/.env`)
* `DATABASE_URL`: PostgreSQL connection URI (`postgresql://user:pass@host:5432/dbname`)
* `JWT_SECRET`: Secret key for signing session tokens
* `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`: Redis connection settings
* `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_REGION`: AWS S3 configuration
* `GOOGLE_API_KEY`: API key for Gemini LLM model access
* `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`: WhatsApp Cloud API credentials
* `BOOTSTRAP_SERVER`: Apache Kafka bootstrap server address (e.g. `localhost:9092`)

### Containerization & Execution
* **Backend Dockerfile**: `backend/Dockerfile` exposes port `8000` running `uvicorn main:app --host 0.0.0.0 --port 8000`.
* **Microservices Dockerfiles**: Dockerfiles in `v2/authService`, `v2/uploadService`, and `v2/resultService`.
