# Session Canvas

A Chrome extension inspired by Session Buddy, rebuilt as a simplified personal link manager with:

- URL storage
- Notes
- Tags
- Groups with collapsible sections
- IndexedDB-backed persistence

## Load in Chrome

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select `/Users/ajitgoel/session-buddy-2`

## Main pieces

- `manifest.json`: MV3 extension manifest
- `dashboard.html` + `dashboard.js`: full manager UI
- `popup.html` + `popup.js`: quick-save popup
- `db.js`: shared IndexedDB layer
- `styles.css`: shared visual system

## Cloudbeds hold sheet webhook

The Cloudbeds popup can post visible hold units to a Google Apps Script web app instead of writing to Google Sheets directly.

1. Create a new Google Apps Script project.
2. Paste in [apps-script/units-on-hold-webapp.gs](/Users/ajitgoel/session-buddy-2/apps-script/units-on-hold-webapp.gs).
3. Deploy it as a web app.
4. Set access so the web app can run for your spreadsheet workflow.
5. Copy the deployed `/exec` URL.
6. Reload the extension, open the Cloudbeds calendar, open the popup, paste the URL into `Apps Script URL`, and click `Save URL`.
7. Click `Save to hold sheet`.
