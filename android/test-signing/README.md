# TEST ONLY — never use for the Play Store

`tarantal-test.p12` signs the **friends' test APK** (D-058) so every new build installs over the
previous one. Its passwords are public (in `android/app/build.gradle`): anyone can sign an APK
with this key, so it proves nothing about who made a build.

- Store: PKCS12, password `tarantal-test-only`; key alias `tarantal-test`, same password.
- Certificate: `CN=Tarantal Madness TEST ONLY`, RSA 2048, valid until 2054.
  SHA-256 fingerprint `5F:21:9E:F7:A0:BD:E8:60:DD:15:F8:B0:15:BD:05:3B:4A:23:90:01:EE:3F:59:4A:E6:D0:ED:32:24:51:AB:F0`.

A Play Store release uses a different, **private** upload key that the product owner creates and
keeps outside the repository (docs/ANDROID-TEST-APP.md §3). Never commit that key, and never
upload an app signed with this one to a store.
