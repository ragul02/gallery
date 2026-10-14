# Gallery App - Android Permissions Fix

## Problem
The gallery app was not properly requesting media permissions on Android 13-17, preventing it from accessing photos and videos from device storage.

## Root Cause
The custom `MediaStorePlugin` had three critical issues:

1. **Sequential Permission Requests**: The plugin requested `READ_MEDIA_IMAGES` and `READ_MEDIA_VIDEO` permissions **sequentially** instead of together. When the first permission was requested, the method would return before requesting the second one.

2. **OR Logic Instead of AND**: The `hasRequiredPermissions()` and `buildPermissionResult()` methods used OR (`||`) logic, meaning the app would proceed if it had EITHER images OR video permission, not both.

3. **Separate Permission Aliases**: The permissions were defined as separate aliases (`"images"` and `"video"`), which caused Capacitor to request them one at a time.

## Solution Applied

### 1. Updated Permission Annotation (`MediaStorePlugin.java`)
**Before:**
```java
@CapacitorPlugin(
    name = "MediaStore",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = "storage"),
        @Permission(strings = { Manifest.permission.READ_MEDIA_IMAGES }, alias = "images"),
        @Permission(strings = { Manifest.permission.READ_MEDIA_VIDEO }, alias = "video")
    }
)
```

**After:**
```java
@CapacitorPlugin(
    name = "MediaStore",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = "storage"),
        @Permission(
            strings = { 
                Manifest.permission.READ_MEDIA_IMAGES, 
                Manifest.permission.READ_MEDIA_VIDEO 
            }, 
            alias = "media"
        )
    }
)
```

**Why**: Grouping both permissions under a single alias `"media"` makes Capacitor request them together in one permission dialog.

### 2. Fixed `requestPermissions()` Method
**Before:**
```java
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
    if (!hasMediaPermission(Manifest.permission.READ_MEDIA_IMAGES)) {
        requestPermissionForAlias("images", call, "permissionsCallback");
        return;  // ❌ Returns before requesting video permission!
    }
    if (!hasMediaPermission(Manifest.permission.READ_MEDIA_VIDEO)) {
        requestPermissionForAlias("video", call, "permissionsCallback");
        return;
    }
    call.resolve(buildPermissionResult());
}
```

**After:**
```java
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
    boolean hasImages = hasMediaPermission(Manifest.permission.READ_MEDIA_IMAGES);
    boolean hasVideo = hasMediaPermission(Manifest.permission.READ_MEDIA_VIDEO);

    if (!hasImages || !hasVideo) {
        requestPermissionForAlias("media", call, "permissionsCallback");  // ✅ Requests both at once!
        return;
    }
    call.resolve(buildPermissionResult());
}
```

**Why**: This checks BOTH permissions first, then requests them together using the "media" alias if either is missing.

### 3. Fixed Permission Check Logic
**Before:**
```java
// buildPermissionResult()
result.put("granted", hasImages || hasVideo);  // ❌ OR logic

// hasRequiredPermissions()
return hasMediaPermission(Manifest.permission.READ_MEDIA_IMAGES)
    || hasMediaPermission(Manifest.permission.READ_MEDIA_VIDEO);  // ❌ OR logic
```

**After:**
```java
// buildPermissionResult()
result.put("granted", hasImages && hasVideo);  // ✅ AND logic

// hasRequiredPermissions()
return hasMediaPermission(Manifest.permission.READ_MEDIA_IMAGES)
    && hasMediaPermission(Manifest.permission.READ_MEDIA_VIDEO);  // ✅ AND logic
```

**Why**: A gallery app needs BOTH image AND video permissions to function properly.

### 4. Simplified TypeScript Service (`media.service.ts`)
Removed the workaround that was trying to request permissions twice:

**Before:**
```typescript
async requestPermissions(): Promise<boolean> {
  let result = await MediaStore.checkPermissions();
  if (this.hasMissingMediaPermission(result)) {
    result = await MediaStore.requestPermissions();
  }
  // Workaround: Request again if only one permission granted
  if (result.images === true && result.video === false) {
    result = await MediaStore.requestPermissions();
  }
  return result.granted;
}
```

**After:**
```typescript
async requestPermissions(): Promise<boolean> {
  const currentResult = await MediaStore.checkPermissions();
  if (!currentResult.granted) {
    const result = await MediaStore.requestPermissions();
    return result.granted;
  }
  return true;
}
```

**Why**: With the fixed plugin, we don't need workarounds - a single permission request now works correctly.

### 5. Added Configuration (`capacitor.config.json`)
```json
{
  "plugins": {
    "MediaStore": {
      "androidGalleryMode": true
    }
  }
}
```

**Why**: Explicitly declares this is a gallery app that needs full media access.

## Android Version Compatibility

### Android 13-17 (API 33-37, TIRAMISU and above)
- Uses **granular permissions**: `READ_MEDIA_IMAGES` and `READ_MEDIA_VIDEO`
- Both permissions are requested together
- Supports partial selection (user can grant access to specific photos)

### Android 12 and below (API 32 and below)
- Uses legacy permission: `READ_EXTERNAL_STORAGE`
- Single permission grants access to all media

### Android Manifest
The `AndroidManifest.xml` already has all required permissions:
```xml
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
<uses-permission android:name="android.permission.READ_MEDIA_VISUAL_USER_SELECTED" android:required="false" />
```

## Testing the Fix

### Build and Run
```bash
# Build the web assets
npm run build

# Sync with Capacitor
npx cap sync android

# Open in Android Studio
npx cap open android
```

### Expected Behavior
1. ✅ App opens and immediately requests photo/video permissions
2. ✅ Permission dialog shows: "Allow Gallery to access photos and videos?"
3. ✅ After granting, app scans and displays all images and videos
4. ✅ No repeated permission requests
5. ✅ Works on Android 13, 14, 15, 16, and 17

### Test on Different Android Versions
- **Android 13-17**: Should show granular media permissions
- **Android 12 and below**: Should show storage permission
- **Both**: Should only ask once and remember the choice

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `android/app/src/main/java/com/gallery/app/MediaStorePlugin.java` | Modified | Fixed permission request logic and validation |
| `src/app/services/media.service.ts` | Modified | Simplified permission request (removed workaround) |
| `capacitor.config.json` | Modified | Added MediaStore plugin configuration |

## References
- [Android 13 Photo Picker Documentation](https://developer.android.com/training/data-storage/shared/photopicker)
- [Capacitor Android Permissions](https://capacitorjs.com/docs/android/configuration#permissions)
- [Android Media Permissions Best Practices](https://developer.android.com/training/data-storage/shared/media)

## Support for Future Android Versions
This fix is designed to work with current and future Android versions:
- Uses standard Android MediaStore API
- Follows Android permission best practices
- Properly requests grouped permissions
- Handles both legacy and modern permission models
