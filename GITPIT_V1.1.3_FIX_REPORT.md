# GitPit v1.1.3 Fix Report

## Corrected

- Removed production startup code that deleted the synced phonebook and forced four demo contacts back into every installation.
- Restored the mobile sidebar whenever Chats, Status or Calls is selected from bottom navigation, so upper filters remain usable.
- Replaced fragile inline handlers for chat attachments and status media/text publishing with single JavaScript event bindings.
- Enabled the existing authenticated status API/media upload reliability module in the packaged runtime.
- Converted the three-dot menu to one continuous, touch-scrollable list.
- Kept GitPit Meetings removed by the production cleanup module.
- Kept Anti-Fraud Stranger Shield controls removed from Privacy & Security by the production cleanup module.
- Added 10 selectable modern app themes.
- Updated Android version to `1.1.3` (`versionCode 13`).

## Validation completed

- ZIP integrity verified.
- JavaScript syntax checks passed for client and backend files.
- UI regression checks passed.
- Isolated staging tests passed for authentication, two-user contact matching, durable message flow, blocking, backup/restore and logout.
- Capacitor Android sync completed and the corrected `public` assets were copied into Android.

## Deployment requirement

Cross-device messages, status and calls use the Node/Socket.IO backend in this same source package. Deploy the updated backend before testing the APK. WebRTC includes STUN; reliable calls across restrictive mobile networks require valid TURN credentials in the deployment environment.

## Build note

The included GitHub Actions workflow builds `GitPit-v1.1.3.apk`. A fresh APK was not produced in the audit environment because its Gradle distribution download was network-blocked; the older cached APK was deliberately excluded to prevent accidental installation.
