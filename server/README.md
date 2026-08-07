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
**Current status: 137/137 tests passing** (Module 1: 16, Module 2: 23, Module 3: 19, Module 4: 18, Module 5: 16, Module 23: 17, Module 16: 15, Module 25: 13)

---

## Module 08: Sales Invoice API Endpoints
All endpoints have the base path `/api/invoice`. Use [invoice_endpoints.http](file:///c:/Users/LENOVO/Desktop/KT-CRM/server/invoice_endpoints.http) with the VS Code REST Client extension to test interactively.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/invoice` | Yes | Create a sales invoice and auto-post a journal entry |
| GET | `/api/invoice?companyId=` | Yes | List invoices with optional status/date/search filters |
| GET | `/api/invoice/:id` | Yes | Fetch a single invoice detail |
| PUT | `/api/invoice/:id` | Yes | Update an unpaid invoice |
| DELETE | `/api/invoice/:id` | Yes | Cancel an invoice and create a reversal journal entry |
| GET | `/api/invoice/:id/pdf` | Yes | Placeholder PDF export endpoint |

### Business Rules Enforced
- **AR Billing + Journal Entry:** Invoices are posted as receivables and automatically generate a double-entry journal posting through Module 12.
- **No Hard Delete:** Cancellation flips the invoice to `CANCELLED` and links a reversal journal entry instead of deleting the document.
- **Payment Lock:** Invoices with received payments cannot be edited or cancelled.
- **Company/FY Scoping:** All invoice operations are validated against the company and active financial year.

### Integration TODOs
- Module 3 + Module 5: map customer AR ledger accounts for invoice posting.
- Module 25: wire tax-rate logic and output GST account mapping.
- Module 9: update `amountReceived` and `balanceDue` when payments are received.
- Module 12: expand posting/reversal logic for richer accounting entry details.
- Module 13/14: feed ledger and reports from invoice postings.
- Module 20: hook due-date reminders and notification workflows.

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
| POST | `/api/financial-year` | Yes | Create a new financial year for a branch (overlap check enforced) |
| GET | `/api/financial-year?companyId=&branchId=` | Yes | List financial years; `branchId` optionally filters one branch |
| PUT | `/api/financial-year/:id/lock` | Yes | Lock a financial year to close it |

### Business Rules Enforced
- **GSTIN format:** `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`
- **PAN format:** `^[A-Z]{5}[0-9]{4}[A-Z]{1}$`
- **Head Office:** Every company must have exactly one Head Office branch. First branch is auto-assigned. Status transfer enforced on update.
- **Branch Delete Guard:** Cannot delete Head Office. Cannot delete branches with associated transactions (future-proof via dynamic model check).
- **FY Branch Link:** Every newly created financial year stores its `branchId`; the branch must belong to the supplied company.
- **FY Overlap:** Overlapping date ranges for the same branch return `409 Conflict`.
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

---

## Module 23: Roles & Permissions API Endpoints
All endpoints have the base path `/api/role`. Use [role_endpoints.http](file:///c:/Users/LENOVO/Desktop/KT-CRM/server/role_endpoints.http) with the VS Code REST Client extension to test interactively.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/role/seed-default` | Yes | Seed the 8 default system roles for a new company |
| POST | `/api/role` | Yes | Create a new custom role |
| GET | `/api/role?companyId=` | Yes | List all roles (system + custom), sorted system-first |
| PUT | `/api/role/:id/permissions` | Yes | Merge-update a role's permission matrix |
| DELETE | `/api/role/:id` | Yes | Delete a custom (non-system) role |

### Permission Matrix
Every role stores exactly **15 permission entries** — one per business module. The 15 fixed module keys are:

```
CompanySettings, UserManagement, MasterData, EmployeeDepartment, Accounting,
Banking, CRM, Purchase, Inventory, ExpenseSalary, FixedAssets, Reports,
Approvals, AuditLog, NotificationConfig
```

Each entry has one of 7 levels: `full`, `manage`, `entry`, `approve`, `view`, `own`, `none`.

### 8 Default System Roles (seeded via `POST /api/role/seed-default`)

| Role | isProtected | Notes |
|------|-------------|-------|
| Super Admin | **true** | All modules = `full`. Permissions **cannot** be edited, role **cannot** be deleted. |
| Admin | false | Broad access, cannot delete audit logs. Permissions CAN be edited. |
| Accountant | false | Entry-level accounting, full banking and reports. |
| CA | false | Read-only with full audit and reports. |
| Manager | false | Approval rights over CRM, Purchase, Expenses. |
| Sales | false | Full CRM, own expenses, view inventory. |
| HR | false | Full employee/department and expense/salary. |
| Employee | false | Own records in department and salary only. |

### Business Rules Enforced
- **Complete 15-entry array:** Every role always stores all 15 modules — missing modules default to `none`. No sparse arrays ever.
- **Super Admin is protected:** `isProtected: true` — permissions cannot be edited (403), role cannot be deleted (403).
- **System roles undeleteable:** All 8 default roles have `isSystemRole: true`. DELETE returns 403. Their permissions (except Super Admin) CAN be edited.
- **Custom roles deleteable:** Hard delete is used, gated by `hasUsersAssigned()` placeholder (always `false` until Module 16).
- **Unique names per company:** Case-insensitive, enforced both in app logic and via MongoDB compound index `{ companyId, name }` with `strength: 2` collation.
- **Idempotent seeding:** `seed-default` returns 409 if any `isSystemRole: true` already exists for the company.
- **Data isolation:** All endpoints scoped by companyId via `checkCompanyAccess` middleware.

### Migration Note — Role Strings
If any earlier module currently stores a free-form role string (e.g. `user.role = 'admin'` in the `User` model), that field is **separate** from this Role collection and is used only for internal system-level auth bootstrapping. When **Module 16 (User Management)** is built, it must reference `Role._id` (not a string) for all company-level role assignments, using a structure like:
```js
// User.companyAccess[]
{ companyId: ObjectId, roleId: ObjectId(ref: 'Role') }
```

### Future Integration Points
1. `hasUsersAssigned(roleId)` in `role.service.js` — currently returns `false`.
   * **TODO (now complete in Module 16):** Wire to `User.companyAccess[].role` — query users whose active `companyAccess` entry for this company references this role name, to block deletion.
2. Permission gate on role management endpoints:
   * **TODO (now complete in Module 16):** `requirePermission('UserManagement', 'manage')` middleware is available and wired to `/api/user`. Wire the same middleware to `/api/role` endpoints (POST, PUT, DELETE) in a follow-up pass.

---

## Module 16: User Management API Endpoints
All endpoints have the base path `/api/user`. Use [user_endpoints.http](file:///c:/Users/LENOVO/Desktop/KT-CRM/server/user_endpoints.http) with the VS Code REST Client extension to test interactively.

| Method | Path | Auth | Permission Required | Purpose |
|--------|------|------|--------------------|---------|
| POST | `/api/user` | Yes | UserManagement ≥ `manage` | Invite / add a user to a company |
| GET | `/api/user?companyId=` | Yes | UserManagement ≥ `manage` | List all users with access to a company |
| PUT | `/api/user/:id` | Yes | UserManagement ≥ `manage` | Update role / status / profile for a company |
| DELETE | `/api/user/:id?companyId=` | Yes | UserManagement ≥ `manage` | Revoke a user's access to a company |

### How Invite Flow Works
1. Admin calls `POST /api/user` with `companyId`, `name`, `email`, `role`.
2. **New email** — a `User` document is created with `passwordHash: null` (not usable for login), a 48-hour invite token is stored as `passwordResetTokenHash`, and an invite email is sent linking to `{CLIENT_URL}/set-password?token=...`.
3. **Existing email** — no new account is created. A new `companyAccess` entry is pushed to the existing user's document. No email is sent (they already have credentials).
4. Invitee clicks the link and calls `POST /api/auth/reset-password` (Module 1) with the token and their chosen password — no new endpoint needed.
5. On first successful login, `companyAccess[].joinedAt` should be updated (TODO hook in `auth.controller.js` reset-password handler).

### Business Rules Enforced
- **One email = one User account:** Never creates duplicate accounts. Extending `companyAccess[]` instead.
- **Null `passwordHash` login guard:** Module 1's login now rejects invited-but-not-activated users with a clear `401` message instead of crashing on `bcrypt.compare(password, null)`.
- **Permission gate via Module 23:** All 4 endpoints require the caller to have at least `manage` on `UserManagement` in their Role's permission matrix. Company owners (creators) bypass the gate automatically.
- **Data isolation per company:** `role` and `isActive` returned by `GET /api/user` are always from the specific `companyAccess` entry for the requested `companyId` — another company's role is never leaked.
- **Self-lockout guard:** Neither `PUT` (setting `isActive: false`) nor `DELETE` can deactivate a user's last remaining active company access if the caller is that same user.
- **Soft revoke only:** `DELETE` sets `companyAccess[].isActive: false` — never removes the User document (preserves historical record references).
- **Role strings are free-form for now:** Roles are stored as strings (e.g. `"Admin"`, `"Accountant"`). They map to the seeded Role names in Module 23 for permission resolution. When Module 16 is upgraded, add `roleId: ObjectId(ref: 'Role')` to `companyAccess[]` and look up by ID for efficiency.
- **48-hour invite token:** Configurable via `INVITE_TOKEN_EXPIRY_HOURS` env var (default `48`). Reuses Module 1's `passwordResetTokenHash` / `passwordResetExpires` fields — no new fields added.

### Schema Changes to User Model
```js
// Added to existing User model (server/src/models/User.js)
companyAccess: [{
  companyId: ObjectId(ref: 'Company'),   // required
  role: String,                           // free-form; maps to Module 23 role name
  isActive: Boolean,                      // default: true
  invitedAt: Date,
  joinedAt: Date                          // null until invite is accepted
}]
```
Index added: `{ 'companyAccess.companyId': 1 }` for efficient `GET /api/user?companyId=` queries.

### New Middleware: `requirePermission(module, level)`
Path: `server/src/middleware/requirePermission.js`

Generic Module 23 permission gate. Resolves the caller's Role document by matching `companyAccess[].role` (name string) against the `Role` collection, then checks if the permission level for the given module meets the required minimum.

**Level hierarchy (ascending):** `none` < `own` < `view` < `entry` < `approve` < `manage` < `full`

Usage:
```js
router.post('/', authenticate, requirePermission('UserManagement', 'manage'), controller);
```

### Future Integration Points
1. `companyAccess[].joinedAt`:
   * **TODO:** Set to `now()` inside `auth.controller.js` `resetPassword` handler when an invited user (null passwordHash before reset) completes their first password setup.
2. `companyAccess[].roleId` (ObjectId ref to Role):
   * **TODO:** Add this field when the team is ready to migrate from free-form role strings to proper Role document references. Update `requirePermission.js` step 3 to look up by `_id` instead of name.
3. `role.service.js hasUsersAssigned(roleId)`:
   * **TODO:** Query `User.companyAccess` where `role === roleName && companyId === targetCompanyId && isActive` to block deletion of roles that are in use.

---

## Module 25: GST & Tax Master API Endpoints
All endpoints require `Authorization: Bearer <accessToken>`. Use [gst_endpoints.http](file:///c:/Users/LENOVO/Desktop/KT-CRM/server/gst_endpoints.http) to test interactively.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/tax/seed-default` | Yes | Seed standard Indian GST rates (0%, 0.25%, 3%, 5%, 12%, 18%, 28%, Exempt, Nil Rated) |
| POST | `/api/tax` | Yes | Create a custom tax rate (e.g. `Custom GST 15%`) |
| GET | `/api/tax?companyId=` | Yes | List tax rates for a company, sorted by ratePercent ascending |
| POST | `/api/gst/validate-gstin` | Yes | Stateless validator for GSTIN format and check digit |
| GET | `/api/gst/returns-summary?companyId=` | Yes | GST returns filing summary (GSTR-1/3B ready) placeholder |

### GSTIN Checksum Algorithm
The `validate-gstin` endpoint uses the standard 15-character verification system:
- **Format:** standard pattern verification `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`
- **Checksum:** computes sum of character indices mapping to factor `1, 2, 1, 2...` with reduction logic on overflow.
- Core validation is exported as `validateGstin(gstin)` from `gst.service.js`.

### Business Rules Enforced
- **Idempotent seeding:** `seed-default` returns 409 if any `isSystemTax: true` already exists for the company.
- **Unique names per company:** Enforced using compound index `{ companyId, name }` with case-insensitive collation.
- **Stateless Validation:** `/api/gst/validate-gstin` returns a detailed analysis payload with HTTP 200 rather than crashing or throwing errors for invalid inputs.

### Integration Points
- **Module 5 (Customer) / Module 6 (Supplier) Validation:**
  The `validateGstin` method in `customer.service.js` has been updated to call the validator function in `gst.service.js` directly.
- **Transactions GST Summary:**
  `getGstReturnsSummary` in `gst.service.js` is a placeholder that will aggregate taxable values and CGST/SGST/IGST breakdown once Module 8 (Sales Invoices) and Module 10 (Purchases) are built.

---

## Module 14: Reports API

Module 14 is a **read-only aggregation layer**. It exposes Trial Balance, Profit & Loss, Balance Sheet, GST Payable, and JSON-placeholder export endpoints under `/api/reports`. It owns no collection and never writes to MongoDB.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/reports/trial-balance` | Trial Balance |
| GET | `/api/reports/profit-loss` | Profit & Loss Statement |
| GET | `/api/reports/balance-sheet` | Balance Sheet |
| GET | `/api/reports/gst` | GST Payable report |
| GET | `/api/reports/{gst,trial-balance,profit-loss,balance-sheet}/export` | JSON placeholder export |

All endpoints require a bearer token and `companyId`. `financialYearId`, when supplied, is validated against the company; optional `from` and `to` values use `YYYY-MM-DD`. Exports currently return `exportFormat: "json"`, `downloadUrl: null`, and the report payload—no files are created.

### Future integration points

- **Module 12 — Journal Entry:** use posted journal lines as the accounting source for Trial Balance, Profit & Loss, and Balance Sheet.
- **Module 13 — Ledger:** provide ledger balances and period filters for those reports.
- **Module 3 — Chart of Accounts:** classify accounts for Trial Balance and Balance Sheet, and identify income/expense accounts for Profit & Loss.
- **Module 25 — GST & Tax Master:** `getGstReport` calls `getGstReturnsSummary` when available; its GSTR-1/GSTR-3B detail mapping will be completed when Module 25 exposes those report values.

---

## Module 12: Journal Entry API

Module 12 is the manual accounting posting layer. It creates balanced debit/credit journal entries for adjustments, accruals, depreciation, reversals, and similar accounting postings. All endpoints require a bearer token and are available under `/api/journal-entry`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/journal-entry` | Create a balanced manual entry |
| GET | `/api/journal-entry?companyId=` | List entries, optionally filtered by financial year or date range |
| GET | `/api/journal-entry/:id` | Get an entry and its account lines |
| DELETE | `/api/journal-entry/:id` | Safely reverse an entry |

Entries require at least two active ledger-account lines in the requested company. Each line has exactly one positive debit or credit amount; totals must balance. Financial years must belong to the company, be unlocked, and contain the entry date.

DELETE performs a **soft reversal**: it keeps the original entry, marks it `isReversed: true`, and creates a separate opposite debit/credit entry linked through `reversedFrom` and `reversalEntryId`. History is never hard-deleted.

### Future dependencies

- **Module 13 — Ledger:** consume posted journal lines to create account-level ledger movements and balances.
- **Module 14 — Reports:** aggregate these posted journal entries into Trial Balance, Profit & Loss, and Balance Sheet outputs.

---

## Module 13: Ledger API

Module 13 is a **read-only account-wise transaction history layer** under `/api/ledger`. It derives chronological running balances from Module 12 Journal Entry lines and does not create or edit any accounting data.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/ledger/:accountId?companyId=` | Full chronological ledger history |
| GET | `/api/ledger/:accountId/balance?companyId=` | Current account balance summary |

Both endpoints validate company ownership, account ownership, optional financial-year ownership, and optional `from`/`to` date ranges. Debit amounts increase a DR balance and credit amounts increase a CR balance. The balance endpoint returns an absolute `balance` plus `balanceType` (`DR` or `CR`).

### Future integration points

- **Module 12 — Journal Entry:** currently the live posting source for ledger lines, including reversal entries.
- **Invoice, Payment, Purchase, Expense, and Salary modules:** merge their posted accounting movements in chronological order when they are implemented.
- **Module 14 — Reports:** consume the resulting account balances for Trial Balance, Profit & Loss, and Balance Sheet calculations.

---

## Module 8: Sales Invoice API

Module 8 exposes authenticated invoice APIs under `/api/invoice`. It creates company-scoped AR invoices with backend-generated, financial-year-specific invoice numbers; invoice totals are validated before persistence. Cancellation is status-based, not a hard delete. See [invoice_endpoints.http](invoice_endpoints.http) for all six requests.

### Integration TODOs

- **Module 12 Journal Entry:** post Dr customer / Cr revenue and GST on creation, and reverse that entry on cancellation.
- **Module 9 Payment:** populate `appliedPayments`, update `balanceDue`, and prevent edits/cancellation after a payment.
- **Module 25 GST & Tax Master:** tax-rate ownership is validated now; tax-account posting mapping is pending.
- **Modules 13 Ledger and 14 Reports:** consume posted invoice journal entries.
- **PDF service:** the invoice PDF endpoint is currently a safe placeholder response.

## Module 9: Payments (Customer Receipts) API

Module 9 records authenticated customer receipts under `/api/payment`. Use [payment_endpoints.http](payment_endpoints.http) for ready-to-run requests.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/payment/receive` | Record a customer receipt and allocate it to invoices |
| GET | `/api/payment?companyId=` | List company payments with optional filters and pagination |
| GET | `/api/payment/:id` | Get a single payment's complete detail |

Payments use **strict allocation**: at least one allocation is required and the allocation total must exactly equal `totalAmount`; advance/unallocated receipts are not accepted. Financial year, customer, invoice, and bank-account ownership are validated against the company. Allocations update `Invoice.balanceDue`, invoice payment status, and `appliedPayments`; an allocation cannot exceed an invoice's outstanding balance.

For BANK_TRANSFER, CHEQUE, and UPI, an active company `bankAccountId` is required. When a bank account is supplied, a Module 12 journal entry is posted: Dr bank/cash account and Cr customer AR. CASH receipts without a selected account persist with `journalEntryId: null` until a default cash-account setting exists.

### Integration TODOs

- **Module 4 Bank & Cash Accounts:** configure a default cash account to post CASH receipts without `bankAccountId`.
- **Module 8 Invoices:** allocations are now wired to `balanceDue`, `status`, and `appliedPayments`; invoice cancellation/edit guards already respect applied payments.
- **Module 12 Journal Entry:** bank-account-backed receipts create balanced entries; reversal is intentionally deferred to a future audited payment-reversal endpoint.
- **Modules 13/14:** consume the Module 12 receipt journal entries for ledger and reporting.

## Login Onboarding Routing

`POST /api/auth/login` (and the successful two-factor `verify-otp` login response) includes an `onboarding` object. The frontend should navigate directly to the dashboard when `redirectTo` is `DASHBOARD`; otherwise it should open the company-registration page.

```json
{
  "onboarding": {
    "companyCreated": true,
    "branchCreated": true,
    "financialYearCreated": true,
    "companyId": "...",
    "redirectTo": "DASHBOARD"
  }
}
```

`redirectTo` is `COMPANY_REGISTRATION` only when the authenticated user has no existing company. The branch and financial-year flags are returned for an optional setup checklist on the dashboard.

## Module 20: Notification, Reminder & Alert Engine

Module 20 provides persistent notification logs, reminder configurations, scheduled-reminder records, and operational alerts. Its endpoints are under `/api` and all require a bearer token. Notifications are limited to their owning user. Company reminders and alerts use the Module 23 `NotificationConfig` permission: `view` lists reminders/alerts, while `manage` creates reminder rules and acknowledges alerts.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/notifications?userId=` | List the authenticated user's notifications |
| PUT | `/api/notifications/:id/read` | Mark an owned notification as read |
| POST | `/api/reminders/config` | Create a company reminder rule |
| GET | `/api/reminders?companyId=` | List scheduled reminders |
| GET | `/api/alerts?companyId=` | List unacknowledged active alerts |
| PUT | `/api/alerts/:id/acknowledge` | Persist an alert acknowledgement |

Reminder rules and alerts are stored in dedicated MongoDB collections. In the absence of a scheduler or alert generator, reminder and alert lists return valid empty `items` arrays. Notification read receipts and alert acknowledgements retain timestamps and the acting user for auditability.

### Future integration points

- **Module 8 Sales Invoice / payments:** due-date notifications and overdue-invoice alerts.
- **Module 4 Bank & Cash:** negative-cash alerts.
- **Module 10 Purchase:** supplier-payment due reminders.
- **Module 18 Inventory & Warehouse:** low-stock alerts.
- **Module 19 Fixed Assets:** AMC and renewal reminders.
- **Module 25 GST & Tax Master:** GST due-date reminders.
- **Module 22 Audit Log / Module 21 Workflow & Approval:** event-driven notifications and approval alerts.
