# Putting this on GitHub

## 1. Create the repository

Go to https://github.com/new

- Repository name: `tractor-erp`
- Visibility: **Public** (GitHub Pages needs a public repo on the free plan)
- Do **not** tick "Add a README" — this folder already has one

## 2. Push this folder

```bash
cd path/to/this/folder
git remote add origin https://github.com/<your-username>/tractor-erp.git
git branch -M main
git push -u origin main
```

(If the folder has no `.git`, run `git init` first, then `git add -A && git commit -m "Tractor ERP"`.)

## 3. Turn on Pages

Repository → **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main`,
folder `/ (root)` → Save.

After a minute the app is live at:

    https://<your-username>.github.io/tractor-erp/

## 4. Optional: publish the APK as a release

Repository → **Releases → Draft a new release** → tag `v3.3` → attach
`dist/Tractor-ERP-v3.3.apk` → Publish. You then get a permanent download link.

## Notes

- The hosted page runs in the browser and stores its data in that browser.
- **Cloud folder sync works from the hosted page** (it is HTTPS, which the browser
  requires for folder access).
- **The Server tab will not work from an https page pointing at `http://…`** —
  browsers block that as mixed content. Use the app served by the server itself
  (`http://192.168.1.5:8080`) on the office network, or put the server behind
  HTTPS with a domain.
