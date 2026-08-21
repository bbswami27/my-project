# GitPit Core v2

Clean rebuild branch. The legacy application is preserved on `legacy-v1.1.2`.

## Build order
1. Authentication and durable session
2. Registered contacts and native phonebook
3. One-to-one realtime messaging
4. Attachments
5. Audio/video calls
6. Status
7. Navigation and UI stabilization
8. Groups, Stranger Shield and screen sharing only after the core passes two-device tests

## Rules
- No legacy patch modules are imported into Core v2.
- One implementation per feature.
- PostgreSQL is authoritative for production sessions and registered users.
- APK is built only after the corresponding backend is deployed and verified.
