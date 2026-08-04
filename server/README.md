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
**Current status: 39/39 tests passing** (Module 1: 16, Module 2: 23)

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
