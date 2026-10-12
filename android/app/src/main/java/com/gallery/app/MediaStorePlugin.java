package com.gallery.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.pm.PackageManager;
import android.database.ContentObserver;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Log;
import android.util.Size;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(
    name = "MediaStore",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = "storage"),
        @Permission(strings = { Manifest.permission.READ_MEDIA_IMAGES }, alias = "images"),
        @Permission(strings = { Manifest.permission.READ_MEDIA_VIDEO }, alias = "video")
    }
)
public class MediaStorePlugin extends Plugin {
    private static final String TAG = "MediaStorePlugin";
    private MediaContentObserver mediaObserver;

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        call.resolve(buildPermissionResult());
    }

    private JSObject buildPermissionResult() {
        JSObject result = new JSObject();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            boolean hasImages = hasMediaPermission(Manifest.permission.READ_MEDIA_IMAGES);
            boolean hasVideo = hasMediaPermission(Manifest.permission.READ_MEDIA_VIDEO);

            result.put("granted", hasImages || hasVideo);
            result.put("images", hasImages);
            result.put("video", hasVideo);
            result.put("storage", false);
        } else {
            boolean hasStorage = hasMediaPermission(Manifest.permission.READ_EXTERNAL_STORAGE);
            result.put("granted", hasStorage);
            result.put("images", hasStorage);
            result.put("video", hasStorage);
            result.put("storage", hasStorage);
        }

        return result;
    }

    private boolean hasMediaPermission(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (!hasMediaPermission(Manifest.permission.READ_MEDIA_IMAGES)) {
                requestPermissionForAlias("images", call, "permissionsCallback");
                return;
            }

            if (!hasMediaPermission(Manifest.permission.READ_MEDIA_VIDEO)) {
                requestPermissionForAlias("video", call, "permissionsCallback");
                return;
            }

            call.resolve(buildPermissionResult());
            return;
        }

        if (!hasMediaPermission(Manifest.permission.READ_EXTERNAL_STORAGE)) {
            requestPermissionForAlias("storage", call, "permissionsCallback");
            return;
        }

        call.resolve(buildPermissionResult());
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        checkPermissions(call);
    }

    @PluginMethod
    public void scanMedia(PluginCall call) {
        if (!hasRequiredPermissions()) {
            call.reject("Permission denied");
            return;
        }

        int limit = Math.max(1, call.getInt("limit", 100));
        int offset = Math.max(0, call.getInt("offset", 0));
        String mediaType = call.getString("mediaType", "all");

        try {
            List<JSObject> combined = new ArrayList<>();

            if (!"video".equalsIgnoreCase(mediaType)) {
                combined.addAll(scanMediaType("image", limit, offset));
            }

            if (!"image".equalsIgnoreCase(mediaType)) {
                combined.addAll(scanMediaType("video", limit, offset));
            }

            combined.sort((left, right) -> Long.compare(getDateTakenValue(right), getDateTakenValue(left)));

            int start = Math.max(0, offset);
            int end = Math.min(combined.size(), start + limit);
            List<JSObject> page = start < combined.size() ? new ArrayList<>(combined.subList(start, end)) : new ArrayList<>();

            JSArray mediaList = new JSArray();
            for (JSObject item : page) {
                mediaList.put(item);
            }

            JSObject result = new JSObject();
            result.put("media", mediaList);
            result.put("count", page.size());
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error scanning media", e);
            call.reject("Error scanning media: " + e.getMessage());
        }
    }

    private List<JSObject> scanMediaType(String mediaType, int limit, int offset) {
        Uri uri = "image".equalsIgnoreCase(mediaType)
            ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            : MediaStore.Video.Media.EXTERNAL_CONTENT_URI;

        String[] projection = "image".equalsIgnoreCase(mediaType)
            ? new String[] {
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DISPLAY_NAME,
                MediaStore.Images.Media.DATE_TAKEN,
                MediaStore.Images.Media.DATE_MODIFIED,
                MediaStore.Images.Media.DATE_ADDED,
                MediaStore.Images.Media.SIZE,
                MediaStore.Images.Media.BUCKET_ID,
                MediaStore.Images.Media.BUCKET_DISPLAY_NAME,
                MediaStore.Images.Media.WIDTH,
                MediaStore.Images.Media.HEIGHT
            }
            : new String[] {
                MediaStore.Video.Media._ID,
                MediaStore.Video.Media.DISPLAY_NAME,
                MediaStore.Video.Media.DATE_TAKEN,
                MediaStore.Video.Media.DATE_MODIFIED,
                MediaStore.Video.Media.DATE_ADDED,
                MediaStore.Video.Media.SIZE,
                MediaStore.Video.Media.BUCKET_ID,
                MediaStore.Video.Media.BUCKET_DISPLAY_NAME,
                MediaStore.Video.Media.DURATION,
                MediaStore.Video.Media.WIDTH,
                MediaStore.Video.Media.HEIGHT
            };

        String sortOrder = "DATE_TAKEN DESC, DATE_MODIFIED DESC, DATE_ADDED DESC, _ID DESC";
        List<JSObject> items = new ArrayList<>();

        try (Cursor cursor = getContext().getContentResolver().query(uri, projection, null, null, sortOrder)) {
            if (cursor == null) {
                return items;
            }

            int idIndex = cursor.getColumnIndexOrThrow("_id");
            int nameIndex = cursor.getColumnIndexOrThrow("_display_name");
            int dateTakenIndex = cursor.getColumnIndexOrThrow("date_taken");
            int dateModifiedIndex = cursor.getColumnIndexOrThrow("date_modified");
            int dateAddedIndex = cursor.getColumnIndexOrThrow("date_added");
            int sizeIndex = cursor.getColumnIndexOrThrow("_size");
            int bucketIdIndex = cursor.getColumnIndexOrThrow("bucket_id");
            int bucketNameIndex = cursor.getColumnIndexOrThrow("bucket_display_name");
            int widthIndex = cursor.getColumnIndexOrThrow("width");
            int heightIndex = cursor.getColumnIndexOrThrow("height");
            int durationIndex = "video".equalsIgnoreCase(mediaType) ? cursor.getColumnIndexOrThrow("duration") : -1;

            while (cursor.moveToNext()) {
                long id = cursor.getLong(idIndex);
                String name = cursor.getString(nameIndex);
                long dateTaken = cursor.getLong(dateTakenIndex);
                if (dateTaken <= 0L) {
                    long dateModified = cursor.getLong(dateModifiedIndex);
                    if (dateModified > 0L) {
                        dateTaken = dateModified * 1000L;
                    }
                }
                if (dateTaken <= 0L) {
                    long dateAdded = cursor.getLong(dateAddedIndex);
                    if (dateAdded > 0L) {
                        dateTaken = dateAdded * 1000L;
                    }
                }
                if (dateTaken <= 0L) {
                    dateTaken = System.currentTimeMillis();
                }

                String bucketId = cursor.getString(bucketIdIndex);
                String bucketName = cursor.getString(bucketNameIndex);
                long size = cursor.getLong(sizeIndex);
                int width = cursor.getInt(widthIndex);
                int height = cursor.getInt(heightIndex);
                long duration = durationIndex >= 0 ? cursor.getLong(durationIndex) : 0L;

                Uri contentUri = ContentUris.withAppendedId(uri, id);
                JSObject media = new JSObject();
                media.put("id", String.valueOf(id));
                media.put("key", mediaType + ":" + id);
                media.put("name", name != null ? name : "Unknown");
                media.put("dateTaken", dateTaken);
                media.put("size", size);
                media.put("uri", contentUri.toString());
                media.put("path", contentUri.toString());
                media.put("type", mediaType);
                media.put("bucket", bucketName != null ? bucketName : "Unknown");
                media.put("bucketId", bucketId != null ? bucketId : "unknown");
                media.put("width", width);
                media.put("height", height);

                if ("video".equalsIgnoreCase(mediaType)) {
                    media.put("duration", duration);
                }

                items.add(media);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error scanning " + mediaType + " media", e);
        }

        items.sort((left, right) -> Long.compare(getDateTakenValue(right), getDateTakenValue(left)));
        int start = Math.max(0, offset);
        int end = Math.min(items.size(), start + limit);
        if (start >= items.size()) {
            return new ArrayList<>();
        }
        return new ArrayList<>(items.subList(start, end));
    }

    @PluginMethod
    public void getThumbnail(PluginCall call) {
        if (!hasRequiredPermissions()) {
            call.reject("Permission denied");
            return;
        }

        String mediaId = call.getString("id");
        String mediaType = call.getString("type", "image");

        if (mediaId == null || mediaId.trim().isEmpty()) {
            call.reject("Media ID is required");
            return;
        }

        try {
            long id = Long.parseLong(mediaId);
            Bitmap thumbnail = null;
            Uri contentUri = "video".equalsIgnoreCase(mediaType)
                ? ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)
                : ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                thumbnail = getContext().getContentResolver().loadThumbnail(contentUri, new Size(180, 180), null);
            } else if ("video".equalsIgnoreCase(mediaType)) {
                thumbnail = MediaStore.Video.Thumbnails.getThumbnail(
                    getContext().getContentResolver(),
                    id,
                    MediaStore.Video.Thumbnails.MINI_KIND,
                    null
                );
            } else {
                thumbnail = MediaStore.Images.Thumbnails.getThumbnail(
                    getContext().getContentResolver(),
                    id,
                    MediaStore.Images.Thumbnails.MINI_KIND,
                    null
                );
            }

            if (thumbnail == null) {
                call.reject("Failed to generate thumbnail");
                return;
            }

            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            thumbnail.compress(Bitmap.CompressFormat.JPEG, 80, outputStream);
            byte[] thumbnailBytes = outputStream.toByteArray();
            String base64Thumbnail = Base64.getEncoder().encodeToString(thumbnailBytes);

            JSObject result = new JSObject();
            result.put("thumbnail", "data:image/jpeg;base64," + base64Thumbnail);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error getting thumbnail", e);
            call.reject("Error getting thumbnail: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getAlbums(PluginCall call) {
        if (!hasRequiredPermissions()) {
            call.reject("Permission denied");
            return;
        }

        try {
            Map<String, JSObject> albumMap = new LinkedHashMap<>();
            addBucketSummaries(albumMap, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image");
            addBucketSummaries(albumMap, MediaStore.Video.Media.EXTERNAL_CONTENT_URI, "video");

            JSArray albums = new JSArray();
            for (JSObject album : albumMap.values()) {
                albums.put(album);
            }

            JSObject result = new JSObject();
            result.put("albums", albums);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error getting albums", e);
            call.reject("Error getting albums: " + e.getMessage());
        }
    }

    private long getDateTakenValue(JSObject item) {
        try {
            if (item.has("dateTaken")) {
                return item.getLong("dateTaken");
            }
        } catch (Exception ignored) {
            // Ignore malformed cache entries during sort.
        }
        return 0L;
    }

    private void addBucketSummaries(Map<String, JSObject> albumMap, Uri uri, String mediaType) {
        String[] projection = new String[] {
            "bucket_id",
            "bucket_display_name"
        };

        try (Cursor cursor = getContext().getContentResolver().query(uri, projection, null, null, "bucket_display_name ASC")) {
            if (cursor == null) {
                return;
            }

            int bucketIdIndex = cursor.getColumnIndexOrThrow("bucket_id");
            int bucketNameIndex = cursor.getColumnIndexOrThrow("bucket_display_name");

            while (cursor.moveToNext()) {
                String bucketId = cursor.getString(bucketIdIndex);
                String bucketName = cursor.getString(bucketNameIndex);

                if (bucketId == null || bucketId.trim().isEmpty()) {
                    continue;
                }

                JSObject album = albumMap.get(bucketId);
                if (album == null) {
                    album = new JSObject();
                    album.put("id", bucketId);
                    album.put("name", bucketName != null ? bucketName : "Unknown");
                    album.put("count", 0);
                    album.put("type", "auto");
                    albumMap.put(bucketId, album);
                }

                int currentCount = album.has("count") ? album.getInt("count") : 0;
                album.put("count", currentCount + 1);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error getting albums for " + mediaType, e);
        }
    }

    @PluginMethod
    public void startMediaChangeListener(PluginCall call) {
        if (mediaObserver == null) {
            mediaObserver = new MediaContentObserver(new Handler(Looper.getMainLooper()));
            getContext().getContentResolver().registerContentObserver(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                true,
                mediaObserver
            );
            getContext().getContentResolver().registerContentObserver(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                true,
                mediaObserver
            );
        }

        JSObject result = new JSObject();
        result.put("listening", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stopMediaChangeListener(PluginCall call) {
        if (mediaObserver != null) {
            getContext().getContentResolver().unregisterContentObserver(mediaObserver);
            mediaObserver = null;
        }

        JSObject result = new JSObject();
        result.put("listening", false);
        call.resolve(result);
    }

    public boolean hasRequiredPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return hasMediaPermission(Manifest.permission.READ_MEDIA_IMAGES)
                || hasMediaPermission(Manifest.permission.READ_MEDIA_VIDEO);
        }

        return hasMediaPermission(Manifest.permission.READ_EXTERNAL_STORAGE);
    }

    private class MediaContentObserver extends ContentObserver {
        public MediaContentObserver(Handler handler) {
            super(handler);
        }

        @Override
        public void onChange(boolean selfChange) {
            super.onChange(selfChange);
            notifyMediaChanged();
        }

        @Override
        public void onChange(boolean selfChange, Uri uri) {
            super.onChange(selfChange, uri);
            notifyMediaChanged();
        }

        private void notifyMediaChanged() {
            JSObject data = new JSObject();
            data.put("event", "mediaChanged");
            data.put("timestamp", System.currentTimeMillis());
            notifyListeners("mediaChanged", data);
        }
    }
}
