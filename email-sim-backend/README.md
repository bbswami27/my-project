# GitPit email/password reset deployment candidate

This independent Node backend matches the previously supplied GitPit v1.1.0 PASSWORD6 EMAIL-SIM Android candidate (`com.gitpit.app`). It does not modify the repository's v1.1.3 client, Android package, startup scripts or legacy backend. Do not run the legacy root `server-bootstrap.js` for this candidate.

## GitHub upload

The connected GitHub integration rejected branch creation with HTTP 403. No branch, commit or deployment was created. In GitHub, create codex/email-reset-candidate from main, choose Add file > Upload files, and upload the extracted email-sim-backend folder at the repository root. Commit only to that branch.

## Render settings after deployment approval

- Repository: bbswami27/my-project
- Branch: codex/email-reset-candidate
- Root Directory: email-sim-backend
- Build Command: npm ci --omit=dev
- Start Command: npm start
- Health Check Path: /health
- Node: 22 (NODE_VERSION=22); NODE_ENV=production
- Keep DATABASE_URL, AUTH_PEPPER (at least 32 characters), RESEND_API_KEY and EMAIL_FROM in Render environment secrets. Never put their values in GitHub.

Prefer a separate staging service and empty staging PostgreSQL database. Changing the existing service's branch/root switches its authentication protocol and prevents legacy clients from signing in. Back up the existing database before any such switch. No production deployment or database migration has been performed by this change.

## Verification sequence

1. GET /api/health must return JSON with version 1.1.0-security-candidate and PostgreSQL (Durable).
2. GET /api/auth/config must report emailEnabled=true. That only checks configuration presence, not actual email delivery.
3. In the matching Android candidate, create a NEW email account with a mobile number and a password of at least six characters. When using onboarding@resend.dev, use the Resend account owner's email for delivery testing.
4. Enter the actual emailed verification code. An onboarding session is expected; chat must remain locked without a working SIM provider.
5. Use Forgot password for that newly registered email, enter the fresh emailed code and a new password (minimum six characters). Verify old password fails and new password succeeds to onboarding.
6. Check Render and Resend logs if delivery fails; redact tokens, codes and addresses before sharing logs.

Old cp_users accounts/passwords are NOT migrated into gp_auth_accounts. Reset only sends a code for an account in the new auth store. Unknown addresses receive a generic response without an email; do not mistake this for successful delivery. Existing users and message ownership need a separately reviewed migration before rollout.

## Scope and unresolved work

- Email verification, password reset, scrypt passwords, device-signed requests and revocation are implemented. Minimum password length is six characters, not digits only.
- SMS/test OTP bypasses are retired. Email sessions alone cannot access chat APIs or sockets.
- SIM verification is an adapter contract, NOT a working carrier integration. SIM_BROKER_URL/SIM_BROKER_TOKEN plus a corresponding Android SimProofProvider implementation are required. A SIM-present flag or manually entered OTP is not proof that the registered SIM and app are on the same device.
- Google login requires separate OAuth configuration.
- This backend exposes an informational landing page; the secure UI is in the matching Android APK. The legacy web client is not supported by this candidate.
- Database startup requires TLS verification; diagnose connection errors instead of disabling certificate checks on a public connection.
- Legacy chat persistence and UI audit findings remain. This is not a production-ready release.

## Validation

Run npm ci --include=dev and npm test from this directory. 28 local tests passed, including a six-character registration/login/reset case, old-password rejection, recovery code replay rejection, signed API checks, socket authorization and revocation. Provider tests use synthetic fixtures and an in-memory store. Real PostgreSQL, Resend delivery, Google and physical SIM verification have not been validated in this environment.
