# GitPit signed APK setup

This repository now builds a signed release APK with package ID `com.gitpit.app`.
The signing key must be created only once and kept permanently. Losing it means
future APKs cannot update the installed GitPit app.

## 1. Create the key on Windows PowerShell

Run this where Java JDK is installed:

```powershell
keytool -genkeypair -v -keystore gitpit-upload-key.jks -alias gitpit -keyalg RSA -keysize 2048 -validity 10000
```

Choose and safely record the keystore/key password. Never upload the `.jks` file
to the repository.

## 2. Convert it to Base64

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("gitpit-upload-key.jks")) | Set-Clipboard
```

## 3. Add GitHub Actions secrets

Open repository `Settings > Secrets and variables > Actions > New repository secret`
and add these four secrets:

- `GITPIT_KEYSTORE_BASE64`: paste the Base64 value from the clipboard
- `GITPIT_KEYSTORE_PASSWORD`: the keystore password
- `GITPIT_KEY_ALIAS`: `gitpit`
- `GITPIT_KEY_PASSWORD`: the key password

Then open `Actions > Build Signed GitPit APK > Run workflow`.

## Installation rule

The old GitPit/debug app must be uninstalled once because it has a
different package/signature. Install the new signed GitPit APK. Every later
GitPit APK signed with the same key and a higher `versionCode` will update it
without uninstalling.
