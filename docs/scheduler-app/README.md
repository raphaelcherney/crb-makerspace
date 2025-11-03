# CRB Makerspace – 3D Printer Scheduler

A simple, mobile-first single-page web app to reserve 3D printers. Data is stored in a Google Sheet via a Google Apps Script Web App.

- Frontend: static files in `docs/scheduler-app/` (works on GitHub Pages and can be embedded via iframe)
- Backend: Google Apps Script (`appsscript/Code.gs`) reading/writing a Sheet

## Quick Start

1) Create the Google Sheet
- Add a new Google Sheet. Note its ID (the part between `/d/` and `/edit`).
- Create a sheet (tab) named `Reservations` with headers in row 1:
  `id, start_date, start, end_date, end, printer, status, created_at, updated_at, name, contact, lab, material, notes`

2) Create Apps Script Web App
- In the Google Sheet, open **Extensions → Apps Script** (this binds the script to your sheet).
- Replace the default `Code.gs` contents with `appsscript/Code.gs` from this repo.
- In Apps Script: **Project Settings** → set:
  - Time zone: `Central Time - Chicago`
  - Runtime: `Enable Chrome V8 runtime` (if not already set)
- **Authorize the script** (first time only):
  - Click the **Run** button (▶) next to `doGet` function
  - Click **Review Permissions** → choose your account → **Advanced** → **Go to [Project Name] (unsafe)** → **Allow**
- In Apps Script: **Project Settings** → **Script properties** → **Add script property**:
  - `SHEET_NAME` = `Reservations` (the name of the sheet tab - must match exactly)
  - `TIMEZONE` = `America/Chicago`
  - `ALLOWED_ORIGIN` = `*` (for local/testing). Later, change to your final site origin.
  - `PRINTERS` = `R2-3D2 (Bambu X1C),C3DPO (Bambu X1C),PLA Trooper (Bambu P1S),Hydra (Prusa XL)`
  - `SHEET_ID` = (optional - only needed if script is standalone, not bound to sheet)
- **Deploy the Web App** (critical for CORS to work):
  - Click **Deploy** → **New deployment** (or **Manage deployments** if you already have one)
  - Click the gear icon ⚙️ next to "Select type" → choose **Web app**
  - Set:
    - **Execute as**: `Me` (runs with your authorization)
    - **Who has access**: `Anyone` (this is required for CORS!)
  - Click **Deploy** (or **Update** if editing existing deployment)
  - Copy the **Web app URL** (not the script editor URL - it should look like `https://script.google.com/macros/s/.../exec`)
  - **Important**: After any code changes or authorization, you must:
    1. Create a **new version** (click the version dropdown → "New version")
    2. Update the deployment to use the new version
    3. Or create a completely new deployment

3) Configure frontend
- Open `docs/scheduler-app/app.js` and set:
  ```js
  API_BASE_URL: 'YOUR_WEB_APP_URL'
  ```

4) Local testing
- Serve the `docs/` folder (or open `docs/scheduler-app/index.html` directly). For MkDocs, this will be available under `/scheduler-app/`.

5) GitHub Pages
- Commit and push. With MkDocs Material, the app is at `/scheduler-app/` and can be embedded in a page via iframe:
  ```html
  <iframe src="/scheduler-app/index.html" style="width:100%;height:80vh;border:0;" loading="lazy"></iframe>
  ```

## API Contract

- GET `?action=reservations&date=YYYY-MM-DD`
  - Response:
    ```json
    { "date":"YYYY-MM-DD", "timezone":"America/Chicago", "printers":[...], "reservations":[{"printer":"...","start":"HH:mm","end":"HH:mm"}] }
    ```
- POST with form body (`application/x-www-form-urlencoded`) to avoid CORS preflight:
  - Body: `action=reserve&date=YYYY-MM-DD&start=HH:mm&end=HH:mm&endDate=YYYY-MM-DD&printer=...&name=...&contact=...&lab=...&material=...&notes=...`
  - Response:
    ```json
    { "ok": true, "id": "..." }
    ```

PII (`name, contact, lab, material, notes`) is stored in the Sheet but is never returned by the GET endpoint.

## CORS
- The Web App returns `Access-Control-Allow-Origin` using the `ALLOWED_ORIGIN` Script Property.
- For local/testing: set to `*`.
- When your final domain is known, set it to that origin, e.g., `https://example.github.io`.

## Notes
- Time resolution is 30 minutes, 24-hour view.
- Client performs a simple overlap check; server is authoritative.
- No cookies or credentials used.


