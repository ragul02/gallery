# Gallery App - Architecture Documentation

## Overview
This is an Ionic Angular mobile application using Capacitor for native Android functionality. The app follows a component-based architecture with service-oriented business logic.

## Technology Stack

### Frontend Framework
- **Ionic Framework 7**: UI components and mobile-first design
- **Angular 17**: Application framework and structure
- **TypeScript 5.2**: Type-safe programming language
- **SCSS**: Styling with Ionic theming

### Native Platform
- **Capacitor 5**: Native runtime and plugin system
- **Android**: Target platform (API 22+)

### Key Plugins
- **@capacitor/camera**: Camera and photo library access
- **@capacitor/filesystem**: Local file storage
- **@capacitor/preferences**: Key-value storage for metadata

## Architecture Patterns

### 1. Module-Based Architecture
```
AppModule (Root)
├── HomePageModule (Lazy loaded)
├── AlbumsPageModule (Lazy loaded)
└── AlbumDetailPageModule (Lazy loaded)
```

### 2. Service Layer
**PhotoService** (Singleton)
- Single source of truth for photo and album data
- Handles all CRUD operations
- Manages local storage
- Integrates with native camera and filesystem

### 3. Routing
```
/home          → HomePage (Main gallery)
/albums        → AlbumsPage (Albums list)
/album/:id     → AlbumDetailPage (Album contents)
```

## Project Structure

```
gallery/
├── src/
│   ├── app/
│   │   ├── models/                    # TypeScript interfaces
│   │   │   └── gallery.model.ts       # Photo, Album, SortType
│   │   ├── pages/                     # Feature pages
│   │   │   ├── home/                  # Main gallery view
│   │   │   │   ├── home.page.ts       # Component logic
│   │   │   │   ├── home.page.html     # Template
│   │   │   │   ├── home.page.scss     # Styles
│   │   │   │   ├── home.module.ts     # Module
│   │   │   │   └── home-routing.module.ts
│   │   │   ├── albums/                # Albums list
│   │   │   │   └── [similar structure]
│   │   │   └── album-detail/          # Single album view
│   │   │       └── [similar structure]
│   │   ├── services/
│   │   │   └── photo.service.ts       # Business logic
│   │   ├── app.component.*            # Root component
│   │   ├── app.module.ts              # Root module
│   │   └── app-routing.module.ts      # App-level routing
│   ├── theme/
│   │   └── variables.scss             # Ionic theme variables
│   ├── global.scss                    # Global styles
│   ├── index.html                     # Entry HTML
│   └── main.ts                        # Bootstrap
├── android/                           # Native Android project
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── AndroidManifest.xml    # Permissions & config
│   │   │   ├── java/                  # Native Java code
│   │   │   └── res/                   # Android resources
│   │   └── build.gradle               # App-level Gradle
│   ├── build.gradle                   # Project-level Gradle
│   └── [Gradle wrapper files]
├── www/                               # Built web assets (gitignored)
├── capacitor.config.json              # Capacitor configuration
├── angular.json                       # Angular CLI config
├── tsconfig.json                      # TypeScript config
└── package.json                       # Dependencies
```

## Data Flow

### Photo Capture Flow
```
User clicks "+" button
    ↓
HomePage shows action sheet
    ↓
User selects "Take Photo" or "Choose from Gallery"
    ↓
PhotoService.addNewPhoto() or addFromGallery()
    ↓
Capacitor Camera plugin opens camera/gallery
    ↓
Photo captured/selected
    ↓
PhotoService.savePicture() saves to filesystem
    ↓
Photo metadata saved to Preferences
    ↓
UI refreshes with new photo
```

### Album Management Flow
```
User creates album
    ↓
AlbumsPage → PhotoService.createAlbum()
    ↓
Album saved to Preferences
    ↓
User adds photo to album
    ↓
HomePage → PhotoService.addPhotoToAlbum()
    ↓
Photo's albumId updated
    ↓
Metadata saved to Preferences
```

### Sorting Flow
```
User clicks sort button
    ↓
Action sheet with sort options displayed
    ↓
User selects sort type
    ↓
Component updates currentSort
    ↓
loadPhotos() called with new sort type
    ↓
PhotoService.getPhotos(sortType)
    ↓
PhotoService.sortPhotos() applies sorting logic
    ↓
UI updates with sorted photos
```

## Data Models

### Photo Interface
```typescript
interface Photo {
  id: string;              // Unique identifier (filename)
  filepath: string;        // Path in filesystem
  webviewPath?: string;    // Data URL for display
  base64?: string;         // Base64 encoded data
  name: string;            // Display name
  dateTaken: Date;         // Capture timestamp
  size?: number;           // File size in bytes
  albumId?: string;        // Reference to album
}
```

### Album Interface
```typescript
interface Album {
  id: string;              // Unique identifier
  name: string;            // Display name
  createdDate: Date;       // Creation timestamp
  coverPhoto?: string;     // Path to cover image
  photoCount: number;      // Number of photos
}
```

### SortType Enum
```typescript
enum SortType {
  DATE_DESC = 'date_desc',
  DATE_ASC = 'date_asc',
  NAME_ASC = 'name_asc',
  NAME_DESC = 'name_desc',
  SIZE_DESC = 'size_desc',
  SIZE_ASC = 'size_asc'
}
```

## Storage Architecture

### Filesystem Storage (Capacitor Filesystem)
- **Location**: `Directory.Data`
- **Content**: Actual photo files (JPEG)
- **Naming**: Timestamp-based (e.g., `1640000000000.jpeg`)

### Preferences Storage (Capacitor Preferences)
- **Key**: `photos` → Array of Photo metadata (excluding base64)
- **Key**: `albums` → Array of Album metadata
- **Format**: JSON stringified objects

### Data Persistence Strategy
1. Photos and albums loaded on service initialization
2. Changes immediately persisted to Preferences
3. File operations use Capacitor Filesystem
4. Data survives app restarts

## Component Responsibilities

### HomePage
- Display all photos in grid
- Handle photo addition (camera/gallery)
- Show photo action menu
- Implement sorting UI
- Navigate to albums

### AlbumsPage
- Display all albums in grid
- Handle album creation
- Show album actions
- Navigate to album details

### AlbumDetailPage
- Display photos in specific album
- Handle photo removal from album
- Implement album-specific sorting
- Handle photo deletion

### PhotoService
- All data operations
- Camera integration
- Filesystem operations
- Storage persistence
- Business logic

## Build & Deployment

### Development Build
```
npm run build → Angular production build
npx cap sync android → Copy to Android project
```

### Debug APK
```
cd android
./gradlew assembleDebug
```
Output: `android/app/build/outputs/apk/debug/app-debug.apk`

### Release APK
```
cd android
./gradlew assembleRelease
```
Output: `android/app/build/outputs/apk/release/app-release.apk`

## Native Integration

### Android Permissions (AndroidManifest.xml)
- `CAMERA`: Camera access
- `READ_EXTERNAL_STORAGE`: Read photos
- `WRITE_EXTERNAL_STORAGE`: Write photos (API ≤32)
- `READ_MEDIA_IMAGES`: Read media (API ≥33)

### Capacitor Configuration (capacitor.config.json)
```json
{
  "appId": "com.gallery.app",
  "appName": "Gallery",
  "webDir": "www",
  "server": {
    "androidScheme": "https"
  }
}
```

## State Management

### Current Approach
- Service-based state (PhotoService as singleton)
- Component-level state for UI (currentSort, etc.)
- Persistent storage via Capacitor Preferences

### Data Synchronization
- Service loads data on initialization
- Components refresh data on view enter (ionViewWillEnter)
- Immediate persistence after mutations

## Performance Considerations

### Bundle Optimization
- Lazy loading of page modules
- Tree shaking in production builds
- Minification and compression

### Image Handling
- Photos stored as base64 in memory
- Filesystem storage for persistence
- Efficient grid rendering with *ngFor

### Build Size
- Initial bundle: ~463 KB
- Lazy chunks for each page
- Total production build: < 1 MB

## Testing Strategy

### Manual Testing
1. Test on real Android device (camera requires hardware)
2. Verify photo capture and import
3. Test album creation and management
4. Verify sorting functionality
5. Test data persistence (restart app)

### Testing Checklist
- [ ] Take photo with camera
- [ ] Import photo from gallery
- [ ] Create album
- [ ] Add photo to album
- [ ] Remove photo from album
- [ ] Delete photo
- [ ] Delete album
- [ ] Test all sort options
- [ ] Verify data persistence

## Future Enhancements (Not Implemented)

Potential features for future development:
- Photo editing (crop, rotate, filters)
- Cloud sync (Firebase, AWS)
- Photo sharing
- Search functionality
- Bulk operations
- Photo metadata (EXIF)
- Video support
- Gesture controls (swipe, pinch-to-zoom)
- Dark mode
- Custom album covers
- Photo favorites/starring
- Trash/recycle bin

## Troubleshooting

### Common Issues

**Build Fails**
- Run `npm install` to ensure dependencies
- Run `npm run build` before syncing
- Check Node.js version (v20+)

**Camera Not Working**
- Must test on real device
- Check permissions in Android settings
- Verify AndroidManifest.xml has camera permissions

**Photos Not Persisting**
- Check storage permissions
- Verify Capacitor Preferences plugin installed
- Check browser console for errors (dev mode)

**Android Build Issues**
- Ensure Android Studio installed
- Ensure JDK 17+ installed
- Run `cd android && ./gradlew clean`

## Dependencies

### Core Dependencies
- @ionic/angular: ^7.8.6
- @angular/core: ^17.3.12
- @capacitor/core: ^5.7.8
- @capacitor/camera: ^5.0.10
- @capacitor/filesystem: ^5.2.2
- @capacitor/preferences: ^5.0.8

### Dev Dependencies
- @angular/cli: ^17.3.17
- @angular/compiler-cli: ^17.3.12
- @ionic/angular-toolkit: ^11.0.1
- typescript: 5.2

## Version Information

- **App Version**: 1.0.0
- **Ionic**: 7.8.6
- **Angular**: 17.3.12
- **Capacitor**: 5.7.8
- **Node.js**: 20.20.0 (recommended)
- **Target Android SDK**: API 33
- **Min Android SDK**: API 22 (Android 5.1)

## License

MIT License
