import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import MediaStore, { MediaItem, AlbumInfo } from '../plugins/media-store.plugin';

export interface CachedThumbnail {
  id: string;
  thumbnail: string;
  timestamp: number;
}

export interface MediaFilter {
  type?: 'image' | 'video' | 'all';
  album?: string;
}

export enum MediaSortType {
  DATE_DESC = 'date_desc',
  DATE_ASC = 'date_asc',
  NAME_ASC = 'name_asc',
  NAME_DESC = 'name_desc',
  SIZE_DESC = 'size_desc',
  SIZE_ASC = 'size_asc'
}

@Injectable({
  providedIn: 'root'
})
export class MediaService {
  private mediaItems: MediaItem[] = [];
  private albums: AlbumInfo[] = [];
  private thumbnailCache = new Map<string, string>();
  private isScanning = false;
  private hasPermission = false;
  private mediaChangeListenerActive = false;

  private readonly CACHE_KEY = 'media_cache';
  private readonly THUMBNAIL_CACHE_KEY = 'thumbnail_cache';
  private readonly PERMISSION_KEY = 'has_media_permission';
  private readonly INITIAL_SCAN_KEY = 'initial_media_scan_done';

  constructor() {
    this.initializeMediaListener();
  }

  /**
   * Check if permissions are granted
   */
  async checkPermissions(): Promise<boolean> {
    try {
      const result = await MediaStore.checkPermissions();
      this.hasPermission = result.granted;
      return result.granted;
    } catch (error) {
      console.error('Error checking permissions:', error);
      return false;
    }
  }

  /**
   * Request media permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const result = await MediaStore.requestPermissions();
      this.hasPermission = result.granted;
      
      if (result.granted) {
        await Preferences.set({
          key: this.PERMISSION_KEY,
          value: 'true'
        });
      }
      
      return result.granted;
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return false;
    }
  }

  /**
   * Check if initial scan has been completed
   */
  async hasCompletedInitialScan(): Promise<boolean> {
    const result = await Preferences.get({ key: this.INITIAL_SCAN_KEY });
    return result.value === 'true';
  }

  /**
   * Mark initial scan as complete
   */
  private async markInitialScanComplete() {
    await Preferences.set({
      key: this.INITIAL_SCAN_KEY,
      value: 'true'
    });
  }

  /**
   * Scan all media from device
   */
  async scanAllMedia(
    options?: { 
      forceRefresh?: boolean;
      progressCallback?: (loaded: number, total: number) => void;
    }
  ): Promise<MediaItem[]> {
    if (this.isScanning) {
      return this.mediaItems;
    }

    if (!this.hasPermission) {
      const granted = await this.requestPermissions();
      if (!granted) {
        throw new Error('Permission denied');
      }
    }

    this.isScanning = true;

    try {
      // Load from cache first if not forcing refresh
      if (!options?.forceRefresh) {
        const cached = await this.loadCachedMedia();
        if (cached.length > 0) {
          this.mediaItems = cached;
          this.isScanning = false;
          return cached;
        }
      }

      // Scan media in batches
      const batchSize = 100;
      let offset = 0;
      let allMedia: MediaItem[] = [];
      let hasMore = true;

      while (hasMore) {
        const result = await MediaStore.scanMedia({
          limit: batchSize,
          offset: offset,
          mediaType: 'all'
        });

        // Flatten the nested array structure
        const flatMedia: MediaItem[] = [];
        if (result.media && Array.isArray(result.media)) {
          for (const batch of result.media) {
            if (Array.isArray(batch)) {
              flatMedia.push(...batch);
            }
          }
        }

        if (flatMedia.length === 0) {
          hasMore = false;
        } else {
          allMedia = allMedia.concat(flatMedia);
          offset += batchSize;

          // Report progress
          if (options?.progressCallback) {
            options.progressCallback(allMedia.length, allMedia.length);
          }

          // Stop if we got fewer than batchSize items
          if (flatMedia.length < batchSize) {
            hasMore = false;
          }
        }
      }

      this.mediaItems = allMedia;
      
      // Cache the results
      await this.cacheMedia(allMedia);
      await this.markInitialScanComplete();

      return allMedia;
    } catch (error) {
      console.error('Error scanning media:', error);
      throw error;
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Get media with filtering and sorting
   */
  getMedia(
    filter?: MediaFilter,
    sortType: MediaSortType = MediaSortType.DATE_DESC,
    limit?: number
  ): MediaItem[] {
    let filtered = [...this.mediaItems];

    // Apply filters
    if (filter?.type && filter.type !== 'all') {
      filtered = filtered.filter(item => item.type === filter.type);
    }

    if (filter?.album) {
      filtered = filtered.filter(item => item.bucket === filter.album);
    }

    // Apply sorting
    filtered = this.sortMedia(filtered, sortType);

    // Apply limit
    if (limit) {
      filtered = filtered.slice(0, limit);
    }

    return filtered;
  }

  /**
   * Sort media items
   */
  private sortMedia(items: MediaItem[], sortType: MediaSortType): MediaItem[] {
    switch (sortType) {
      case MediaSortType.DATE_DESC:
        return items.sort((a, b) => b.dateTaken - a.dateTaken);
      case MediaSortType.DATE_ASC:
        return items.sort((a, b) => a.dateTaken - b.dateTaken);
      case MediaSortType.NAME_ASC:
        return items.sort((a, b) => a.name.localeCompare(b.name));
      case MediaSortType.NAME_DESC:
        return items.sort((a, b) => b.name.localeCompare(a.name));
      case MediaSortType.SIZE_DESC:
        return items.sort((a, b) => b.size - a.size);
      case MediaSortType.SIZE_ASC:
        return items.sort((a, b) => a.size - b.size);
      default:
        return items;
    }
  }

  /**
   * Get thumbnail for media item
   */
  async getThumbnail(mediaId: string, mediaType: 'image' | 'video'): Promise<string> {
    // Check cache first
    const cached = this.thumbnailCache.get(mediaId);
    if (cached) {
      return cached;
    }

    try {
      const result = await MediaStore.getThumbnail({
        id: mediaId,
        type: mediaType
      });

      // Cache the thumbnail
      this.thumbnailCache.set(mediaId, result.thumbnail);
      await this.cacheThumbnail(mediaId, result.thumbnail);

      return result.thumbnail;
    } catch (error) {
      console.error('Error getting thumbnail:', error);
      // Return placeholder
      return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2VlZSIvPjwvc3ZnPg==';
    }
  }

  /**
   * Get all albums/folders
   */
  async getAlbums(): Promise<AlbumInfo[]> {
    try {
      const result = await MediaStore.getAlbums();
      this.albums = result.albums;
      return result.albums;
    } catch (error) {
      console.error('Error getting albums:', error);
      return [];
    }
  }

  /**
   * Get media count for an album
   */
  getAlbumMediaCount(albumName: string): number {
    return this.mediaItems.filter(item => item.bucket === albumName).length;
  }

  /**
   * Get first media item in album (for cover)
   */
  getAlbumCover(albumName: string): MediaItem | undefined {
    return this.mediaItems.find(item => item.bucket === albumName);
  }

  /**
   * Initialize media change listener
   */
  private async initializeMediaListener() {
    try {
      await MediaStore.addListener('mediaChanged', async (data) => {
        console.log('Media changed:', data);
        // Refresh media in background
        await this.scanAllMedia({ forceRefresh: true });
      });

      await MediaStore.startMediaChangeListener();
      this.mediaChangeListenerActive = true;
    } catch (error) {
      console.error('Error initializing media listener:', error);
    }
  }

  /**
   * Stop media change listener
   */
  async stopMediaListener() {
    try {
      await MediaStore.stopMediaChangeListener();
      await MediaStore.removeAllListeners();
      this.mediaChangeListenerActive = false;
    } catch (error) {
      console.error('Error stopping media listener:', error);
    }
  }

  /**
   * Cache media to storage
   */
  private async cacheMedia(media: MediaItem[]) {
    try {
      await Preferences.set({
        key: this.CACHE_KEY,
        value: JSON.stringify(media)
      });
    } catch (error) {
      console.error('Error caching media:', error);
    }
  }

  /**
   * Load cached media
   */
  private async loadCachedMedia(): Promise<MediaItem[]> {
    try {
      const result = await Preferences.get({ key: this.CACHE_KEY });
      if (result.value) {
        return JSON.parse(result.value);
      }
    } catch (error) {
      console.error('Error loading cached media:', error);
    }
    return [];
  }

  /**
   * Cache a single thumbnail
   */
  private async cacheThumbnail(id: string, thumbnail: string) {
    try {
      const cacheEntry: CachedThumbnail = {
        id,
        thumbnail,
        timestamp: Date.now()
      };

      // Store in preferences (limited by size, so we only cache recent ones)
      const existingCache = await this.loadThumbnailCache();
      existingCache.set(id, cacheEntry);

      // Keep only last 100 thumbnails
      if (existingCache.size > 100) {
        const entries = Array.from(existingCache.entries());
        entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
        existingCache.clear();
        entries.slice(0, 100).forEach(([key, value]) => {
          existingCache.set(key, value);
        });
      }

      await Preferences.set({
        key: this.THUMBNAIL_CACHE_KEY,
        value: JSON.stringify(Array.from(existingCache.entries()))
      });
    } catch (error) {
      console.error('Error caching thumbnail:', error);
    }
  }

  /**
   * Load thumbnail cache
   */
  private async loadThumbnailCache(): Promise<Map<string, CachedThumbnail>> {
    try {
      const result = await Preferences.get({ key: this.THUMBNAIL_CACHE_KEY });
      if (result.value) {
        const entries = JSON.parse(result.value);
        return new Map(entries);
      }
    } catch (error) {
      console.error('Error loading thumbnail cache:', error);
    }
    return new Map();
  }

  /**
   * Clear all cached data
   */
  async clearCache() {
    this.mediaItems = [];
    this.thumbnailCache.clear();
    await Preferences.remove({ key: this.CACHE_KEY });
    await Preferences.remove({ key: this.THUMBNAIL_CACHE_KEY });
  }

  /**
   * Get total media count
   */
  getTotalCount(): number {
    return this.mediaItems.length;
  }

  /**
   * Get image count
   */
  getImageCount(): number {
    return this.mediaItems.filter(item => item.type === 'image').length;
  }

  /**
   * Get video count
   */
  getVideoCount(): number {
    return this.mediaItems.filter(item => item.type === 'video').length;
  }
}
