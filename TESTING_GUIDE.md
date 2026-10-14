# Testing Guide - Gallery App Permission Fix

## Quick Start

### 1. Build and Run the App

```bash
# Build the Angular app
npm run build

# Sync with Android
npx cap sync android

# Open in Android Studio
npx cap open android
```

### 2. Run on Android Device or Emulator

In Android Studio:
1. Connect your Android device via USB (with USB debugging enabled) OR start an Android emulator
2. Click the **Run** button (green play icon) or press `Shift + F10`
3. Select your device/emulator from the list

### 3. Test Permission Flow

When the app launches for the first time:

1. **Initial Screen**: You should see a loading message
2. **Permission Dialog**: Android will show a permission dialog:
   - **Android 13-17**: "Allow Gallery to access photos and videos on your device?"
   - **Android 12 and below**: "Allow Gallery to access photos and videos?"
3. **User Options**:
   - **Allow** (or **Allow all**)
   - **Select photos and videos** (Android 14+)
   - **Don't allow**
4. **After Granting Permission**: The app should automatically scan and display your photos/videos

## What to Check

### ✅ Expected Behavior

- [ ] Permission dialog appears immediately on first launch
- [ ] Dialog asks for **both** photos AND videos access (not just one)
- [ ] Permission is only requested **once** (no repeated dialogs)
- [ ] After granting, media scanning starts automatically
- [ ] All images and videos from device are displayed
- [ ] Albums view shows all folders with media
- [ ] Can view full-size images and videos

### ❌ Issues to Watch For

If any of these occur, the fix may not be working:

- Permission dialog doesn't appear at all
- Dialog appears multiple times
- Only asks for images OR videos (not both)
- After granting permission, no media appears
- App crashes when trying to access media
- "Permission denied" errors in logcat

## Testing on Different Android Versions

### Android 13 (API 33 - Tiramisu)
- Should show granular media permissions
- Separate toggles for images and videos in settings

### Android 14 (API 34 - Upside Down Cake)
- Includes "Select photos and videos" option
- Partial access mode available

### Android 15-17
- Similar to Android 14 with potential UI refinements
- Full and partial access modes

### Android 12 and Below (API ≤ 32)
- Shows legacy storage permission
- Single toggle for all files

## Debugging

### View Logs in Android Studio

1. Open **Logcat** tab at the bottom
2. Filter by package name: `com.gallery.app`
3. Look for log tags:
   - `MediaStorePlugin`: Plugin activity
   - `MediaService`: TypeScript service logs

### Check Permission Status Manually

In your Android device:
1. Go to **Settings** → **Apps** → **Gallery**
2. Tap **Permissions**
3. Check:
   - **Photos and videos** (Android 13+) should be "Allowed"
   - **Storage** (Android 12 and below) should be "Allowed"

### Reset Permissions for Testing

To test the permission flow again:
1. Go to **Settings** → **Apps** → **Gallery**
2. Tap **Permissions**
3. Revoke permissions
4. Clear app data: **Storage** → **Clear data**
5. Relaunch the app

### Common Logcat Commands

```bash
# View all logs from the app
adb logcat -s "MediaStorePlugin:*" "MediaService:*"

# Clear previous logs
adb logcat -c

# View only error logs
adb logcat *:E
```

## Performance Testing

### Media Scanning Performance

- **Small library** (< 100 files): Should complete in < 5 seconds
- **Medium library** (100-1000 files): Should complete in < 15 seconds  
- **Large library** (> 1000 files): May take 30+ seconds, progress should be shown

### Memory Usage

The app implements:
- Batch loading (50 items at a time)
- Thumbnail caching
- Virtual scrolling

Large libraries should not cause crashes or lag.

## Build Variants

### Debug Build (for testing)
```bash
# In Android Studio
Build → Select Build Variant → debug
```

### Release Build (for production)
```bash
# Command line
cd android
./gradlew assembleRelease

# Output: android/app/build/outputs/apk/release/app-release-unsigned.apk
```

## Troubleshooting

### Permission Dialog Doesn't Appear

1. Check AndroidManifest.xml has the required permissions
2. Verify targetSdkVersion is 34 in `android/variables.gradle`
3. Check if permissions were previously denied
4. Clear app data and try again

### "Permission Denied" Error

1. Check logcat for specific error messages
2. Verify both READ_MEDIA_IMAGES and READ_MEDIA_VIDEO are granted
3. Ensure app has Android 13+ permissions on newer devices

### No Media Shows After Permission Granted

1. Check if device has media files in standard locations
2. Verify MediaStore scanning completes without errors
3. Check logcat for `MediaStorePlugin` errors
4. Try pulling the media scan to refresh

### App Crashes on Launch

1. Check logcat for stack traces
2. Verify all dependencies are installed: `npm install`
3. Clean and rebuild: `npx cap sync android`
4. Check for Java/Kotlin compilation errors in Android Studio

## Success Criteria

The fix is successful if:

✅ App requests permissions on first launch  
✅ Both images and videos permissions are requested together  
✅ After granting, all media is accessible  
✅ Works on Android 13-17 without issues  
✅ Backwards compatible with Android 12 and below  
✅ No repeated permission requests  
✅ No crashes related to permissions  

## Feedback and Support

If you encounter issues:
1. Check the logcat output
2. Review `PERMISSION_FIX_README.md` for technical details
3. Verify all changes were applied correctly
4. Test on a physical device (emulators may behave differently)

## Next Steps After Testing

Once testing is successful:
1. Test on multiple Android versions if possible
2. Test with large media libraries (1000+ files)
3. Test with no media (empty gallery scenario)
4. Test permission revocation and re-granting
5. Prepare for production release
