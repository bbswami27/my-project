# GitPit 1.1.4 repair candidate — 27 November 2026

Based on the supplied latest production repair branch. Original archive unchanged. Android application ID com.chatterpatter.app retained; version code 14. No production access or deployment performed.

## Changes
- Retained previous OTP gateway, bypass removal, account protection, Firebase modular SDK and dependency patches.
- Added India-only mobile validation, exact normalized phone matching, verified contact matching, authenticated contact endpoints, protected profile identity fields.
- Socket join now requires a valid session token; event middleware checks sessions. Direct messages use authenticated sender, resolved verified recipient, participant rooms and duplicate ID protection. History is participant-scoped. Removed global call fallback; call signaling is restricted to paired sockets.
- Removed backend source copies from public web directory, removed public admin user listing, unknown API GET returns JSON 404. Disabled legacy email authentication, Google remains disabled, and destructive message edit/delete endpoints return 501 pending secure implementation. Group messaging and server AI replies are not implemented in the new direct-message path. Typing/presence and group/status realtime updates need further work.
- Wait for database initialization; production refuses startup without PostgreSQL. Hydrate OTP counters and push tokens, correct message hydration fields, load all stored messages, add push unregister and atomic local JSON replacement. Existing PostgreSQL writes remain asynchronous; not a transactional durability guarantee. Existing sessions are hydrated by bootstrap. No destructive migration executed.
- TURN configuration endpoint and client refresh added. Actual TURN relay, FCM, Fast2SMS and R2 credentials/service behavior not tested. Offline calls only notify and reject; no full offline call recovery.
- Cache revision and Android version increment. Render blueprint disables auto deploy; existing dashboard settings are NOT changed.

## Executed checks
- Node 22 syntax checks on backend, services and public JS: passed.
- Existing UI static regression suite: passed.
- New isolated local HTTP test: OTP reuse and attempt limit, cooldown record, failed unconfigured SMS, test-login rejection, anonymous contact rejection, admin listing removal, sender spoof prevention, duplicate message ID and third-party history isolation: passed.
- No live SMS, real PostgreSQL, Socket.IO multi-device integration, Android build, Google login, R2, FCM or cross-network call test performed. Android SDK unavailable. Dependency audit not rerun against registry; supplied lockfile retained.

## Deployment gate — do not deploy this candidate to production yet
1. Recover old PostgreSQL database or obtain provider backup. Export live JSON if accessible. Source archive contains only empty seed data; not a live backup. Do not restart current ephemeral service until recovery options reviewed.
2. Use separate staging service and separate PostgreSQL database restored from an authorized backup. Set start command `npm start` (not `node server.js`) to enable bootstrap. Set NODE_ENV=production and DATABASE_URL. Disable auto deploy in existing Render dashboard before any production branch changes.
3. Configure SMS, FCM, R2 and TURN secrets in staging only. Current client defaults to existing production URL except localhost:3001; change client API base to staging URL before building staging APK. Review hardcoded URLs across runtime scripts.
4. Run `npm ci`, `npm run test:ui`, `node test_local_repair.js`. Run `npm run prepare-client`, `npx cap sync android`, then `android\\gradlew.bat :app:assembleDebug` on Windows with Android SDK/JDK configured. Do not overwrite existing installed signed app with incompatible signing key.
5. Complete remaining security and functional work: transactional writes and migration tests, session revocation, email/Google verified linking, group authorization, private media access, rate limiting across instances, push token ownership, call signaling integration, message edit/delete, presence, two-device tests. No claim of production readiness or end-to-end encryption.

ZIP excludes dependencies, git metadata, local database and build output. Reinstall dependencies from lockfile. Firebase Android client configuration retained; no service account private key included.
