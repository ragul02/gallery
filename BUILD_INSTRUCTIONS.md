# Build Instructions

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Build Web Assets
```bash
npm run build
```

### 3. Sync Android Platform
```bash
npx cap sync android
```

### 4. Open in Android Studio
```bash
npx cap open android
```

### 5. Run on Device
- Connect an Android device via USB (with USB debugging enabled)
- OR start an Android emulator
- In Android Studio, click the "Run" button (green play icon)

## Build APK

### Debug APK (for testing)
```bash
cd android
./gradlew assembleDebug
```
Output: `android/app/build/outputs/apk/debug/app-debug.apk`

### Release APK (for distribution)
```bash
cd android
./gradlew assembleRelease
```
Output: `android/app/build/outputs/apk/release/app-release.apk`

**Note**: Release builds require signing configuration. See [Android documentation](https://developer.android.com/studio/publish/app-signing) for details.

## Development Workflow

### Web Development (Fast Iteration)
```bash
npm start
```
- Opens at http://localhost:4200
- Hot reload on file changes
- Camera won't work (requires native platform)

### Native Development (Full Features)
```bash
npm run build
npx cap sync android
npx cap open android
```
- Run from Android Studio
- All features work including camera
- Slower iteration

## Common Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm start` | Dev server (web only) |
| `npm run build` | Build for production |
| `npx cap sync android` | Sync web assets to Android |
| `npx cap open android` | Open in Android Studio |
| `npx cap update` | Update Capacitor dependencies |

## Requirements

- **Node.js**: v20+ 
- **npm**: v10+
- **Android Studio**: Latest version
- **JDK**: 17+
- **Android SDK**: API 22+ (minimum), API 33+ (recommended)

## Troubleshooting

### "Command not found: ionic" or similar
```bash
npm install -g @ionic/cli
```

### Build fails with Gradle errors
```bash
cd android
./gradlew clean
cd ..
npx cap sync android
```

### Camera permissions not working
- Ensure app has camera permissions in Android settings
- Test on a real device (emulator may not have camera)

### Changes not reflected in app
```bash
npm run build
npx cap sync android
# Then rebuild in Android Studio
```
