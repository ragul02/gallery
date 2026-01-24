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

import androidx.core.app.ActivityCompat;
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
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

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
        JSObject result = new JSObject();
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Android 13+
            boolean hasImages = ContextCompat.checkSelfPermission(
                getContext(), 
                Manifest.permission.READ_MEDIA_IMAGES
            ) == PackageManager.PERMISSION_GRANTED;
            
            boolean hasVideo = ContextCompat.checkSelfPermission(
                getContext(), 
                Manifest.permission.READ_MEDIA_VIDEO
            ) == PackageManager.PERMISSION_GRANTED;
            
            result.put("granted", hasImages && hasVideo);
            result.put("images", hasImages);
            result.put("video", hasVideo);
        } else {
            // Legacy permissions
            boolean hasStorage = ContextCompat.checkSelfPermission(
                getContext(), 
                Manifest.permission.READ_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED;
            
            result.put("granted", hasStorage);
            result.put("storage", hasStorage);
        }
        
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Android 13+
            requestPermissionForAlias("images", call, "permissionsCallback");
        } else {
            // Legacy
            requestPermissionForAlias("storage", call, "permissionsCallback");
        }
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

        int limit = call.getInt("limit", 100);
        int offset = call.getInt("offset", 0);
        String mediaType = call.getString("mediaType", "all"); // "image", "video", "all"

        try {
            JSArray mediaList = new JSArray();
            
            if (!mediaType.equals("video")) {
                mediaList.put(scanImages(limit, offset));
            }
            
            if (!mediaType.equals("image")) {
                mediaList.put(scanVideos(limit, offset));
            }

            JSObject result = new JSObject();
            result.put("media", mediaList);
            result.put("count", mediaList.length());
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error scanning media", e);
            call.reject("Error scanning media: " + e.getMessage());
        }
    }

    private JSArray scanImages(int limit, int offset) {
        JSArray images = new JSArray();
        ContentResolver contentResolver = getContext().getContentResolver();

        String[] projection = {
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.DATE_TAKEN,
            MediaStore.Images.Media.SIZE,
            MediaStore.Images.Media.DATA,
            MediaStore.Images.Media.BUCKET_DISPLAY_NAME,
            MediaStore.Images.Media.WIDTH,
            MediaStore.Images.Media.HEIGHT
        };

        String sortOrder = MediaStore.Images.Media.DATE_TAKEN + " DESC LIMIT " + limit + " OFFSET " + offset;

        try (Cursor cursor = contentResolver.query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            projection,
            null,
            null,
            sortOrder
        )) {
            if (cursor != null) {
                int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                int nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME);
                int dateTakenColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_TAKEN);
                int sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE);
                int dataColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATA);
                int bucketColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_DISPLAY_NAME);
                int widthColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH);
                int heightColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT);

                while (cursor.moveToNext()) {
                    long id = cursor.getLong(idColumn);
                    String name = cursor.getString(nameColumn);
                    long dateTaken = cursor.getLong(dateTakenColumn);
                    long size = cursor.getLong(sizeColumn);
                    String path = cursor.getString(dataColumn);
                    String bucket = cursor.getString(bucketColumn);
                    int width = cursor.getInt(widthColumn);
                    int height = cursor.getInt(heightColumn);

                    Uri contentUri = ContentUris.withAppendedId(
                        MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                        id
                    );

                    JSObject image = new JSObject();
                    image.put("id", String.valueOf(id));
                    image.put("name", name);
                    image.put("dateTaken", dateTaken);
                    image.put("size", size);
                    image.put("uri", contentUri.toString());
                    image.put("path", path);
                    image.put("type", "image");
                    image.put("bucket", bucket != null ? bucket : "Unknown");
                    image.put("width", width);
                    image.put("height", height);

                    images.put(image);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error scanning images", e);
        }

        return images;
    }

    private JSArray scanVideos(int limit, int offset) {
        JSArray videos = new JSArray();
        ContentResolver contentResolver = getContext().getContentResolver();

        String[] projection = {
            MediaStore.Video.Media._ID,
            MediaStore.Video.Media.DISPLAY_NAME,
            MediaStore.Video.Media.DATE_TAKEN,
            MediaStore.Video.Media.SIZE,
            MediaStore.Video.Media.DATA,
            MediaStore.Video.Media.BUCKET_DISPLAY_NAME,
            MediaStore.Video.Media.DURATION,
            MediaStore.Video.Media.WIDTH,
            MediaStore.Video.Media.HEIGHT
        };

        String sortOrder = MediaStore.Video.Media.DATE_TAKEN + " DESC LIMIT " + limit + " OFFSET " + offset;

        try (Cursor cursor = contentResolver.query(
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
            projection,
            null,
            null,
            sortOrder
        )) {
            if (cursor != null) {
                int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID);
                int nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME);
                int dateTakenColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DATE_TAKEN);
                int sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.SIZE);
                int dataColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DATA);
                int bucketColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.BUCKET_DISPLAY_NAME);
                int durationColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DURATION);
                int widthColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.WIDTH);
                int heightColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.HEIGHT);

                while (cursor.moveToNext()) {
                    long id = cursor.getLong(idColumn);
                    String name = cursor.getString(nameColumn);
                    long dateTaken = cursor.getLong(dateTakenColumn);
                    long size = cursor.getLong(sizeColumn);
                    String path = cursor.getString(dataColumn);
                    String bucket = cursor.getString(bucketColumn);
                    long duration = cursor.getLong(durationColumn);
                    int width = cursor.getInt(widthColumn);
                    int height = cursor.getInt(heightColumn);

                    Uri contentUri = ContentUris.withAppendedId(
                        MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                        id
                    );

                    JSObject video = new JSObject();
                    video.put("id", String.valueOf(id));
                    video.put("name", name);
                    video.put("dateTaken", dateTaken);
                    video.put("size", size);
                    video.put("uri", contentUri.toString());
                    video.put("path", path);
                    video.put("type", "video");
                    video.put("bucket", bucket != null ? bucket : "Unknown");
                    video.put("duration", duration);
                    video.put("width", width);
                    video.put("height", height);

                    videos.put(video);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error scanning videos", e);
        }

        return videos;
    }

    @PluginMethod
    public void getThumbnail(PluginCall call) {
        if (!hasRequiredPermissions()) {
            call.reject("Permission denied");
            return;
        }

        String mediaId = call.getString("id");
        String mediaType = call.getString("type", "image");
        
        if (mediaId == null) {
            call.reject("Media ID is required");
            return;
        }

        try {
            Bitmap thumbnail = null;
            long id = Long.parseLong(mediaId);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+ use native thumbnail API
                Uri contentUri;
                if (mediaType.equals("video")) {
                    contentUri = ContentUris.withAppendedId(
                        MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                        id
                    );
                } else {
                    contentUri = ContentUris.withAppendedId(
                        MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                        id
                    );
                }

                thumbnail = getContext().getContentResolver().loadThumbnail(
                    contentUri,
                    new Size(512, 512),
                    null
                );
            } else {
                // Legacy thumbnail generation
                if (mediaType.equals("video")) {
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
            }

            if (thumbnail != null) {
                ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                thumbnail.compress(Bitmap.CompressFormat.JPEG, 80, outputStream);
                byte[] thumbnailBytes = outputStream.toByteArray();
                
                String base64Thumbnail;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    base64Thumbnail = Base64.getEncoder().encodeToString(thumbnailBytes);
                } else {
                    base64Thumbnail = android.util.Base64.encodeToString(thumbnailBytes, android.util.Base64.NO_WRAP);
                }

                JSObject result = new JSObject();
                result.put("thumbnail", "data:image/jpeg;base64," + base64Thumbnail);
                call.resolve(result);
            } else {
                call.reject("Failed to generate thumbnail");
            }
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
            JSArray albums = new JSArray();
            ContentResolver contentResolver = getContext().getContentResolver();

            // Get image buckets
            String[] projection = {
                MediaStore.Images.Media.BUCKET_ID,
                MediaStore.Images.Media.BUCKET_DISPLAY_NAME,
                "COUNT(*) as count"
            };

            String sortOrder = MediaStore.Images.Media.BUCKET_DISPLAY_NAME + " ASC";

            try (Cursor cursor = contentResolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                new String[]{
                    MediaStore.Images.Media.BUCKET_ID,
                    MediaStore.Images.Media.BUCKET_DISPLAY_NAME,
                    MediaStore.Images.Media._ID
                },
                null,
                null,
                sortOrder
            )) {
                if (cursor != null) {
                    List<String> seenBuckets = new ArrayList<>();
                    
                    int bucketIdColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_ID);
                    int bucketNameColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_DISPLAY_NAME);

                    while (cursor.moveToNext()) {
                        String bucketId = cursor.getString(bucketIdColumn);
                        String bucketName = cursor.getString(bucketNameColumn);

                        if (bucketId != null && !seenBuckets.contains(bucketId)) {
                            seenBuckets.add(bucketId);
                            
                            // Count media in this bucket
                            int count = getMediaCountInBucket(bucketId);

                            JSObject album = new JSObject();
                            album.put("id", bucketId);
                            album.put("name", bucketName != null ? bucketName : "Unknown");
                            album.put("count", count);
                            album.put("type", "auto");

                            albums.put(album);
                        }
                    }
                }
            }

            JSObject result = new JSObject();
            result.put("albums", albums);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error getting albums", e);
            call.reject("Error getting albums: " + e.getMessage());
        }
    }

    private int getMediaCountInBucket(String bucketId) {
        ContentResolver contentResolver = getContext().getContentResolver();
        String selection = MediaStore.Images.Media.BUCKET_ID + " = ?";
        String[] selectionArgs = { bucketId };

        try (Cursor cursor = contentResolver.query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            new String[]{"COUNT(*) as count"},
            selection,
            selectionArgs,
            null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                return cursor.getInt(0);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error counting media in bucket", e);
        }

        return 0;
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

    private boolean hasRequiredPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return ContextCompat.checkSelfPermission(
                getContext(), 
                Manifest.permission.READ_MEDIA_IMAGES
            ) == PackageManager.PERMISSION_GRANTED;
        } else {
            return ContextCompat.checkSelfPermission(
                getContext(), 
                Manifest.permission.READ_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED;
        }
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
