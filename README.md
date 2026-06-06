# Parks Connect

Parks Connect is the ZimParks feedback, analytics, alerts, web, and mobile platform in this repository. The active applications are:

- `backend/`: Express API with PostgreSQL, JWT auth, reporting, feedback ingestion, analytics, and alert evaluation.
- `web/`: Express + EJS management UI and public visitor feedback page.
- `mobile/`: Flutter client for field staff and tourist/mobile capture flows.

## Implemented Objectives

### Objective 1: Multi-channel Tourist Feedback

- Public web feedback form at `/feedback`
- Mobile feedback submission via `/api/mobile/feedback`
- Email ingestion via `POST /api/feedback/email`
- Unified feedback storage in `tourist_feedback`, with:
  - `park_id`
  - `visit_date`
  - `rating`
  - `category`
  - `comments`
  - `channel`
  - timestamps

Supported channels:

- `web`
- `mobile`
- `email`

### Objective 2: Centralised Analytics Dashboard

- Management dashboard at `/dashboard`
- KPI cards for:
  - total feedback count
  - average rating
  - negative feedback percentage
  - active alerts count
- Charts for:
  - daily and weekly feedback volume
  - ratings by park
  - ratings by category
- Filterable feedback table with CSV export
- Session-backed dashboard polling through `/dashboard/data`

### Objective 3: Automated Alert Engine

- Feedback alert evaluation runs on a timed background interval from the backend server
- Required feedback rules implemented:
  - drought indicator
  - infrastructure failure
  - security incident
  - capacity threshold
- Management alert API at `GET /api/alerts`
- Alert emails sent to park manager email addresses when configured

## Dashboard Overview

The authority admin dashboard focuses on:

- live KPI monitoring
- chart-based feedback analytics
- active alert visibility
- CSV export of filtered feedback

Environment officers and tourism operators continue using their existing scoped workflows.

## Feedback Channels

### Public web form

- `GET /feedback`
- `POST /feedback`

### API web/operator feedback

- `POST /api/feedback`

### Mobile

- `POST /api/mobile/feedback`

### Email

- `POST /api/feedback/email`

The email endpoint accepts either structured fields directly or plain text bodies with entries such as:

```text
park_id: 1
visit_date: 2026-06-03
rating: 2
category: facilities
comment: Water points were dry near the campsite.
```

## Alert Engine

Alert records are stored in the existing `alerts` table, with additional normalized fields used by the management API:

- `summary_text`
- `severity_level`
- `alert_status`
- `triggered_at`

Severity labels exposed by the alert API:

- `low`
- `medium`
- `high`
- `critical`

Status labels exposed by the alert API:

- `open`
- `acknowledged`
- `resolved`

## Module Notes

### Visitor Registration & Receipting

- Existing visitor log capture remains in `backend/routes/visitorLogs.js`
- Export route available through `GET /api/reports/visitors`
- Revenue discrepancy helper now lives in `backend/utils/revenue.js` for alert/report logic

### Tourist Feedback

- Endpoints:
  - `POST /api/feedback`
  - `POST /api/feedback/public`
  - `POST /api/feedback/email`
  - `GET /api/feedback`
  - `PUT /api/feedback/:id/status`
- Validation is enforced with `express-validator`
- Feedback blockchain audit hashing is triggered asynchronously in the feedback controller

### HQ Analytics Dashboard

- Endpoint: `GET /api/analytics/summary`
- Web UI route: `GET /dashboard`
- Dashboard refresh interval:
  - web polling: `DASHBOARD_REFRESH_INTERVAL`

### Alerts & Notifications

- Endpoints:
  - `GET /api/alerts`
  - `PUT /api/alerts/:id/acknowledge`
  - `PUT /api/alerts/:id/resolve`
- Cron/runtime interval:
  - alert evaluator: `ALERT_ESCALATION_INTERVAL_MS` with a 15-minute floor in `backend/server.js`

### Blockchain Audit Layer

- Service file: `backend/services/blockchainService.js`
- Migration adds `blockchain_records`
- Current implementation provides deterministic canonical hashing and non-blocking anchor wrappers for feedback flows
- Required env vars:
  - `BLOCKCHAIN_MNEMONIC`
  - `BLOCKCHAIN_NETWORK_URL`
  - `CONTRACT_ADDRESS`

### User Management & RBAC

- Auth endpoints:
  - `POST /api/auth/login`
  - `POST /api/auth/register`
  - `POST /api/auth/self-register`
  - `POST /api/auth/forgot-password`
  - `GET /api/auth/me`
- Role aliases are normalized for `sysadmin`, `park_manager`, `hq_analyst`, `ranger`, and `reception`

## Environment Variables

Backend:

- `BACKEND_PORT`
- `DATABASE_URL`
- `MONGODB_URI`
- `PGSSL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `IT_ADMIN_KEY`
- `ALLOWED_ORIGINS`
- `BLOCKCHAIN_MNEMONIC`
- `BLOCKCHAIN_NETWORK_URL`
- `CONTRACT_ADDRESS`
- `AFRICAS_TALKING_API_KEY`
- `AFRICAS_TALKING_USERNAME`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SENDGRID_API_KEY`
- `AWS_BUCKET_NAME`
- `EMAIL_PROVIDER`
- `EMAIL_HOST`
- `EMAIL_PORT`
- `EMAIL_SECURE`
- `EMAIL_USER`
- `EMAIL_PASS`
- `EMAIL_FROM`
- `ALERT_ESCALATION_INTERVAL_MS`
- `DASHBOARD_REFRESH_INTERVAL`

Suggested values:

```env
EMAIL_PROVIDER=console
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=parksconnect@localhost
ALERT_ESCALATION_INTERVAL_MS=900000
DASHBOARD_REFRESH_INTERVAL=30000
```

## Getting Started

1. Install backend dependencies:

```powershell
cd backend
npm install
```

2. Run migrations and seed:

```powershell
npm run migrate
npm run seed
```

3. Start backend:

```powershell
npm run start
```

4. Start web:

```powershell
cd ..\web
npm install
npm run start
```

5. Start mobile:

```powershell
cd ..\mobile
flutter pub get
flutter run
```

## Deployment Notes

- The backend schedules alert evaluation at runtime, so deployments should keep one active worker/web instance responsible for the interval.
- For production email delivery, configure `EMAIL_PROVIDER=smtp` and the related SMTP credentials.
- The public feedback form depends on `web/.env` pointing to the correct `BACKEND_URL`.

## Testing

Backend tests:

```powershell
cd backend
npm test
```

These cover:

- feedback validation
- alert detection logic
- KPI aggregation logic
- alert workflow status normalization
- RBAC middleware normalization and enforcement
- blockchain hash/verify safety behavior
- revenue reconciliation thresholds
