package com.gallery.app;

import android.Manifest;
import android.content.ContentResolver;
import android.database.Cursor;
import android.database.ContentObserver;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.annotation.Permission;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

@CapacitorPlugin(
    name = "MediaStore",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = "storage"),
        @Permission(strings = { Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO }, alias = "media")
    }
)
public class MediaStorePlugin extends Plugin {
    private ContentObserver mediaObserver;
    private static final String[] COMMON_PROJECTION = {
        MediaStore.MediaColumns._ID,
        MediaStore.MediaColumns.DISPLAY_NAME,
        MediaStore.MediaColumns.DATE_ADDED,
        MediaStore.MediaColumns.SIZE,
        MediaStore.MediaColumns.MIME_TYPE,
        MediaStore.MediaColumns.WIDTH,
        MediaStore.MediaColumns.HEIGHT,
        MediaStore.MediaColumns.BUCKET_DISPLAY_NAME,
        MediaStore.MediaColumns.BUCKET_ID
    };

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject result = permissionResult();
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (getPermissionState("media") != com.getcapacitor.PermissionState.GRANTED) {
                requestPermissionForAlias("media", call, "permissionsCallback");
            } else {
                call.resolve(permissionResult());
            }
        } else if (getPermissionState("storage") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "permissionsCallback");
        } else {
            call.resolve(permissionResult());
        }
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        call.resolve(permissionResult());
    }

    private JSObject permissionResult() {
        boolean images;
        boolean video;
        boolean storage;
        if (Build.VERSION.SDK_INT >= 33) {
            images = getPermissionState("media") == com.getcapacitor.PermissionState.GRANTED
                && getContext().checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) == android.content.pm.PackageManager.PERMISSION_GRANTED;
            video = getPermissionState("media") == com.getcapacitor.PermissionState.GRANTED
                && getContext().checkSelfPermission(Manifest.permission.READ_MEDIA_VIDEO) == android.content.pm.PackageManager.PERMISSION_GRANTED;
            storage = images && video;
        } else {
            storage = getPermissionState("storage") == com.getcapacitor.PermissionState.GRANTED;
            images = storage;
            video = storage;
        }
        JSObject result = new JSObject();
        result.put("granted", images && video);
        result.put("images", images);
        result.put("video", video);
        result.put("storage", storage);
        return result;
    }

    @PluginMethod
    public void scanMedia(PluginCall call) {
        if (!permissionResult().optBoolean("granted")) {
            call.reject("Media permission has not been granted");
            return;
        }
        int limit = Math.max(1, call.getInt("limit", 100));
        int offset = Math.max(0, call.getInt("offset", 0));
        String type = call.getString("mediaType", "all");
        JSArray media = new JSArray();
        try {
            ContentResolver resolver = getContext().getContentResolver();
            queryMedia(resolver, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image", type, limit, offset, media);
            queryMedia(resolver, MediaStore.Video.Media.EXTERNAL_CONTENT_URI, "video", type, limit, offset, media);
            JSObject result = new JSObject();
            result.put("media", media);
            result.put("count", media.length());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Unable to scan device media", e);
        }
    }

    private void queryMedia(ContentResolver resolver, Uri collection, String kind, String requestedType,
                            int limit, int offset, JSArray output) {
        if (!"all".equals(requestedType) && !kind.equals(requestedType)) return;
        String sort = MediaStore.MediaColumns.DATE_ADDED + " DESC";
        String[] projection = "video".equals(kind)
            ? new String[] {
                MediaStore.MediaColumns._ID,
                MediaStore.MediaColumns.DISPLAY_NAME,
                MediaStore.MediaColumns.DATE_ADDED,
                MediaStore.MediaColumns.SIZE,
                MediaStore.MediaColumns.MIME_TYPE,
                MediaStore.MediaColumns.WIDTH,
                MediaStore.MediaColumns.HEIGHT,
                MediaStore.MediaColumns.DURATION,
                MediaStore.MediaColumns.BUCKET_DISPLAY_NAME,
                MediaStore.MediaColumns.BUCKET_ID
            }
            : COMMON_PROJECTION;
        try (Cursor cursor = resolver.query(collection, projection, null, null, sort)) {
            if (cursor == null) return;
            int idCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID);
            int nameCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME);
            int dateCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED);
            int sizeCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE);
            int widthCol = cursor.getColumnIndex(MediaStore.MediaColumns.WIDTH);
            int heightCol = cursor.getColumnIndex(MediaStore.MediaColumns.HEIGHT);
            int durationCol = cursor.getColumnIndex(MediaStore.MediaColumns.DURATION);
            int bucketCol = cursor.getColumnIndex(MediaStore.MediaColumns.BUCKET_DISPLAY_NAME);
            int bucketIdCol = cursor.getColumnIndex(MediaStore.MediaColumns.BUCKET_ID);
            int skipped = 0;
            int added = 0;
            while (cursor.moveToNext()) {
                if (skipped < offset) {
                    skipped++;
                    continue;
                }
                if (added >= limit) break;
                long id = cursor.getLong(idCol);
                Uri itemUri = Uri.withAppendedPath(collection, Long.toString(id));
                JSObject item = new JSObject();
                item.put("id", Long.toString(id));
                item.put("key", kind + ":" + id);
                item.put("name", cursor.getString(nameCol));
                item.put("dateTaken", cursor.getLong(dateCol) * 1000L);
                item.put("size", cursor.getLong(sizeCol));
                item.put("uri", itemUri.toString());
                item.put("path", itemUri.toString());
                item.put("type", kind);
                item.put("bucket", bucketCol >= 0 ? cursor.getString(bucketCol) : "");
                if (bucketIdCol >= 0) item.put("bucketId", cursor.getString(bucketIdCol));
                item.put("width", widthCol >= 0 ? cursor.getInt(widthCol) : 0);
                item.put("height", heightCol >= 0 ? cursor.getInt(heightCol) : 0);
                if ("video".equals(kind) && durationCol >= 0) item.put("duration", cursor.getLong(durationCol));
                output.put(item);
                added++;
            }
        }
    }

    @PluginMethod
    public void getThumbnail(PluginCall call) {
        String id = call.getString("id");
        String type = call.getString("type", "image");
        if (id == null) { call.reject("Media id is required"); return; }
        try {
            Uri base = "video".equals(type) ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            Uri uri = Uri.withAppendedPath(base, id);
            Bitmap bitmap;
            if (Build.VERSION.SDK_INT >= 29) {
                bitmap = getContext().getContentResolver().loadThumbnail(uri, new Size(512, 512), null);
            } else {
                try (InputStream in = getContext().getContentResolver().openInputStream(uri)) { bitmap = BitmapFactory.decodeStream(in); }
            }
            if (bitmap == null) throw new IllegalStateException("Thumbnail unavailable");
            ByteArrayOutputStream stream = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 82, stream);
            JSObject result = new JSObject();
            result.put("thumbnail", "data:image/jpeg;base64," + Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception e) { call.reject("Unable to load media thumbnail", e); }
    }

    @PluginMethod
    public void getAlbums(PluginCall call) {
        if (!permissionResult().optBoolean("granted")) { call.resolve(new JSObject().put("albums", new JSArray())); return; }
        Map<String, Integer> counts = new HashMap<>();
        Map<String, String> ids = new HashMap<>();
        ContentResolver resolver = getContext().getContentResolver();
        collectAlbums(resolver, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, counts, ids);
        collectAlbums(resolver, MediaStore.Video.Media.EXTERNAL_CONTENT_URI, counts, ids);
        JSArray albums = new JSArray();
        for (String name : counts.keySet()) {
            JSObject album = new JSObject();
            album.put("id", ids.get(name)); album.put("name", name); album.put("count", counts.get(name)); album.put("type", "auto");
            albums.put(album);
        }
        call.resolve(new JSObject().put("albums", albums));
    }

    private void collectAlbums(ContentResolver resolver, Uri collection, Map<String, Integer> counts, Map<String, String> ids) {
        String[] columns = { MediaStore.MediaColumns.BUCKET_DISPLAY_NAME, MediaStore.MediaColumns.BUCKET_ID };
        try (Cursor cursor = resolver.query(collection, columns, null, null, null)) {
            if (cursor == null) return;
            while (cursor.moveToNext()) {
                String name = cursor.getString(0);
                String id = cursor.getString(1);
                if (name == null) name = "Unknown";
                counts.put(name, counts.containsKey(name) ? counts.get(name) + 1 : 1);
                ids.put(name, id == null ? name : id);
            }
        }
    }

    @PluginMethod
    public void startMediaChangeListener(PluginCall call) {
        if (mediaObserver == null) {
            mediaObserver = new ContentObserver(new Handler(Looper.getMainLooper())) {
                @Override
                public void onChange(boolean selfChange, Uri uri) {
                    JSObject event = new JSObject();
                    event.put("event", "changed");
                    event.put("timestamp", System.currentTimeMillis());
                    notifyListeners("mediaChanged", event);
                }
            };
            ContentResolver resolver = getContext().getContentResolver();
            resolver.registerContentObserver(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true, mediaObserver);
            resolver.registerContentObserver(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, true, mediaObserver);
        }
        call.resolve(new JSObject().put("listening", true));
    }

    @PluginMethod
    public void stopMediaChangeListener(PluginCall call) {
        if (mediaObserver != null) {
            getContext().getContentResolver().unregisterContentObserver(mediaObserver);
            mediaObserver = null;
        }
        call.resolve(new JSObject().put("listening", false));
    }

    @Override
    protected void handleOnDestroy() {
        if (mediaObserver != null && getContext() != null) {
            getContext().getContentResolver().unregisterContentObserver(mediaObserver);
            mediaObserver = null;
        }
        super.handleOnDestroy();
    }
}
