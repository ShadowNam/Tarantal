# Tarantal Madness — Android test app

Status: 1.9.5 · 28 Oct 2026 · D-058. Architecture: Tech §8.5.

The Android app is the web game inside a Capacitor shell. It is a **test build for friends**,
installed from a link ("sideloaded"), not from a store. Every picture and sound (Standard and HD)
is inside the APK, so after installing it plays offline.

## 1. For friends: installing the app

1. On your Android phone, open **https://shadownam.github.io/Tarantal/android/** and tap
   **Download the app (APK)** (about 30 MB).
2. Open the downloaded file (tap the download notification, or find it in **Files → Downloads**).
3. Android asks whether to allow installing apps from this source (your browser or file manager):
   allow it, go back, and tap **Install**. (Play Protect may warn that the app is unknown: it is a
   test build that is not in the store. Tap *More details → Install anyway*.)
4. Open **Tarantal Madness** from your home screen or app drawer.

**Updating:** download the newer APK from the same page and install it over the old one. Your
progress is kept. (Uninstalling, or *Settings → Apps → Tarantal Madness → Storage → Clear
storage*, deletes your progress.)

**In the app:** it always plays in landscape, full screen. Swipe from an edge to see the system
bars for a moment. The back button pauses a hunt, resumes from the pause menu, and goes back in
menus; on the title screen it sends the app to the background.

There is no iPhone app yet; iPhone players use Safari and *Add to Home Screen*.

## 2. Where builds come from

| What | Where |
| --- | --- |
| The APK of every push to `main` | `https://shadownam.github.io/Tarantal/android/tarantal-madness.apk` (page: `/android/`) |
| The APK of a pull request | label the PR `android`; Actions → *Android test app* → the run → artifact `tarantal-madness-<version>.apk` (14 days) |
| A manual build | Actions → *Android test app* → *Run workflow* |

The APK is built only on GitHub's runners (`.github/workflows/android.yml`): nobody needs the
Android SDK, Java or Gradle on their own machine. Locally, `npm run build:android` makes
`dist-android/` and copies it into `android/` (`npx cap sync android`, no SDK needed); with
Android Studio installed, *Open* the `android/` folder to run it on a phone.

**Version:** the app's versionName is `package.json`'s version; versionCode is
MAJOR·10000 + MINOR·100 + PATCH (1.9.5 → 10905), so each release installs over the one before.
A build of the same version (e.g. two PR builds) has the same versionCode: Android installs it
over the other only as a reinstall (same or higher code), which works because the key is the same.

**Signing (test only):** every test APK is signed with the committed key in
`android/test-signing/` (its passwords are in `android/app/build.gradle`). That is what lets
updates install over each other. Because the key is public, it proves nothing about who built an
APK: share the link only with friends, and never upload such an APK to a store.

## 3. Later: a Play Store release (the product owner)

These steps need the product owner's own accounts and keys; nothing here is done by CI yet.

1. **Google Play developer account:** create one at the Play Console (one-time registration fee,
   identity verification). New personal accounts must run a *closed test* with a group of
   testers for a while before production access: friends can be those testers.
2. **A private upload key:** generate it once on your own computer, e.g.
   `keytool -genkeypair -v -keystore tarantal-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`.
   Keep the file and its passwords in a password manager and a backup. **Never commit it**, never
   paste it into an issue or chat. For CI, store it as GitHub Actions secrets (the keystore as
   base64, its passwords) and add a separate release signing config that reads them; the test key
   stays for friends' builds.
3. **Play App Signing:** Google keeps the app signing key; you sign uploads with your upload key.
   If the upload key is lost, Google can reset it.
4. **An App Bundle, not an APK:** the store takes `.aab` files: `./gradlew bundleRelease` in
   `android/` (a store workflow would upload `app-release.aab`). Bundles above Play's base-size
   limit would need Play Asset Delivery for the art; today's app (~30 MB) is well under it.
5. **A new application id is not needed:** `na.tarantal.madness` can stay. But an app signed with
   the test key and one from the Play Store cannot update each other: testers uninstall the test
   app once (progress is local to each app).
6. **Store listing:** the name, a short and a full description (no real brand names), the icon
   (512 × 512), a feature graphic (1024 × 500), phone screenshots in landscape, the content rating
   questionnaire, the target audience, the data-safety form (the game sends no personal data; the
   save stays on the phone) and a privacy policy URL (the in-game privacy page can be published on
   Pages).
7. **Target API level:** Google Play requires a recent `targetSdkVersion` (see
   `android/variables.gradle`; Capacitor's updates raise it).

Out of scope until then: ads, in-app purchases, any store upload.
