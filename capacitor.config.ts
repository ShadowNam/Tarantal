// Capacitor wraps the `npm run build:android` web build (dist-android/) into the Android test app
// (D-058, docs/ANDROID-TEST-APP.md). No server URL: every file is inside the APK.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'na.tarantal.madness',
  appName: 'Tarantal Madness',
  webDir: 'dist-android',
  android: {
    // The game draws its own Karoo background colour while it loads.
    backgroundColor: '#2b1d12',
    // Debug builds may be inspected from desktop Chrome (chrome://inspect); release builds not.
    webContentsDebuggingEnabled: false,
  },
  plugins: {},
};

// Default export is required by the Capacitor CLI (config files are exempt from the named-exports rule).
export default config;
