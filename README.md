# Parks Connect

End-to-end platform for ZimParks HQ admins, staff, operators, tourists, and field teams.

- Backend: Express + SQLite + JWT/RBAC, migrations + seeders, notification generator, analytics.
- Web: Express + EJS + Tailwind dashboards with role-based cards, charts, and quick actions.
- Mobile: Flutter app (Android/iOS) with shared color palette, GPS/photo capture, offline SQLite cache + sync.

## Getting started

1) Copy envs: `cp .env.example .env` and set secrets/ports.
2) Backend: `cd backend && npm install && npm run migrate && npm run seed && npm run dev`.
3) Web: `cd web && npm install && npm run dev` (frontend calls backend via `BACKEND_URL`).
4) Mobile: `cd mobile && flutter pub get && flutter run -t main.dart`.

Demo logins: authority admin `admin@parksconnect.local / changeme123`, environment officer `officer1@parksconnect.local / env12345`, tourism operator `operator1@parksconnect.local / tour12345`.

API contract lives at `docs/api_spec_openapi.json`.
