# Wi-Fi Cartographer Android source branch

This branch is reserved for the native Android app source for Wi-Fi Cartographer.

The Android project is intended to live in a standalone repository named `wifi-cartographer-android`. Until that repository exists, use this branch as the handoff point for the source tree and APK workflow.

Build command once the source tree is present:

```bash
./gradlew test assembleDebug
```
