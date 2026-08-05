# Kevalon ERP - Backend API (Module 1: Auth | Module 2: Company, Branch & FY)

This repository contains the backend REST API for **Kevalon Accounting ERP** — a multi-company, multi-branch accounting/CRM/ERP system.

It is built with Node.js, Express, MongoDB (Mongoose), and includes security features such as multi-device sessions, refresh token rotation with reuse detection, account lockouts on brute-force attempts, and OTP-based two-factor authentication (2FA).

## Features Implemented
1. **User Registration:** Duplication prevention, bcrypt hashing (12 salt rounds). Automatically sends an email-verification link on registration.
2. **User Login:** Account locking for 15 minutes after 5 failed login attempts. Returns JWT access + refresh tokens.
3. **MFA / 2FA support:** Intercepts login if 2FA is active, triggers 6-digit cryptographically secure OTP emails, verifies code, and logs in.
4. **Token Rotation & Reuse Detection:** Rotates both access and refresh tokens. Automatically detects if an old/rotated refresh token is reused, and revokes all active sessions for security.
5. **Multi-device Logout:** Allows logging out of one session (invalidates specific refresh token) without disrupting logins on other devices.
6. **Password Reset:** Secure 15-minute token hashes stored in the DB, emailed out, and force-revokes all device sessions on successful reset.
7. **OTP 2FA:** 6-digit cryptographically secure code, 5-minute expiry, max 3 attempts, 60-second send cooldown.
8. **Rate Limiting & Security Headers:** `express-rate-limit` (10 reqs/15m on sensitive endpoints) and `helmet` headers.
9. **Structured Logging:** `pino` with `pino-pretty` in development.
10. **Email Verification *(PRD requirement)*:** Registration generates a 24-hour verification token (SHA-256 hash stored in DB). `/verify-email` confirms and flags the account. `/resend-verification-email` issues a replacement token (60-second cooldown, anti-enumeration).
11. **Device Session Management *(PRD requirement)*:** `GET /sessions` lists all active sessions with device metadata (userAgent, IP, createdAt, lastUsedAt, expiresAt). `DELETE /sessions/:id` immediately revokes any session by its subdocument `_id`; the next `/refresh-token` call with that token returns `401`.
12. **Company Management *(Module 2)*:** Create, read, and update company profiles. GSTIN and PAN validated with Indian format regex. Uniqueness enforced at DB level.
13. **Branch Management *(Module 2)*:** Add, update, list, and delete branches. First branch is automatically set as Head Office. Head Office transfer is enforced. Branches with active transactions cannot be deleted.
14. **Financial Year Management *(Module 2)*:** Create and list financial years. Overlap check prevents conflicting date ranges for the same company. Financial years can be locked to block future transaction postings.
15. **Multi-Tenant Data Isolation *(Module 2)*:** Company-level access control on all Module 2 endpoints. Users can only access data belonging to their own company (`403 Forbidden` on cross-company access attempts).

---

## Tech Stack
- **Runtime:** Node.js (LTS)
- **Framework:** Express.js
- **Database/ODM:** MongoDB + Mongoose
- **Encryption/Tokens:** bcryptjs, jsonwebtoken, crypto (SHA-256)
- **Validation:** Zod
- **Testing:** Jest, Supertest, mongodb-memory-server

---

## Setup & Installation

### Prerequisites
- Node.js (LTS version recommended)
- MongoDB instance (running locally or on MongoDB Atlas). *Note: Automated tests run on an in-memory database and do not require MongoDB to be running.*

### Install Dependencies
Navigate into the `server` directory and install the packages:
```bash
cd server
npm install
```

### Configuration
Create a `.env` file from the example template:
```bash
cp .env.example .env
```
Fill in the environment variables:
- `PORT`: Server port (defaults to `3000`)
- `MONGO_URI`: Connection string (e.g. `mongodb://127.0.0.1:27017/kevalon-auth`)
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`: Secure strings for token signing (min 8 chars)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: SMTP configuration for OTPs, password-reset links, and **email-verification links**.
  *If SMTP credentials are left blank, all emails (OTPs, reset links, verification links) are printed directly to the console server logs for local testing.*
- `ALLOWED_ORIGINS`: Comma-separated list of origins allowed by CORS
- `CLIENT_URL`: Base URL for building verification and reset links (e.g. `https://app.kevalon.com`)

---

## Running the Server

### Development Mode (with hot-reload and pretty formatting logs)
```bash
npm run dev
```

### Production Mode
```bash
npm run start
```

---

## Running Automated Tests
```bash
npm run test
```
Tests use `mongodb-memory-server` — no external DB required.  
**Current status: 92/92 tests passing** (Module 1: 16, Module 2: 23, Module 3: 19, Module 4: 18, Module 5: 16)

---

## Module 1: Auth API Endpoints
All endpoints have the base path `/api/auth`. Use [auth_endpoints.http](file:///c:/Users/LENOVO/Desktop/KT-CRM/server/auth_endpoints.http) with the VS Code REST Client extension to test interactively.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/register` | No | Register a user, triggers verification email |
| POST | `/api/auth/login` | No | Authenticate & get tokens (or 2FA prompt) |
| POST | `/api/auth/refresh-token` | No | Rotate access + refresh tokens |
| POST | `/api/auth/logout` | Yes | Invalidate the current session token |
| GET | `/api/auth/me` | Yes | Retrieve logged-in user profile |
| POST | `/api/auth/forgot-password` | No | Send password-reset token link |
| POST | `/api/auth/reset-password` | No | Complete password update, force-logout all sessions |
| POST | `/api/auth/send-otp` | No | Dispatch a 6-digit OTP code to email |
| POST | `/api/auth/verify-otp` | No | Validate OTP (login or 2FA setup) |
| POST | `/api/auth/verify-email` | No | Confirm email address via emailed token |
| POST | `/api/auth/resend-verification-email` | No | Resend verification link (60s cooldown, anti-enumeration) |
| GET | `/api/auth/sessions` | Yes | List all active device sessions |
| DELETE | `/api/auth/sessions/:id` | Yes | Revoke a specific session (remote logout) |

---

## Module 2: Company, Branch & Financial Year API Endpoints
Import [kevalon_module2.postman_collection.json](file:///c:/Users/LENOVO/Desktop/KT-CRM/server/kevalon_module2.postman_collection.json) into Postman for interactive testing.

### Company (`/api/company`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/company` | Yes | Create a new company profile |
| GET | `/api/company/:id` | Yes | Fetch company details |
| PUT | `/api/company/:id` | Yes | Update company profile |

### Branch (`/api/branch`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/branch` | Yes | Add a new branch (first branch auto-set as Head Office) |
| GET | `/api/branch?companyId=` | Yes | List all branches of a company |
| PUT | `/api/branch/:id` | Yes | Update branch details |
| DELETE | `/api/branch/:id` | Yes | Remove a branch (blocked if Head Office or has transactions) |

### Financial Year (`/api/financial-year`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/financial-year` | Yes | Create a new financial year (overlap check enforced) |
| GET | `/api/financial-year?companyId=` | Yes | List all financial years for a company |
| PUT | `/api/financial-year/:id/lock` | Yes | Lock a financial year to close it |

### Business Rules Enforced
- **GSTIN format:** `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`
- **PAN format:** `^[A-Z]{5}[0-9]{4}[A-Z]{1}$`
- **Head Office:** Every company must have exactly one Head Office branch. First branch is auto-assigned. Status transfer enforced on update.
- **Branch Delete Guard:** Cannot delete Head Office. Cannot delete branches with associated transactions (future-proof via dynamic model check).
- **FY Overlap:** Overlapping date ranges for the same company return `409 Conflict`.
- **FY Lock:** Locked financial years cannot be re-locked. `isLocked`, `lockedAt`, and `lockedBy` are stamped on lock.
- **Data Isolation:** All Module 2 endpoints enforce company-level access control — cross-company access returns `403 Forbidden`.

---

## Module 3: Chart of Accounts (COA) API Endpoints
All endpoints have the base path `/api/coa`. Use [coa_endpoints.http](file:///c:/Users/LENOVO/Desktop/KT-CRM/server/coa_endpoints.http) with the VS Code REST Client extension to test interactively.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/coa` | Yes | Create a custom account (group or ledger) |
| GET | `/api/coa?companyId=` | Yes | List all accounts for a company (flat or tree structure) |
| GET | `/api/coa/:id` | Yes | Get single account details (with calculated `currentBalance`) |
| PUT | `/api/coa/:id` | Yes | Update an account (name, parentId, code, isActive) |
| DELETE | `/api/coa/:id` | Yes | Delete an account (soft delete, only if unused) |
| POST | `/api/coa/seed-default` | Yes | Seed the standard default COA for a new company |

### Business Rules Enforced
- **Account Type Blocks & Generation:** Custom accounts auto-generate a code if omitted, selecting the next number in the type block:
  - Assets: `1000`–`1999`
  - Liabilities: `2000`–`2999`
  - Equity: `3000`–`3999`
  - Income: `4000`–`4999`
  - Expenses: `5000`–`5999`
- **Validation Rules:**
  - A ledger account (`isGroup: false`) can never be a parent.
  - Parent and child must share the same `type` (e.g. Asset under Asset).
  - Account codes must be unique within the company.
- **System Account Guards:** Accounts flagged with `isSystemAccount: true` can never be deleted or renamed, and their codes or parentIds cannot be changed. Only `isActive` status can be toggled.
- **Delete Guards:** Reject deleting a group account if it contains child accounts. Reject deleting an account if it contains associated transactions.
- **Soft Delete:** Successful deletes are performed as soft deletes (`isActive = false`) to ensure historical references never dangle.
- **Multi-Tenant Scoping:** All write and read routes validate `companyId` scoping. Cross-company access is blocked with a `403 Forbidden` response.

### Future Integration Points (Module 12/13 TODOs)
To cleanly connect later ledger and transaction postings modules, the following placeholders are wired in `server/src/services/coa.service.js`:
1. `getAccountBalance(accountId)`: Returns the account's static `openingBalance`.
   * **TODO for Module 12 (Journal Entry) & Module 13 (Ledger):** Sum posted journal lines matching this `accountId` to compute the real-time balance.
2. `hasTransactions(accountId)`: Returns `false`.
   * **TODO for Module 12 (Journal Entry) & Module 13 (Ledger):** Query transaction ledger lines referencing this `accountId` to block deleting accounts with postings.

---

## Module 4: Bank & Cash Accounts API Endpoints
All endpoints have the base path `/api/bank-account`. Use [bankAccount_endpoints.http](file:///c:/Users/LENOVO/Desktop/KT-CRM/server/bankAccount_endpoints.http) with the VS Code REST Client extension to test interactively.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/bank-account` | Yes | Create a new bank/cash/wallet/card account |
| GET | `/api/bank-account?companyId=` | Yes | List all accounts for a company (masked numbers) |
| GET | `/api/bank-account/:id` | Yes | Get detailed view of single account (unmasked number + balance) |
| PUT | `/api/bank-account/:id` | Yes | Update account details (name, bankName, active, etc.) |
| GET | `/api/bank-account/:id/ledger` | Yes | Retrieve ledger/transaction history for account |
| POST | `/api/bank-account/:id/reconcile` | Yes | Reconcile bank statement lines against ledger |

### Business Rules Enforced
- **Auto-Linked COA Ledger Account:** Every bank/cash/wallet/card account must have exactly one corresponding ledger account in the Chart of Accounts (COA). Creating a bank account automatically creates this linked ledger account.
  - `Cash` and `Wallet` types are linked under the seeded **"Current Assets"** group (code `1200`).
  - `Savings`, `Current`, `CreditCard`, and `UPI` types are linked under the seeded **"Bank Accounts"** group (code `1220`).
- **Data Isolation:** All read and write operations are scoped by `companyId` using company access middleware.
- **Conditional Field Validation:** Enforced via Zod validation schemas:
  - `Savings` / `Current` require: `bankName`, `accountNumber`, and `ifscCode`.
  - `CreditCard` requires: `bankName` and `accountNumber`.
  - `Cash` / `Wallet` / `UPI` do not require any banking details.
- **Security & Account Number Masking:** The `accountNumber` is never returned in list responses (masked e.g. `"••••4821"`). It is defined as `select: false` on the Mongoose model schema and is only fetched and returned unmasked in the detail view.
- **Immutable Fields:** After creation, `accountType`, `accountNumber`, and `coaAccountId` are immutable. Attempts to edit them return `400 Bad Request`.
- **Syncing updates:** Updating the `accountName` or `isActive` status of a bank account automatically updates the corresponding linked COA ledger account.

### Future Integration Points (Module 12/13 TODOs)
To connect later ledger and statement reconciliation modules, the following placeholders are wired in `server/src/services/bankAccount.service.js`:
1. `getAccountBalance(coaAccountId)`:
   * **TODO for Module 12 & 13:** Sum posted journal lines matching the linked `coaAccountId` to compute the real-time balance.
2. `getAccountLedger(coaAccountId, { from, to })`:
   * **TODO for Module 13:** Fetch historical posted transactions for this ledger ID.
3. `attemptAutoMatch(coaAccountId, statementLines)`:
   * **TODO for Module 13:** Automatically match each uploaded statement line against this account's ledger entries with identical amounts, types (credit/debit), and dates within ±3 days. Currently returns all lines as `unmatched` until real ledger entries exist.

---

## Module 5: Customer API Endpoints
All endpoints have the base path `/api/customer`. Use [customer_endpoints.http](file:///c:/Users/LENOVO/Desktop/KT-CRM/server/customer_endpoints.http) with the VS Code REST Client extension to test interactively.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/customer` | Yes | Create a new customer (auto-creates linked Sundry Debtors ledger) |
| GET | `/api/customer?companyId=` | Yes | List/search customers (paginated) |
| GET | `/api/customer/:id` | Yes | Get single customer detail (with `currentBalance`) |
| PUT | `/api/customer/:id` | Yes | Update customer (re-validates GSTIN, blocks `coaAccountId`) |
| DELETE | `/api/customer/:id` | Yes | Deactivate customer (soft delete only) |
| GET | `/api/customer/:id/ledger` | Yes | Customer ledger + outstanding balance |
| GET | `/api/customer/:id/invoices` | Yes | Customer invoices (placeholder) |

### Business Rules Enforced
- **Auto-Linked COA Ledger Account:** Every customer is automatically linked to a new ledger account created under the seeded **"Sundry Debtors"** group (code `1230`). If the default COA hasn't been seeded, returns `409 Conflict`.
- **GSTIN Validation:** Indian standard regex validated on create and update. Duplicate active GSTINs within the same company are rejected with `409 Conflict`. Same GSTIN across different companies is allowed.
- **Data Isolation:** All operations are scoped by `companyId`. Cross-company access returns `403 Forbidden`.
- **Immutable COA Link:** `coaAccountId` cannot be changed after creation.
- **Soft Delete Only:** Delete always sets `isActive: false` (never removes the document). The linked COA ledger account is also deactivated.
- **Name/Active Sync:** Updating customer `name` or `isActive` automatically syncs those changes to the linked COA account.
- **Pagination:** List endpoint supports `page`, `limit`, `search` (regex on name/phone/gstin), and `includeInactive` query params.

### Future Integration Points (Module 8/9/25 TODOs)
The following placeholders are wired in `server/src/services/customer.service.js`:
1. `validateGstin(gstin)`: Validates format only via regex.
   * **TODO for Module 25 (GST & Tax Master):** Replace with a real GST checksum validation call to `/api/gst/validate-gstin`.
2. `hasTransactions(customerId)`: Returns `false`.
   * **TODO for Module 8 (Sales Invoice) & Module 9 (Payment):** Query linked invoices and payments to block hard-deleting customers with history.
3. `GET /api/customer/:id/invoices`: Returns `[]`.
   * **TODO for Module 8 (Sales Invoice):** Wire to the `Invoice` collection once it exists.
