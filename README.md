# DearSelf V43.6 Beta

## V43.6 fixes
- Removed duplicate update-checker logic.
- Automatic update popups are disabled during startup.
- Manual **Check for Updates** only reports a strictly newer version.
- Added hard startup recovery so the app does not remain on "Loading DearSelf…".
- Rotated the service-worker cache to V43.6.
- Added a clean `public/` deployment directory.
- Added GitHub Pages workflow and Cloudflare static-assets configuration.
- Added missing PWA icon/manifest assets.

## Deployment
- GitHub Pages: the included workflow deploys `./public`.
- Cloudflare: use `./public` as the static assets directory.

`dearself-sync-bridge.js`, if used, should remain outside the public web deployment.
