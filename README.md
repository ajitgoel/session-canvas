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
