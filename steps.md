# Parks Connect Setup and Full Test Guide

This guide shows how to:
- install tools (VS Code + dependencies),
- run the system locally,
- run mobile app on a real phone,
- change mobile API IP for your current network,
- create demo accounts,
- test all key functions on mobile and web.

---

## 1. Install Required Software

## 1.1 Install VS Code
1. Download VS Code: https://code.visualstudio.com/
2. Install with default options.
3. Open VS Code.
4. Install these extensions:
   - `Dart`
   - `Flutter`
   - `ESLint` (optional)
   - `Prettier` (optional)

## 1.2 Install Core Dependencies
Install these tools:
1. **Git**: https://git-scm.com/downloads
2. **Node.js LTS** (includes npm): https://nodejs.org/
3. **Flutter SDK**: https://docs.flutter.dev/get-started/install/windows/mobile
4. **Android Studio** (for Android SDK + platform tools): https://developer.android.com/studio
5. **PostgreSQL** (local DB): https://www.postgresql.org/download/windows/

After install, verify in PowerShell:

```powershell
git --version
node -v
npm -v
flutter --version
adb version
```

---

## 2. Open Project in VS Code

1. Open VS Code.
2. `File -> Open Folder...`
3. Select:

`C:\Users\CyberFlacx\Desktop\Parks_Connect`

---

## 3. Install Project Dependencies

Run these in PowerShell:

```powershell
cd C:\Users\CyberFlacx\Desktop\Parks_Connect
npm install

cd backend
npm install

cd ..\web
npm install

cd ..\mobile
flutter pub get
```

---

## 4. Configure Environment Files

Make sure these files exist:
- `backend/.env`
- `web/.env`

Typical local values:

### `backend/.env`
```env
BACKEND_PORT=4000
DATABASE_URL=postgresql://postgres@127.0.0.1:55432/parks_connect_dev
PGSSL=false
JWT_SECRET=dev_jwt_secret
IT_ADMIN_KEY=dev_it_admin_key
ALLOWED_ORIGINS=http://localhost:3000
```

### `web/.env`
```env
WEB_PORT=3000
BACKEND_URL=http://localhost:4000
SESSION_SECRET=dev_session_secret
SESSION_TTL_MS=604800000
```

---

## 5. Start Database, Backend, and Web (Localhost)

## 5.1 Start PostgreSQL
Use your local PostgreSQL instance and make sure DB `parks_connect_dev` exists.

If needed, create DB:
```powershell
createdb -h 127.0.0.1 -p 55432 -U postgres parks_connect_dev
```

## 5.2 Run Migrations + Seed
```powershell
cd C:\Users\CyberFlacx\Desktop\Parks_Connect\backend
npm run migrate
npm run seed
```

## 5.3 Start Backend
```powershell
cd C:\Users\CyberFlacx\Desktop\Parks_Connect\backend
npm run start
```

Backend URL:
- `http://localhost:4000`
- Health: `http://localhost:4000/api/health`

## 5.4 Start Web
Open a second terminal:

```powershell
cd C:\Users\CyberFlacx\Desktop\Parks_Connect\web
npm run start
```

Web URL:
- `http://localhost:3000`

---

## 6. Get Current Network IP (for Mobile on Real Phone)

Run:

```powershell
ipconfig
```

Use your active Wi-Fi IPv4, for example:
- `192.168.1.74`
- or `10.142.160.41`

Important:
- Phone and laptop must be on the same network.
- Backend must be reachable at `http://<YOUR_IP>:4000`.

---

## 7. Turn On Developer Mode on Android Phone

1. Open phone **Settings**.
2. Go to **About phone**.
3. Tap **Build number** 7 times.
4. Go back to **Developer options**.
5. Enable:
   - **Developer options**
   - **USB debugging**
   - (Optional) **Install via USB**
6. Connect phone to PC via USB.
7. Accept RSA debug prompt on phone.

Verify:
```powershell
adb devices
```

You should see device status `device`.

---

## 8. Build and Launch Mobile App on Device

## 8.1 Debug run with current IP (fastest)
```powershell
cd C:\Users\CyberFlacx\Desktop\Parks_Connect\mobile
flutter run -d <DEVICE_ID> --dart-define API_BASE=http://<YOUR_IP>:4000
```

Example:
```powershell
flutter run -d R83Y4056DLN --dart-define API_BASE=http://10.142.160.41:4000
```

## 8.2 Release APK with current IP (installable build)
```powershell
cd C:\Users\CyberFlacx\Desktop\Parks_Connect\mobile
flutter build apk --release --dart-define API_BASE=http://<YOUR_IP>:4000
```

APK output:
`C:\Users\CyberFlacx\Desktop\Parks_Connect\mobile\build\app\outputs\flutter-apk\app-release.apk`

Install release APK:
```powershell
adb uninstall com.example.parks_connect
adb install build\app\outputs\flutter-apk\app-release.apk
adb shell am start -n com.example.parks_connect/com.example.parks_connect.MainActivity
```

---

## 9. Register Mobile Staff Account (Demo)

In mobile app:
1. Open **Field Staff**.
2. Tap **Create account**.
3. Fill:
   - Full name
   - Role
   - Park ID (required for environment officer/tourism operator)
   - Email
   - Password
   - Confirm password
   - IT admin key

Demo IT admin key:

`dev_it_admin_key`

---

## 10. Login on Mobile App

1. Open **Field Staff**.
2. Enter staff email/password.
3. Tap **Sign in**.
4. Confirm dashboard opens.

---

## 11. Test Every Mobile Function

Run through this checklist:

1. **Tourist Feedback**
   - Open `Tourist Feedback`.
   - Select park.
   - Submit rating + comments.
   - Optionally attach photo + GPS.
   - Confirm success message or offline queue behavior.

2. **Staff Auth**
   - Register new user.
   - Login with new user.
   - Verify role behavior and park association.

3. **Field Dashboard**
   - Submit incident/environment log.
   - Set severity and category.
   - Confirm submission success.

4. **Offline Queue + Sync**
   - Disable internet on phone.
   - Submit feedback or incident.
   - Re-enable internet.
   - Tap sync (or trigger refresh).
   - Confirm pending items reduce.

5. **Notifications / Alerts**
   - Open alerts area.
   - Verify active alerts load.

6. **Session**
   - Close and reopen app.
   - Confirm session restore behavior.

---

## 12. Login on Web App

Open:
- `http://localhost:3000/login`

Use:
- Existing seeded account, or
- account created from mobile/web registration.

Default demo admin:
- `admin@parksconnect.local`
- `changeme123`

---

## 13. Test Every Web Function

Run through this checklist:

1. **Auth pages**
   - Login
   - Create account
   - Forgot password
   - Input validation checks (bad email, weak password, mismatch confirm)

2. **Role dashboards**
   - Authority Admin dashboard
   - Environment Officer dashboard
   - Tourism Operator dashboard

3. **Park/User management**
   - Add/update users (where applicable)
   - Park assignment checks

4. **Visitors and occupancy**
   - Add visitor logs
   - Verify metrics update

5. **Environmental logs**
   - Add log entries
   - Check status/severity flow

6. **Feedback workflows**
   - View feedback submissions from mobile/web
   - Update statuses

7. **Reports/Analytics**
   - Open analytics pages
   - Export CSV/PDF if available

8. **Notifications**
   - Verify alerts appear for threshold/severity events

---

## 14. Quick Troubleshooting

1. **Mobile cannot reach backend**
   - Confirm backend is running on port `4000`.
   - Confirm phone + PC are same network.
   - Check Windows firewall inbound access for Node/port 4000.
   - Rebuild/re-run app with correct `--dart-define API_BASE=http://<YOUR_IP>:4000`.

2. **Wrong API IP in app**
   - App uses compile-time value.
   - Re-run `flutter run` or rebuild APK with the new IP.

3. **ADB device not detected**
   - Reconnect USB.
   - Re-enable USB debugging.
   - Run `adb kill-server` then `adb start-server`.

4. **Web opens but backend errors**
   - Confirm `web/.env` points to correct `BACKEND_URL`.
   - Confirm backend migrations/seed completed.

---

## 15. Useful Paths

- Project root:
  `C:\Users\CyberFlacx\Desktop\Parks_Connect`
- Mobile app source:
  `C:\Users\CyberFlacx\Desktop\Parks_Connect\mobile`
- Release APK:
  `C:\Users\CyberFlacx\Desktop\Parks_Connect\mobile\build\app\outputs\flutter-apk\app-release.apk`

