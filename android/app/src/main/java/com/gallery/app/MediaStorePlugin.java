package com.gallery.app;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.database.ContentObserver;
import android.graphics.Bitmap;
import android.content.IntentSender;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.annotation.Permission;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "MediaStore",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = "storage"),
        @Permission(strings = { Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO }, alias = "media"),
        @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "write")
    }
)
public class MediaStorePlugin extends Plugin {
    private ContentObserver mediaObserver;
    private ActivityResultLauncher<IntentSenderRequest> deleteRequestLauncher;
    private PluginCall pendingDeleteCall;
    private List<Uri> pendingDeleteUris = new ArrayList<>();
    private static final String[] COMMON_PROJECTION = {
        MediaStore.MediaColumns._ID,
        MediaStore.MediaColumns.DISPLAY_NAME,
        MediaStore.MediaColumns.DATE_ADDED,
        MediaStore.Images.ImageColumns.DATE_TAKEN,
        MediaStore.MediaColumns.SIZE,
        MediaStore.MediaColumns.MIME_TYPE,
        MediaStore.MediaColumns.WIDTH,
        MediaStore.MediaColumns.HEIGHT,
        MediaStore.MediaColumns.BUCKET_DISPLAY_NAME,
        MediaStore.MediaColumns.BUCKET_ID
    };

    @Override
    public void load() {
        deleteRequestLauncher = getBridge().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            this::onDeleteRequestResult
        );
    }

    @PluginMethod
    public void deleteMedia(PluginCall call) {
        JSArray items = call.getArray("items");
        if (items == null || items.length() == 0) {
            call.resolve(new JSObject().put("deleted", true).put("deletedKeys", new JSArray()));
            return;
        }
        List<Uri> uris = new ArrayList<>();
        try {
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.getJSONObject(i);
                String id = item.getString("id");
                String type = item.getString("type");
                Uri collection = "video".equals(type)
                    ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                    : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
                uris.add(Uri.withAppendedPath(collection, id));
            }
        } catch (Exception e) {
            call.reject("Invalid media selection", e);
            return;
        }

        if (Build.VERSION.SDK_INT >= 30) {
            try {
                PendingIntent request = MediaStore.createDeleteRequest(getContext().getContentResolver(), uris);
                launchDeleteConfirmation(call, uris, request.getIntentSender());
            } catch (Exception e) {
                call.reject("Unable to request media deletion", e);
            }
        } else if (Build.VERSION.SDK_INT == 29) {
            deleteForAndroidTen(call, uris);
        } else if (getPermissionState("write") != com.getcapacitor.PermissionState.GRANTED) {
            pendingDeleteUris = uris;
            requestPermissionForAlias("write", call, "legacyDeletePermissionCallback");
        } else {
            deleteUris(call, uris);
        }
    }

    @PluginMethod
    public void shareMedia(PluginCall call) {
        String id = call.getString("id");
        String type = call.getString("type", "image");
        String localPath = call.getString("localPath");
        if (id == null || (!"image".equals(type) && !"video".equals(type))) {
            call.reject("A valid media item is required to share");
            return;
        }
        try {
            Uri uri;
            if (localPath != null && !localPath.isEmpty()) {
                File file = new File(getContext().getFilesDir(), localPath);
                if (!file.isFile()) {
                    call.reject("The saved image is no longer available");
                    return;
                }
                uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            } else {
                Uri collection = "video".equals(type)
                    ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                    : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
                uri = Uri.withAppendedPath(collection, id);
            }

            String mimeType = "video".equals(type) ? "video/*" : "image/*";
            Intent sendIntent = new Intent(Intent.ACTION_SEND);
            sendIntent.setType(mimeType);
            sendIntent.putExtra(Intent.EXTRA_STREAM, uri);
            sendIntent.setClipData(ClipData.newUri(getContext().getContentResolver(), "Shared media", uri));
            sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(sendIntent, "Share media");
            getActivity().runOnUiThread(() -> {
                try {
                    getActivity().startActivity(chooser);
                    call.resolve(new JSObject().put("shared", true));
                } catch (Exception e) {
                    call.reject("No app could share this media", e);
                }
            });
        } catch (Exception e) {
            call.reject("Unable to share this media", e);
        }
    }

    @PermissionCallback
    private void legacyDeletePermissionCallback(PluginCall call) {
        if (getPermissionState("write") != com.getcapacitor.PermissionState.GRANTED) {
            call.resolve(new JSObject().put("deleted", false).put("deletedKeys", new JSArray()));
            pendingDeleteUris.clear();
            return;
        }
        deleteUris(call, pendingDeleteUris);
        pendingDeleteUris.clear();
    }

    private void deleteForAndroidTen(PluginCall call, List<Uri> uris) {
        try {
            deleteUrisNow(uris);
            call.resolve(deleteResult(uris));
        } catch (android.app.RecoverableSecurityException e) {
            launchDeleteConfirmation(call, uris, e.getUserAction().getActionIntent().getIntentSender());
        } catch (Exception e) {
            call.resolve(deleteResult(uris));
        }
    }

    private void launchDeleteConfirmation(PluginCall call, List<Uri> uris, IntentSender sender) {
        pendingDeleteCall = call;
        pendingDeleteUris = new ArrayList<>(uris);
        getBridge().saveCall(call);
        deleteRequestLauncher.launch(new IntentSenderRequest.Builder(sender).build());
    }

    private void onDeleteRequestResult(ActivityResult result) {
        PluginCall call = pendingDeleteCall;
        pendingDeleteCall = null;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            call.resolve(deleteResult(pendingDeleteUris));
            pendingDeleteUris.clear();
            return;
        }
        try {
            if (Build.VERSION.SDK_INT == 29) deleteUrisNow(pendingDeleteUris);
        } catch (Exception e) {
            // Report the items that were actually removed; the web layer will refresh and explain partial failures.
        } finally {
            call.resolve(deleteResult(pendingDeleteUris));
            pendingDeleteUris.clear();
        }
    }

    private void deleteUris(PluginCall call, List<Uri> uris) {
        try {
            deleteUrisNow(uris);
        } catch (Exception e) {
            // Some rows may already have been removed. Return a per-item result so the gallery can refresh safely.
        } finally {
            call.resolve(deleteResult(uris));
        }
    }

    private JSObject deleteResult(List<Uri> uris) {
        JSArray deletedKeys = new JSArray();
        int deletedCount = 0;
        for (Uri uri : uris) {
            if (uriExists(uri)) continue;
            String type = uri.toString().contains("/video/") ? "video" : "image";
            deletedKeys.put(type + ":" + uri.getLastPathSegment());
            deletedCount++;
        }
        JSObject result = new JSObject();
        result.put("deleted", deletedCount == uris.size());
        result.put("deletedKeys", deletedKeys);
        result.put("deletedCount", deletedCount);
        result.put("requestedCount", uris.size());
        return result;
    }

    private boolean uriExists(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { MediaStore.MediaColumns._ID }, null, null, null)) {
            return cursor != null && cursor.moveToFirst();
        } catch (Exception e) {
            return true;
        }
    }

    private void deleteUrisNow(List<Uri> uris) {
        ContentResolver resolver = getContext().getContentResolver();
        for (Uri uri : uris) resolver.delete(uri, null, null);
    }

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
        Long addedAfterValue = call.getLong("addedAfter");
        long addedAfter = addedAfterValue == null ? 0L : addedAfterValue;
        String mediaId = call.getString("mediaId");
        String type = call.getString("mediaType", "all");
        JSArray media = new JSArray();
        try {
            ContentResolver resolver = getContext().getContentResolver();
            queryMedia(resolver, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image", type, limit, offset, addedAfter, mediaId, media);
            queryMedia(resolver, MediaStore.Video.Media.EXTERNAL_CONTENT_URI, "video", type, limit, offset, addedAfter, mediaId, media);
            JSObject result = new JSObject();
            result.put("media", media);
            result.put("count", media.length());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Unable to scan device media", e);
        }
    }

    private void queryMedia(ContentResolver resolver, Uri collection, String kind, String requestedType,
                            int limit, int offset, long addedAfter, String mediaId, JSArray output) {
        if (!"all".equals(requestedType) && !kind.equals(requestedType)) return;
        String sort = MediaStore.MediaColumns.DATE_ADDED + " DESC";
        String[] projection = "video".equals(kind)
            ? new String[] {
                MediaStore.MediaColumns._ID,
                MediaStore.MediaColumns.DISPLAY_NAME,
                MediaStore.MediaColumns.DATE_ADDED,
                MediaStore.Images.ImageColumns.DATE_TAKEN,
                MediaStore.MediaColumns.SIZE,
                MediaStore.MediaColumns.MIME_TYPE,
                MediaStore.MediaColumns.WIDTH,
                MediaStore.MediaColumns.HEIGHT,
                MediaStore.MediaColumns.DURATION,
                MediaStore.MediaColumns.BUCKET_DISPLAY_NAME,
                MediaStore.MediaColumns.BUCKET_ID
            }
            : COMMON_PROJECTION;
        String selection = mediaId != null ? MediaStore.MediaColumns._ID + " = ?"
            : addedAfter > 0 ? MediaStore.MediaColumns.DATE_ADDED + " >= ?" : null;
        String[] selectionArgs = mediaId != null ? new String[] { mediaId }
            : addedAfter > 0 ? new String[] { Long.toString(addedAfter) } : null;
        Cursor queriedCursor;
        try {
            queriedCursor = resolver.query(collection, projection, selection, selectionArgs, sort);
        } catch (RuntimeException unsupportedDateTaken) {
            // Some vendor MediaStore providers do not expose DATE_TAKEN for both
            // image and video collections. Retry the legacy projection so the
            // gallery can still load, using DATE_ADDED as its timestamp fallback.
            String[] fallbackProjection = new String[projection.length - 1];
            int fallbackIndex = 0;
            for (String column : projection) {
                if (!MediaStore.Images.ImageColumns.DATE_TAKEN.equals(column)) {
                    fallbackProjection[fallbackIndex++] = column;
                }
            }
            queriedCursor = resolver.query(collection, fallbackProjection, selection, selectionArgs, sort);
        }
        try (Cursor cursor = queriedCursor) {
            if (cursor == null) return;
            int idCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID);
            int nameCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME);
            int dateCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED);
            int dateTakenCol = cursor.getColumnIndex(MediaStore.Images.ImageColumns.DATE_TAKEN);
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
                long dateAdded = cursor.getLong(dateCol) * 1000L;
                long dateTaken = dateTakenCol >= 0 ? cursor.getLong(dateTakenCol) : 0L;
                item.put("dateTaken", dateTaken > 0 ? dateTaken : dateAdded);
                item.put("dateAdded", dateAdded);
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
                bitmap = getContext().getContentResolver().loadThumbnail(uri, new Size(256, 256), null);
            } else {
                long mediaId = Long.parseLong(id);
                bitmap = "video".equals(type)
                    ? MediaStore.Video.Thumbnails.getThumbnail(getContext().getContentResolver(), mediaId, MediaStore.Video.Thumbnails.MINI_KIND, null)
                    : MediaStore.Images.Thumbnails.getThumbnail(getContext().getContentResolver(), mediaId, MediaStore.Images.Thumbnails.MINI_KIND, null);
            }
            if (bitmap == null) throw new IllegalStateException("Thumbnail unavailable");
            ByteArrayOutputStream stream = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 72, stream);
            JSObject result = new JSObject();
            result.put("thumbnail", "data:image/jpeg;base64," + Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception e) { call.reject("Unable to load media thumbnail", e); }
    }

    @PluginMethod
    public void getAlbums(PluginCall call) {
        if (!permissionResult().optBoolean("granted")) { call.resolve(new JSObject().put("albums", new JSArray())); return; }
        Map<String, Integer> counts = new HashMap<>();
        Map<String, String> names = new HashMap<>();
        ContentResolver resolver = getContext().getContentResolver();
        collectAlbums(resolver, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, counts, names);
        collectAlbums(resolver, MediaStore.Video.Media.EXTERNAL_CONTENT_URI, counts, names);
        JSArray albums = new JSArray();
        for (String id : counts.keySet()) {
            JSObject album = new JSObject();
            album.put("id", id); album.put("name", names.get(id)); album.put("count", counts.get(id)); album.put("type", "auto");
            albums.put(album);
        }
        call.resolve(new JSObject().put("albums", albums));
    }

    private void collectAlbums(ContentResolver resolver, Uri collection, Map<String, Integer> counts, Map<String, String> names) {
        String[] columns = { MediaStore.MediaColumns.BUCKET_DISPLAY_NAME, MediaStore.MediaColumns.BUCKET_ID };
        try (Cursor cursor = resolver.query(collection, columns, null, null, null)) {
            if (cursor == null) return;
            while (cursor.moveToNext()) {
                String name = cursor.getString(0);
                String id = cursor.getString(1);
                if (name == null) name = "Unknown";
                String key = id == null ? name : id;
                counts.put(key, counts.containsKey(key) ? counts.get(key) + 1 : 1);
                names.put(key, name);
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
                    if (uri != null) event.put("uri", uri.toString());
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
