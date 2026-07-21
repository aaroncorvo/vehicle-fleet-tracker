# MotorLog → App Store & Google Play: Platform/Packaging Research Report

Researched July 2026 against the actual codebase.

---

## 1. Recommendation: Capacitor 8 wrapper. Do not rewrite, do not stay PWA-only.

**Capacitor 8** (current: 8.4.x, released Dec 2025) is the clear fit for this codebase:

- **The web app ports as-is.** Vite + React 18, no router, hand-rolled CSS, mobile-first with bottom tab nav and `env(safe-area-inset-*)` already throughout `src/styles.css` — this app already *looks and behaves* like a native mobile app. Capacitor wraps the existing `dist/` output in a WKWebView/Android WebView with a native plugin bridge. Days of work, not months.
- **React Native rewrite: rejected.** You'd rewrite every screen, the entire hand-rolled instrument-cluster design system (explicitly protected in CLAUDE.md), and the CSS — months of solo effort to end up with the same app. RN buys you nothing here; the one native need (BLE) is available as a Capacitor plugin.
- **PWA-only: rejected because of iOS.** Web Bluetooth remains explicitly unsupported in Safari/WKWebView in 2026 (Apple declined it on privacy grounds in 2020 and hasn't moved), so the planned OBD-II feature is impossible as an iOS PWA. iOS installs are still manual "Add to Home Screen" with no install prompt. And a PWA never gets App Store distribution at all.
- **Google Play TWA (Bubblewrap): viable but half a solution.** A Trusted Web Activity gets the existing PWA onto Play cheaply, and since Chrome on Android supports Web Bluetooth, OBD-II would even work there. But: no iOS path, limited to web APIs forever, two packaging stories. Only worth it if skipping iOS.
- **Bonus:** Capacitor keeps the PWA alive. Same codebase ships to web (Netlify), iOS, and Android.

Capacitor 8 requirements: Node 22+, Xcode 26+ (macOS), iOS deployment target 15.0, Android minSdk 24 / target+compile SDK 36, SPM (not CocoaPods) is now the default iOS dependency manager, and edge-to-edge Android is handled by the built-in `SystemBars` plugin — which matters because Play's edge-to-edge enforcement arrived with targetSdk 35+.

---

## 2. Conversion checklist (ordered by phase)

### Phase 0 — Store accounts (start now; longest lead times)
1. **Apple Developer Program, Individual** — $99/yr. No D-U-N-S needed for individual enrollment (D-U-N-S is organizations only). Apps publish under your personal name — if you want "MotorLog LLC" on the listing you'd need an LLC + free D-U-N-S number (allow 1–2 weeks for D&B).
2. **Google Play Console** — $25 one-time. **Key decision:** a *personal* account created after Nov 13, 2023 must run a closed test with **12 opted-in testers for 14 consecutive days** before it can even *apply* for production access (reduced from 20 testers in Dec 2024; still enforced in 2026). Organization accounts are exempt but require a D-U-N-S number. As a solo dev, budget for the 12-tester slog (tester-exchange communities exist) or form an org account. This is the single biggest Android timeline risk.

### Phase 1 — Project changes
3. `npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android` (Capacitor 8), `npx cap init` (appId e.g. `com.aaroncorvo.motorlog`, webDir `dist`), `npx cap add ios android`.
4. Commit the generated `ios/` and `android/` folders; add `npx cap sync` after `vite build`.
5. Config in `capacitor.config.ts`: enable `CapacitorHttp` (see §3), set splash/status-bar to the #0A0A0B/amber theme, generate native icon/splash assets from the existing PWA icons (`@capacitor/assets` tool).
6. Environment: the native app bakes `VITE_SUPABASE_URL`/`VITE_SUPABASE_KEY` in at build time — the local `.env` gap becomes a hard requirement; a config-missing bundle in the store binary is an instant rejection.

### Phase 2 — Native plugins
7. `@capacitor/app` (deep-link/appUrlOpen events, back button), `@capacitor/preferences`, `@capacitor/status-bar`, `@capacitor/splash-screen`.
8. `@capacitor/camera` + `@capacitor/filesystem` — optional at first (the `<input type=file capture>` pattern already works in the WebViews), but adopt `@capacitor/camera` anyway for the 4.2 argument and a better UX.
9. `@capacitor-community/bluetooth-le` (v7.x line) for OBD-II — see §4.
10. Later: `@capacitor/push-notifications` (maintenance-due reminders — also strengthens the 4.2 case), `@capgo/capacitor-updater` for OTA (see §6).
11. iOS `Info.plist`: `NSBluetoothAlwaysUsageDescription` (app crashes without it), `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `ITSAppUsesNonExemptEncryption = NO` (HTTPS-only qualifies as exempt; skips the export-compliance question on every upload).
12. Android `AndroidManifest.xml`: `BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT` (API 31+ model), `CAMERA`, plus the deep-link intent filter.

### Phase 3 — Submission
13. Privacy policy URL (required by both stores) — a static page on motorlog.netlify.app is fine.
14. **Apple privacy nutrition labels**: declare email address (account), photos/user content (receipts, vehicle photos, documents), VINs/vehicle data as "Other user content" — all "linked to you", none used for tracking.
15. **Google Play Data Safety form**: same disclosures; also the account-deletion requirement (Play requires an in-app or web account-deletion path for apps with account creation — needs a delete-account edge function).
16. Screenshots (6.7" and 6.5" iPhone, iPad optional if iPhone-only; Android phone + tablet or mark phone-only), description, category ("Utilities" or "Lifestyle").
17. TestFlight internal (instant, 100 testers, no review) → external TestFlight (light review, <24h) → App Store review (24–72h typical in 2026).
18. Play: internal testing (instant) → closed testing (12-tester/14-day gate on personal accounts) → apply for production → production review.

---

## 3. Code-level changes THIS app needs

**a) NHTSA proxy (`src/lib/recalls.js`, `netlify.toml`) — the one guaranteed breakage.**
The app fetches `/nhtsa/...` relying on Netlify's rewrite. Inside Capacitor the app is served from `capacitor://localhost` (iOS) / `https://localhost` (Android) — no Netlify in front, the relative path 404s. Fix:
- **CapacitorHttp (recommended, zero server work):** enable in `capacitor.config.ts` (`plugins: { CapacitorHttp: { enabled: true } }`). Patches fetch/XHR through native HTTP stacks — not subject to CORS. Then: `const NHTSA_BASE = Capacitor.isNativePlatform() ? 'https://api.nhtsa.gov' : '/nhtsa'`.
  - Caveat: the fetch patch is global — Supabase requests also route natively. Normally fine, but test auth/storage; if anything misbehaves, disable the global patch and call `CapacitorHttp.get()` directly inside `recalls.js` only.
- Alternative: a Supabase Edge Function proxy — more moving parts, not needed.

**b) Supabase auth session — works nearly as-is, one hardening step.**
Default `createClient` = localStorage persistence. WKWebView localStorage persists across launches, but iOS can evict WKWebView website data under storage pressure. Email/password login means sessions generally survive — but pass a custom `auth.storage` adapter backed by `@capacitor/preferences` (native UserDefaults/SharedPreferences) when `Capacitor.isNativePlatform()`. ~15 lines.

**c) Google Drive OAuth flow (`src/App.jsx`) — must be reworked for native.**
Today: full-page redirect with `redirect_uri = window.location.origin + '/'`, code back via query params, state in `sessionStorage`. In the wrapper `window.location.origin` is `capacitor://localhost` — Google rejects it, and Google blocks OAuth in embedded webviews anyway. Native pattern:
1. Open consent URL in the system browser via `@capacitor/browser` (SFSafariViewController / Custom Tabs).
2. Keep the redirect URI on the web origin: `https://motorlog.netlify.app/gdrive-callback`, registered as a **Universal Link (iOS) / App Link (Android)** — `apple-app-site-association` + `assetlinks.json` served from Netlify — so completion bounces back into the app with the `?code=`. (Custom schemes aren't accepted by Google's web OAuth clients; the https-App-Link route reuses the existing web client.)
3. Handle via `App.addListener('appUrlOpen', ...)`; keep the `google-drive` edge-function `exchange` action unchanged (pass the fixed redirect_uri constant).
4. Move the OAuth `state` from sessionStorage to `Preferences` (system-browser round trips can background the app long enough for sessionStorage loss).
Fiddliest single task (~1–2 days incl. Google console + well-known-file deploys).

**d) Camera / file upload — no blocking change.**
`<input type="file" accept="image/*" capture="environment">` works in both WebViews — opens the native camera/photo sheet, given the permissions above. CSV import untouched. Optionally migrate receipt capture to `@capacitor/camera` later.

**e) Safe-area CSS — already handled.** Verify `viewport-fit=cover` in `index.html`; `env(safe-area-inset-*)` usage is comprehensive; Capacitor 8 SystemBars handles Android edge-to-edge under targetSdk 36. 16px inputs (iOS zoom prevention) carry over.

**f) Misc:** SPA `/*` redirect is web-only; native serves bundled files (fine — no router). `window.history.replaceState` is safe in the WebView.

---

## 4. OBD-II Bluetooth path on iOS

- **Plugin:** `@capacitor-community/bluetooth-le` — the most established Capacitor BLE plugin; scan/connect/GATT read/write/notify, central role only; also implements Web Bluetooth on the web platform, so the OBD feature can be developed in desktop Chrome and ship identical JS to iOS/Android.
- **Hardware constraint: BLE only, no Bluetooth Classic/SPP.** Most cheap ELM327 dongles are Classic (Android-only). Target **BLE dongles** — Vgate iCar Pro BLE 4.0, OBDLink CX, Veepeak BLE+ — exactly the ones marketed "for iPhone." Document supported dongles in-app.
- **Protocol:** ELM327 AT-command framing + PID parsing implemented in-app over GATT notify/write characteristics (typically an FFF0-style UART-like service; varies by dongle). Plan a `src/lib/obd.js` with an adapter per dongle family. The real engineering effort (1–2 weeks), not the plugin wiring.
- **iOS specifics:** `NSBluetoothAlwaysUsageDescription` mandatory; BLE does not work in the simulator; foreground use needs no background modes (add `bluetooth-central` only for screen-off logging later).
- **Strategic value:** the strongest Guideline 4.2 mitigation — provably impossible in Safari.

---

## 5. App Review rejection risks and mitigations (Apple)

| Risk | Likelihood | Mitigation |
|---|---|---|
| **4.2 Minimum functionality** | Moderate — classic wrapped-web-app rejection, but MotorLog bundles assets locally, app-like tab UI, camera capture, OCR | Ship v1.0 **with** native camera receipt scanning + native splash/status bar; ideally hold iOS submission until OBD-II BLE is in. Mention native features in Review Notes. Never load the remote site |
| **4.8 Sign in with Apple** | **None currently** — triggers only on third-party/social login; email/password with own account system is exempt. Google **Drive backup** OAuth is a service integration, not a login | If "Continue with Google" *login* is ever added, Sign in with Apple becomes required |
| **2.1 broken features** | Low | Dedicated `review@` demo account with seeded fleet data in App Review notes (signups are disabled) |
| **5.1.1 Privacy** | Low | Privacy policy URL + accurate labels; purpose strings that explain ("Scan service receipts") |
| **3.1.1 IAP** | Deferred to the subscriptions plan — any paid unlock inside the app must use IAP | — |
| **Export compliance** | None | `ITSAppUsesNonExemptEncryption=NO` |

Google Play risks are procedural: the 12-tester gate, Data Safety accuracy, target API 35+ (Capacitor 8 targets 36 — compliant through the Aug 31, 2026 deadline), account deletion for apps with sign-up.

---

## 6. Live updates (OTA web-bundle shipping)

- **Policy: explicitly legal on both stores** for what Capacitor does. Apple DPLA §3.3.2 permits downloaded interpreted code executed by WebKit provided it doesn't change the app's primary purpose, create a storefront, or bypass OS security. Google Play similarly permits JS/asset updates in webviews. Native-code changes always require store resubmission.
- **Appflow is dead.** Ionic stopped sales Feb 2025; existing customers run until Dec 31, 2027. Do not adopt.
- **Capgo is the de facto successor**: open-source `@capgo/capacitor-updater` + hosted service — Solo $12/mo (2,000 MAU), channels, rollback, e2e-encrypted bundles. **Self-hosted is free** (MIT plugin pointed at your own bundle URL — e.g. Netlify/Supabase Storage). Capawesome Cloud is the other credible option.
- **Recommendation:** skip OTA at first (24–72h Apple review is fine at personal scale); wire Capgo self-hosted if cadence gets painful.

---

## 7. Cost table

| Item | One-time | Annual |
|---|---|---|
| Apple Developer Program (Individual) | — | $99/yr |
| Google Play Console | $25 | — |
| D-U-N-S (only if org account wanted) | $0, slow | — |
| Mac + Xcode 26 | $0 (already on macOS) | annual upgrades |
| BLE OBD-II test dongle | $30–$80 | — |
| Capgo (optional) | — | $0 self-hosted / $144 Solo |
| **Total to ship both stores** | **~$55–105** | **~$99–245/yr** |

---

## 8. Timeline estimate (solo dev)

| Phase | Effort |
|---|---|
| Capacitor scaffold, icons/splash, on-device builds | 1–2 days |
| CapacitorHttp + NHTSA fix, auth storage adapter | 0.5–1 day |
| Google Drive OAuth → system browser + Universal/App Links | 1–2 days |
| Store assets, privacy labels, policies, delete-account fn | 1–2 days |
| TestFlight + Play internal shakeout | 2–4 days elapsed |
| **iOS first submission → approval** | **~2–3 weeks calendar** (budget one 4.2 resubmission) |
| **Android production** | gated by 14-day/12-tester closed test → **4–6 weeks calendar** |
| OBD-II BLE feature | 1–3 weeks engineering — ship as 1.1 |
| Ongoing | ~2–5 days/yr (Xcode/SDK bumps, Capacitor majors, Play API ratchet) |

**Sequencing:** start the Play closed test and Apple enrollment immediately (calendar-bound), do the three code changes, submit iOS with camera/receipt-OCR as the native story, land OBD-II BLE as the marquee 1.1.

---

## Sources

- Capacitor 8: https://ionic.io/blog/announcing-capacitor-8 · https://capacitorjs.com/docs/updating/8-0
- CapacitorHttp: https://capacitorjs.com/docs/apis/http
- BLE plugin: https://github.com/capacitor-community/bluetooth-le
- Supabase native deep-linking / session storage: https://supabase.com/docs/guides/auth/native-mobile-deep-linking · https://github.com/orgs/supabase/discussions/11548
- Apple 4.2: https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper · https://code2native.com/blog/pass-app-store-guideline-42-review
- Apple 4.8: https://appraysal.com/rules/4.8_sign_in_with_apple · https://9to5mac.com/2024/01/27/sign-in-with-apple-rules-app-store/
- Apple enrollment / D-U-N-S: https://developer.apple.com/help/account/membership/program-enrollment/
- Play 12-tester/14-day rule: https://support.google.com/googleplay/android-developer/answer/14151465 · https://www.testfi.app/blog/google-play-closed-testing-requirement-explained
- Play target API: https://support.google.com/googleplay/android-developer/answer/11926878 · https://developer.android.com/google/play/requirements/target-sdk
- OTA legality: https://bitrise.io/blog/post/what-app-stores-allow-with-ota-updates-apple-and-google-policy-explained · https://capgo.app/blog/ultimate-guide-to-app-store-compliant-ota-updates/
- Appflow shutdown: https://ionic.io/blog/important-announcement-the-future-of-ionics-commercial-products · https://capgo.app/blog/appflow-shutdown-alternative/
- Capgo: https://capgo.app/pricing/ · https://github.com/Cap-go/capacitor-updater
- iOS PWA limits / no Web Bluetooth: https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide · https://www.mobiloud.com/blog/progressive-web-apps-ios
