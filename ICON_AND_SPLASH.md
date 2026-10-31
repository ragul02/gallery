# Android app icon and splash screen

The launcher icon and Android launch splash screen are generated from the source image at `assets/icon.png` with the project dependency `@capacitor/assets`.

## Regenerate the Android assets

1. Replace `assets/icon.png` with the new square PNG artwork. Keep the source image at least 1024 × 1024 pixels.
2. From the project root, run:

   ```powershell
   npx @capacitor/assets generate --android --assetPath assets --iconBackgroundColor '#ffffff' --iconBackgroundColorDark '#ffffff' --splashBackgroundColor '#ffffff' --splashBackgroundColorDark '#ffffff' --logoSplashScale 0.28
   ```

3. Build and install the Android app. A launcher may cache the previous icon briefly; reinstalling the app or refreshing the launcher usually updates it.

## Generated files

The generator writes Android launcher icon sizes and adaptive icon layers under `android/app/src/main/res/mipmap-*`, and splash-screen images for portrait, landscape, and dark mode under `android/app/src/main/res/drawable*/`.

The Android manifest already points to `@mipmap/ic_launcher` and `@mipmap/ic_launcher_round`. The launch theme in `android/app/src/main/res/values/styles.xml` uses `@drawable/splash`.

The generation command used `--android`, so it did not generate iOS or PWA assets. Add `--ios` or `--pwa` in a project that has those platforms configured if you later want their icon and splash assets too.
