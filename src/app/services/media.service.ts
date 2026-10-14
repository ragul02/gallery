import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import MediaStore, { MediaItem, AlbumInfo } from '../plugins/media-store.plugin';

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
  private readonly PERMISSION_KEY = 'has_media_permission';
  private readonly INITIAL_SCAN_KEY = 'initial_media_scan_done';

  constructor() {
    this.initializeMediaListener();
  }

  /**
   * Check if permissions are granted
   */
  async checkPermissions(): Promise<boolean> {
    console.log('🔵 MediaService: checkPermissions - START');
    try {
      const result = await MediaStore.checkPermissions();
      console.log('🔵 MediaService: MediaStore.checkPermissions() result:', JSON.stringify(result));
      this.hasPermission = result.granted;
      console.log('🔵 MediaService: hasPermission set to:', this.hasPermission);
      return result.granted;
    } catch (error) {
      console.error('🔴 MediaService: Error checking permissions:', error);
      return false;
    }
  }

  /**
   * Request media permissions
   */
  async requestPermissions(): Promise<boolean> {
    console.log('🔵 MediaService: requestPermissions - START');
    try {
      const currentResult = await MediaStore.checkPermissions();
      console.log('🔵 MediaService: Current permission status:', JSON.stringify(currentResult));

      if (!currentResult.granted) {
        console.log('🟡 MediaService: Permission not granted, requesting...');
        console.log('🔵 MediaService: Calling MediaStore.requestPermissions()');
        
        const result = await MediaStore.requestPermissions();
        
        console.log('🔵 MediaService: MediaStore.requestPermissions() returned:', JSON.stringify(result));
        
        this.hasPermission = result.granted;
        
        if (result.granted) {
          console.log('🟢 MediaService: Permission GRANTED, saving to preferences');
          await Preferences.set({
            key: this.PERMISSION_KEY,
            value: 'true'
          });
        } else {
          console.log('🔴 MediaService: Permission DENIED');
        }
        
        return result.granted;
      }

      console.log('🟢 MediaService: Permission already granted');
      this.hasPermission = true;
      return true;
    } catch (error) {
      console.error('🔴 MediaService: Error requesting permissions:', error);
      console.error('🔴 MediaService: Error details:', JSON.stringify(error));
      return false;
    }
  }

  private hasMissingMediaPermission(result: {
    granted: boolean;
    images?: boolean;
    video?: boolean;
    storage?: boolean;
  }): boolean {
    return !result.granted;
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

    this.hasPermission = await this.checkPermissions();
    if (!this.hasPermission) {
      const granted = await this.requestPermissions();
      if (!granted) {
        throw new Error('Permission denied');
      }
    }

    this.isScanning = true;

    try {
      if (!options?.forceRefresh) {
        const cached = await this.loadCachedMedia();
        if (cached.length > 0) {
          this.mediaItems = cached;
          await this.markInitialScanComplete();
          return cached;
        }
      }

      const batchSize = 100;
      let offset = 0;
      let allMedia: MediaItem[] = [];
      let hasMore = true;

      while (hasMore) {
        const result = await MediaStore.scanMedia({
          limit: batchSize,
          offset,
          mediaType: 'all'
        });

        const flatMedia = this.normalizeMediaList(result);
        if (flatMedia.length === 0) {
          hasMore = false;
        } else {
          allMedia = allMedia.concat(flatMedia);
          offset += batchSize;

          if (options?.progressCallback) {
            options.progressCallback(allMedia.length, allMedia.length);
          }

          if (flatMedia.length < batchSize) {
            hasMore = false;
          }
        }
      }

      this.mediaItems = allMedia;
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

    if (filter?.type && filter.type !== 'all') {
      filtered = filtered.filter(item => item.type === filter.type);
    }

    if (filter?.album) {
      filtered = filtered.filter(item => {
        const albumKey = (item as MediaItem & { bucketId?: string }).bucketId ?? item.bucket;
        return albumKey === filter.album || item.bucket === filter.album;
      });
    }

    filtered = this.sortMedia(filtered, sortType);

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
        return items.sort((a, b) => (Number(b.dateTaken) || 0) - (Number(a.dateTaken) || 0));
      case MediaSortType.DATE_ASC:
        return items.sort((a, b) => (Number(a.dateTaken) || 0) - (Number(b.dateTaken) || 0));
      case MediaSortType.NAME_ASC:
        return items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      case MediaSortType.NAME_DESC:
        return items.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
      case MediaSortType.SIZE_DESC:
        return items.sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0));
      case MediaSortType.SIZE_ASC:
        return items.sort((a, b) => (Number(a.size) || 0) - (Number(b.size) || 0));
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
      if (!result.value) {
        return [];
      }

      const parsed = JSON.parse(result.value);
      if (Array.isArray(parsed)) {
        return parsed as MediaItem[];
      }

      if (parsed && Array.isArray(parsed.media)) {
        return this.normalizeMediaList(parsed as { media?: MediaItem[] });
      }
    } catch (error) {
      console.error('Error loading cached media:', error);
    }
    return [];
  }

  private normalizeMediaList(result: { media?: MediaItem[] | ArrayLike<MediaItem> } | MediaItem[] | null | undefined): MediaItem[] {
    const entries = Array.isArray(result) ? result : result?.media ?? [];
    const items: MediaItem[] = [];

    for (const entry of Array.from(entries as ArrayLike<MediaItem>)) {
      if (!entry) {
        continue;
      }

      if (Array.isArray(entry)) {
        items.push(...entry);
      } else {
        items.push(entry as MediaItem);
      }
    }

    return items.filter(Boolean);
  }

  /**
   * Clear all cached data
   */
  async clearCache() {
    this.mediaItems = [];
    this.thumbnailCache.clear();
    await Preferences.remove({ key: this.CACHE_KEY });
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
