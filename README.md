# Gallery App

A professional, full-featured mobile gallery application built with Ionic Angular and Capacitor for Android. Works like Google Photos with automatic media detection, smart albums, and professional UI.

## ✨ Key Features

### 📸 **Automatic Media Discovery**
- **First Launch Scanning**: Automatically scans entire device storage for photos and videos
- **No Manual Import**: Uses Android MediaStore API for native media access
- **Supported Formats**: 
  - Images: JPG, PNG, WebP, HEIC
  - Videos: MP4, MKV, MOV
- **Real-time Updates**: Automatically detects when new photos are taken or media is deleted

### 🔐 **Smart Permissions (Android 11+)**
- **Granular Permissions**:
  - READ_MEDIA_IMAGES (Android 13+)
  - READ_MEDIA_VIDEO (Android 13+)
  - READ_EXTERNAL_STORAGE (Legacy fallback)
- **User-Friendly Flow**: Graceful permission denial with explanation dialogs
- **Re-request Support**: Easy permission re-request when needed

### ⚡ **High Performance**
- **Fast Thumbnails**: 
  - Uses native Android thumbnail APIs
  - Local caching via Capacitor Preferences
  - Lazy loading with background queue
- **Optimized Grid**:
  - Batched loading (50 items per batch)
  - Scroll-based pagination
  - Efficient rendering with TrackBy
  - No UI thread blocking

### 📁 **Smart Albums**
- **Auto-Detection**: Automatically groups media into folders:
  - Camera
  - WhatsApp Images
  - Screenshots
  - Downloads
  - And all other device folders
- **Custom Albums**: Create and manage your own albums
- **Album Covers**: Automatically generated from first photo
- **Media Counts**: Shows number of items in each album

### 🎨 **Professional UI**
- **Modern Grid Layout**: Pinterest-style responsive grid
- **Video Support**: 
  - Video playback in fullscreen
  - Duration indicators
  - Play icons overlay
- **Fullscreen Viewer**:
  - Pinch-to-zoom support
  - Swipe left/right navigation
  - Media details overlay
  - Video playback controls
- **Stats Dashboard**: Total media, images, and videos count
- **Filter & Sort**:
  - Filter: All, Images Only, Videos Only
  - Sort: Date, Size, Name (ascending/descending)

### 💾 **Advanced Storage**
- **Indexed Queries**: Uses MediaStore indexed queries (no recursive scanning)
- **Thumbnail Cache**: Stores last 100 thumbnails for instant loading
- **Media Metadata**: Full metadata including date, size, dimensions, duration
- **Efficient Storage**: Only metadata cached, not full images

## Technology Stack

- **Framework**: Ionic 7 + Angular 19
- **Native**: Capacitor 5 with custom MediaStore plugin
- **Platform**: Android (API 22+, optimized for 11-14)
- **Language**: TypeScript 5.7 + Java
- **Architecture**: Clean architecture with service layers
- **Styling**: SCSS with Ionic Material Design

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

**Note**: Native features (MediaStore, Camera) require a real Android device.

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
│   │   ├── models/              # TypeScript interfaces
│   │   ├── pages/               # App pages/screens
│   │   │   ├── home/            # Main gallery view
│   │   │   ├── albums/          # Albums list
│   │   │   ├── album-detail/    # Individual album view
│   │   │   └── viewer/          # Fullscreen media viewer
│   │   ├── services/            # Business logic
│   │   │   ├── photo.service.ts # Legacy photo service
│   │   │   └── media.service.ts # New MediaStore service
│   │   ├── plugins/             # Custom Capacitor plugins
│   │   │   └── media-store.plugin.ts
│   │   └── app.*                # Root module and routing
│   ├── theme/                   # Ionic theme variables
│   └── global.scss              # Global styles
├── android/                     # Android native project
│   └── app/src/main/java/com/gallery/app/
│       ├── MainActivity.java
│       └── MediaStorePlugin.java  # Native MediaStore integration
├── www/                         # Built web assets (gitignored)
└── capacitor.config.json        # Capacitor configuration
```

## Permissions

The app requires the following Android permissions:

### Android 13+ (API 33+)
- `READ_MEDIA_IMAGES` - To read images from device
- `READ_MEDIA_VIDEO` - To read videos from device
- `CAMERA` - To take photos (optional)

### Android 5.1 to 12 (API 22-32)
- `READ_EXTERNAL_STORAGE` - To read media files
- `WRITE_EXTERNAL_STORAGE` - To save photos (API ≤32)
- `CAMERA` - To take photos (optional)

Permissions are requested at runtime when needed with user-friendly dialogs.

## Usage Guide

### First Launch
1. App prompts to scan device for media
2. Grant storage permissions
3. App automatically scans and displays all photos/videos
4. Albums are auto-generated from device folders

### Viewing Media
- Tap any photo/video to open fullscreen viewer
- Pinch to zoom on images
- Swipe left/right to navigate
- Videos play with native controls

### Filtering & Sorting
- Tap filter icon in header
- Choose: All Media, Images Only, or Videos Only
- Select sort option: Date, Name, or Size

### Albums
- Tap albums icon to view all folders
- Auto-detected folders show folder icon badge
- Custom albums show edit icon badge
- Create custom albums with "+" button

### Taking Photos
- Tap "+" button on home screen
- Select "Take Photo" to use camera
- Or "Scan Device Media" to refresh media library

## Architecture

### Native Layer (Java)
- **MediaStorePlugin**: Custom Capacitor plugin
  - Scans device media using ContentResolver
  - Generates thumbnails using MediaStore APIs
  - Observes media changes with ContentObserver
  - Handles permissions for Android 11+

### Service Layer (TypeScript)
- **MediaService**: Main media management
  - Handles MediaStore communication
  - Implements thumbnail caching
  - Manages media change listener
  - Provides filtered and sorted media
- **PhotoService**: Legacy support
  - Maintains custom albums
  - Handles camera integration

### UI Layer (Angular/Ionic)
- **HomePage**: Main gallery with virtual scrolling
- **AlbumsPage**: Shows auto and custom albums
- **ViewerPage**: Fullscreen viewer with gestures
- **Responsive Design**: Adapts to all screen sizes

## Performance Optimizations

1. **Lazy Loading**: Media loaded in batches of 50
2. **Thumbnail Queue**: Background loading prevents UI freeze
3. **TrackBy Function**: Efficient Angular change detection
4. **Native Thumbnails**: Uses Android's optimized thumbnail generation
5. **Content Observer**: Real-time updates without polling
6. **Scroll Detection**: Loads more as user scrolls
7. **Indexed Queries**: Direct MediaStore access (no file system scanning)

## Known Limitations

- Camera functionality only works on real Android devices
- Full-resolution images loaded on demand in viewer only
- Thumbnail cache limited to 100 most recent items
- Custom albums are app-local (not device-wide)

## Troubleshooting

### Build Errors
- Make sure all dependencies are installed: `npm install`
- Clear the build cache: `rm -rf www node_modules && npm install && npm run build`
- Sync Capacitor: `npx cap sync android`

### Permissions Not Working
- Check AndroidManifest.xml has all required permissions
- Ensure app has permissions granted in Android settings
- Try uninstalling and reinstalling the app

### Media Not Showing
- Ensure permissions are granted
- Try "Scan Device Media" from home screen
- Check if device has actual photos/videos
- Verify MediaStore is accessible

### Thumbnails Not Loading
- Check network/storage permissions
- Clear app cache in Android settings
- Thumbnails load in background, give it time

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please use the GitHub issue tracker.
