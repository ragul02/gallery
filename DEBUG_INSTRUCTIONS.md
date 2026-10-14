# Debug Instructions - Gallery App Permissions

## Latest APK Location
```
C:\Users\ragul\Ionic\gallery\android\app\build\outputs\apk\debug\app-debug.apk
```

**Build Time**: October 13, 2026, 21:40 (with extensive debug logging)

## How to View Logs

### Option 1: Android Studio Logcat (Recommended)

1. Open Android Studio
2. Install and run the app on your device/emulator
3. Open **Logcat** tab at the bottom
4. Filter by package: `com.gallery.app`
5. Look for these log markers:

#### TypeScript Logs (Browser Console):
- 🔵 Blue circle = Info/Debug
- 🟢 Green circle = Success
- 🟡 Yellow circle = Warning
- 🔴 Red circle = Error

#### Native Android Logs (Logcat):
- Tag: `MediaStorePlugin`
- Same color system as above

### Option 2: ADB Command Line

```bash
# Clear previous logs
adb logcat -c

# View all app logs
adb logcat -s "MediaStorePlugin:*" "chromium:*"

# View only errors
adb logcat *:E

# Save logs to file
adb logcat > app_logs.txt
```

### Option 3: Chrome DevTools (for TypeScript logs)

1. Open Chrome browser
2. Navigate to `chrome://inspect`
3. Click "inspect" under your device
4. Go to **Console** tab

## What to Look For

### 1. App Startup Sequence

You should see this sequence in the logs:

```
🔵 MediaStore Plugin: Registering plugin...
🔵 MediaStore Plugin: Plugin registered: [object]
🔵 HomePage: ngOnInit called
🔵 HomePage: initializeGallery - START
🔵 HomePage: PhotoService ready
🔵 HomePage: Legacy photos loaded: X
🔵 HomePage: hasCompletedInitialScan: true/false
🔵 MediaService: checkPermissions - START
🔵 MediaStore.checkPermissions() called
🔵 MediaStorePlugin: checkPermissions() called
🔵 MediaStorePlugin: buildPermissionResult() - SDK_INT: 33, TIRAMISU: 33
🔵 MediaStorePlugin: buildPermissionResult() - hasImages: false, hasVideo: false
🔵 MediaStore.checkPermissions() result: {"granted":false,"images":false,"video":false}
🔵 MediaService: hasPermission set to: false
🔵 HomePage: checkPermissions result: false
```

### 2. When "Grant Media Access" Button is Clicked

```
🔵 HomePage: scanDeviceMedia - START {showPermissionMessage: true, forceRefresh: true}
🔵 HomePage: About to call mediaService.requestPermissions()
🔵 MediaService: requestPermissions - START
🔵 MediaService: Current permission status: {"granted":false,"images":false,"video":false}
🟡 MediaService: Permission not granted, requesting...
🔵 MediaService: Calling MediaStore.requestPermissions()
🔵 MediaStore.requestPermissions() called
🔵 MediaStorePlugin: requestPermissions() called
🔵 MediaStorePlugin: requestPermissions() - SDK_INT: 33
🔵 MediaStorePlugin: requestPermissions() - Current state: hasImages=false, hasVideo=false
🟡 MediaStorePlugin: Requesting 'media' alias permissions

--- PERMISSION DIALOG SHOULD APPEAR HERE ---

🔵 MediaStorePlugin: permissionsCallback() called
🔵 MediaStorePlugin: checkPermissions() called
🔵 MediaStorePlugin: buildPermissionResult() - hasImages: true, hasVideo: true
🔵 MediaStore.requestPermissions() result: {"granted":true,"images":true,"video":true}
🟢 MediaService: Permission GRANTED, saving to preferences
🔵 HomePage: mediaService.requestPermissions() returned: true
🟢 HomePage: Permission granted! Setting hasPermission = true
```

### 3. If Permission Dialog Doesn't Appear

Look for these instead:

```
🔴 MediaStore.requestPermissions() error: [error details]
🔴 MediaService: Error requesting permissions: [error]
```

### 4. Common Issues and Their Log Signatures

#### Issue: Plugin Not Registered
```
🔴 Error: Plugin MediaStore does not have any registered methods
```
**Solution**: Plugin not found in MainActivity.java or not synced

#### Issue: Permission Already Denied
```
🟢 MediaStorePlugin: Already have all permissions
or
🔴 MediaStorePlugin: buildPermissionResult() - hasImages: false, hasVideo: false
```
**Solution**: Manually grant in Settings or clear app data

#### Issue: Wrong Android Version Check
```
🔵 MediaStorePlugin: requestPermissions() - SDK_INT: 28
🟡 MediaStorePlugin: Requesting 'storage' alias permissions
```
**Solution**: Device is Android 12 or below, should request storage permission

## Manual Permission Check

### Via Device Settings
1. Settings → Apps → Gallery
2. Tap Permissions
3. Look for:
   - **Android 13+**: "Photos and videos" or "Media and files"
   - **Android 12 and below**: "Storage"
4. Check if status is:
   - ✅ "Allowed" / "Allow all"
   - ❌ "Denied" / "Ask every time"
   - ⚠️ "Select photos and videos" (partial)

### Via ADB
```bash
# Check permissions
adb shell dumpsys package com.gallery.app | findstr permission

# Grant permissions manually (for testing)
# Android 13+
adb shell pm grant com.gallery.app android.permission.READ_MEDIA_IMAGES
adb shell pm grant com.gallery.app android.permission.READ_MEDIA_VIDEO

# Android 12 and below
adb shell pm grant com.gallery.app android.permission.READ_EXTERNAL_STORAGE

# Revoke permissions (for testing)
adb shell pm revoke com.gallery.app android.permission.READ_MEDIA_IMAGES
adb shell pm revoke com.gallery.app android.permission.READ_MEDIA_VIDEO
```

## Test Scenarios

### Scenario 1: Fresh Install (Never Asked)
1. Install APK
2. Launch app
3. **Expected**: Permission dialog appears immediately
4. **Look for**: 🟡 "Requesting 'media' alias permissions" in logs

### Scenario 2: Permission Previously Denied
1. Revoke permissions in Settings
2. Clear app data
3. Launch app
4. **Expected**: Permission dialog appears
5. **Look for**: Request sequence in logs

### Scenario 3: Click "Grant Media Access" Button
1. Install and launch app
2. Click "Grant Media Access" button
3. **Expected**: Permission dialog appears
4. **Look for**: "scanDeviceMedia" sequence in logs

### Scenario 4: Permission Already Granted
1. Grant permissions in Settings
2. Launch app
3. **Expected**: No dialog, media loads automatically
4. **Look for**: 🟢 "Already have all permissions" in logs

## Save Full Debug Log

To save a complete log for analysis:

```bash
# Clear existing logs
adb logcat -c

# Start the app

# After testing, save logs
adb logcat -d > C:\Users\ragul\Desktop\gallery_debug_log.txt
```

Then share the `gallery_debug_log.txt` file.

## Expected Debug Output Summary

When working correctly, you'll see:
1. ✅ Plugin registered successfully
2. ✅ Permission check returns false initially
3. ✅ Request permissions is called
4. ✅ Native Android permission dialog appears
5. ✅ User grants permission
6. ✅ Callback receives granted=true
7. ✅ Media scanning starts
8. ✅ Photos and videos appear

## Android Version Information

Check your device Android version:
```bash
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
```

Expected results:
- Android 13 = SDK 33 (TIRAMISU)
- Android 14 = SDK 34 (UPSIDE_DOWN_CAKE)
- Android 15 = SDK 35
- Android 16 = SDK 36
- Android 17 = SDK 37

## Contact

If issues persist after reviewing logs:
1. Save the full log file
2. Note the exact Android version
3. Note when permission dialog should appear but doesn't
4. Share the log file and observations
