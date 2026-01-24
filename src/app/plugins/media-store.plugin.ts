import { registerPlugin } from '@capacitor/core';

export interface MediaStorePlugin {
  /**
   * Check current permissions status
   */
  checkPermissions(): Promise<{ granted: boolean; images?: boolean; video?: boolean; storage?: boolean }>;

  /**
   * Request necessary permissions
   */
  requestPermissions(): Promise<{ granted: boolean; images?: boolean; video?: boolean; storage?: boolean }>;

  /**
   * Scan device for media files
   * @param options Scan options including limit, offset, and mediaType
   */
  scanMedia(options?: { 
    limit?: number; 
    offset?: number; 
    mediaType?: 'image' | 'video' | 'all' 
  }): Promise<{ media: MediaItem[][]; count: number }>;

  /**
   * Get thumbnail for a media item
   * @param options Media ID and type
   */
  getThumbnail(options: { 
    id: string; 
    type: 'image' | 'video' 
  }): Promise<{ thumbnail: string }>;

  /**
   * Get all albums/folders
   */
  getAlbums(): Promise<{ albums: AlbumInfo[] }>;

  /**
   * Start listening for media changes
   */
  startMediaChangeListener(): Promise<{ listening: boolean }>;

  /**
   * Stop listening for media changes
   */
  stopMediaChangeListener(): Promise<{ listening: boolean }>;

  /**
   * Add listener for media changes
   */
  addListener(
    eventName: 'mediaChanged',
    listenerFunc: (data: { event: string; timestamp: number }) => void
  ): Promise<any>;

  /**
   * Remove all listeners
   */
  removeAllListeners(): Promise<void>;
}

export interface MediaItem {
  id: string;
  name: string;
  dateTaken: number;
  size: number;
  uri: string;
  path: string;
  type: 'image' | 'video';
  bucket: string;
  width: number;
  height: number;
  duration?: number; // Only for videos
}

export interface AlbumInfo {
  id: string;
  name: string;
  count: number;
  type: 'auto' | 'custom';
}

const MediaStore = registerPlugin<MediaStorePlugin>('MediaStore');

export default MediaStore;
