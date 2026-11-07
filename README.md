# Tractor ERP

GST accounting, inventory and workshop software for a tractor dealership — offline-first,
built as a single-page app that runs as an Android app, in a desktop browser, or served
from your own machine.

## What is in here

| Path | What it is |
|------|------------|
| `index.html` | The whole web app in one file — open it in any browser |
| `app/` | Source: `index.html`, `css/app.css`, `js/*.js` (22 modules, no build step) |
| `server/` | Company server: logins, shared books, multi-device sync (Node, zero dependencies) |
| `dist/` | Ready builds — the single-file web app and the Android APK |
| `tools/build_web.py` | Regenerates `index.html` from `app/` |

## Run it on a PC

Download `index.html` and double-click it, or use this page if GitHub Pages is enabled.
Data is stored in the browser for that PC. Use **Masters → Import & Export** or
**My Account → Backup** to move it.

## Run it as a phone app

Install `dist/Tractor-ERP-v3.3.apk` (Android 7+). Allow "install from unknown sources"
when asked — the APK is self-signed.

## Run the company server (multiple users)

```bash
cd server
node server.js
```

Open the address it prints. First sign-in is `admin` / `admin123` — change it straight away.
See `server/README.txt` for users, roles, backups and exposing it beyond the office.

## Keeping devices in step

Three ways, all built in, under **Sync & Backup**:

- **Server** — sign in to your own server; every device shares one set of books, each
  person with their own login and permissions.
- **Cloud folder** — point two devices at the same Google Drive / OneDrive / Dropbox
  folder; each writes one small file and merges the others. No server, no login.
- **Wi-Fi** — one device hosts, the others join on the same network.

Every device keeps a full offline copy and merges on reconnect: newer version of a
record wins, deletions propagate, invoice numbers never collide.

## Rebuilding the web file

```bash
python3 tools/build_web.py     # writes Tractor-ERP-Web.html from app/
```
