# Parks Connect

Hybrid system for park operations, tourism, and conservation.

- Backend REST API (Express + SQLite) with JWT auth and role-based access.
- Web dashboards for HQ Admin, ZimParks Staff, and Tourism Operators.
- Flutter mobile app for tourists and field staff with offline-first logging.

## Quickstart

1) `cp .env.example .env` then set secrets/ports as needed.
2) Backend: `cd backend && npm install && npm run migrate && npm run seed && npm run dev`.
3) Web: `cd web && npm install && npm run dev` (uses EJS + Tailwind CDN).
4) Mobile: `cd mobile && flutter pub get && flutter run -t main.dart`.

## Accounts

- Authority admin: `admin@parksconnect.local / changeme123`
- Environment officer: `officer1@parksconnect.local / env12345`
- Tourism operator: `operator1@parksconnect.local / tour12345`

## API

See `api_spec_openapi.json` for the OpenAPI 3 contract (auth, visitor logs, environmental logs, feedback, notifications, analytics).

## Data + Notifications

- Threshold notifications fire for high visitors, occupancy, low ratings, or critical environmental severity.
- Migrations live in `backend/migrations` and demo data in `backend/seeders`.
