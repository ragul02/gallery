# Gallery App

A full-featured mobile gallery application built with Ionic Angular and Capacitor for Android.

## Features

### 📸 Photo Management
- **Capture Photos**: Take photos directly using your device camera
- **Import Photos**: Select photos from your device gallery
- **View Photos**: Browse all your photos in a beautiful grid layout
- **Delete Photos**: Remove unwanted photos permanently
- **Photo Details**: View metadata like capture date

### 📁 Album Organization
- **Create Albums**: Organize photos into custom albums
- **Album Management**: Create, view, and delete albums
- **Add to Album**: Organize photos by adding them to albums
- **Remove from Album**: Remove photos from albums without deleting them
- **Album Cover**: Automatically set album covers from the first photo

### 🔄 Sorting Options
Sort your photos by:
- **Date (Newest First)**: Default - most recent photos first
- **Date (Oldest First)**: Oldest photos first
- **Name (A-Z)**: Alphabetical order
- **Name (Z-A)**: Reverse alphabetical order
- **Size (Largest First)**: Biggest files first
- **Size (Smallest First)**: Smallest files first

### 💾 Storage
- Photos are stored locally using Capacitor Filesystem
- Persistent storage using Capacitor Preferences
- Photos survive app restarts

## Technology Stack

- **Framework**: Ionic 7 + Angular 17
- **Native**: Capacitor 5
- **Platform**: Android
- **Language**: TypeScript
- **Styling**: SCSS with Ionic components

## Prerequisites

- Node.js (v20 or higher)
- npm (v10 or higher)
- Android Studio (for building APK)
- Java JDK 17 or higher (for Android builds)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd gallery
```

2. Install dependencies:
```bash
npm install
```

3. Build the web assets:
```bash
npm run build
```

4. Sync Capacitor:
```bash
npx cap sync android
```

## Development

### Run in Browser (for development)
```bash
npm start
```
Then open http://localhost:4200 in your browser.

**Note**: Camera functionality requires a real device; it won't work in the browser.

### Run on Android Device/Emulator

1. Build the web assets:
```bash
npm run build
```

2. Sync with Android:
```bash
npx cap sync android
```

3. Open in Android Studio:
```bash
npx cap open android
```

4. In Android Studio, click "Run" to install on connected device or emulator.

## Building APK

### Debug APK
```bash
cd android
./gradlew assembleDebug
```
The APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

### Release APK
```bash
cd android
./gradlew assembleRelease
```
The APK will be at: `android/app/build/outputs/apk/release/app-release.apk`

**Note**: For release builds, you need to configure signing in `android/app/build.gradle`

## Project Structure

```
gallery/
├── src/
│   ├── app/
│   │   ├── models/           # TypeScript interfaces
│   │   ├── pages/            # App pages/screens
│   │   │   ├── home/         # Main gallery view
│   │   │   ├── albums/       # Albums list
│   │   │   └── album-detail/ # Individual album view
│   │   ├── services/         # Business logic
│   │   │   └── photo.service.ts
│   │   ├── app.component.*   # Root component
│   │   ├── app.module.ts     # Root module
│   │   └── app-routing.module.ts
│   ├── theme/                # Ionic theme variables
│   ├── global.scss           # Global styles
│   └── index.html            # Entry HTML
├── android/                  # Android native project
├── www/                      # Built web assets
├── capacitor.config.json     # Capacitor configuration
├── angular.json              # Angular CLI configuration
└── package.json              # Dependencies
```

## Permissions

The app requires the following Android permissions:
- `CAMERA` - To take photos
- `READ_EXTERNAL_STORAGE` - To read photos from gallery
- `WRITE_EXTERNAL_STORAGE` - To save photos (Android 12 and below)
- `READ_MEDIA_IMAGES` - To read images (Android 13+)

Permissions are requested at runtime when needed.

## Usage Guide

### Taking Photos
1. Tap the "+" floating action button on the home screen
2. Select "Take Photo" to use camera or "Choose from Gallery" to import
3. Photo will appear in the gallery

### Creating Albums
1. Tap the albums icon in the header
2. Tap the "+" button
3. Enter album name and tap "Create"

### Adding Photos to Albums
1. From the main gallery, tap on a photo
2. Select "Add to Album"
3. Choose the album

### Sorting Photos
1. Tap the filter icon in the header
2. Select your preferred sorting option

### Deleting Photos
1. Tap on a photo
2. Select "Delete"
3. Confirm deletion

## Known Limitations

- Camera functionality only works on real Android devices
- Photos are stored locally (no cloud sync)
- No photo editing features (this is a gallery/organizer app)

## Troubleshooting

### Build Errors
- Make sure all dependencies are installed: `npm install`
- Clear the build cache: `rm -rf www node_modules && npm install && npm run build`
- Sync Capacitor: `npx cap sync android`

### Camera Not Working
- Ensure you're testing on a real device (not browser/emulator without camera)
- Check that camera permissions are granted in Android settings

### Photos Not Persisting
- Check browser/device storage permissions
- Ensure the app has storage permissions granted

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
