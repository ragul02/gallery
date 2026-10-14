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
  }): Promise<{ media: MediaItem[]; count: number }>;

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
  key?: string;
  name: string;
  dateTaken: number;
  size: number;
  uri: string;
  path: string;
  type: 'image' | 'video';
  bucket: string;
  bucketId?: string;
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

console.log('🔵 MediaStore Plugin: Registering plugin...');
const MediaStore = registerPlugin<MediaStorePlugin>('MediaStore');
console.log('🔵 MediaStore Plugin: Plugin registered:', MediaStore);

// Add debugging wrapper
const OriginalMediaStore = MediaStore;
const DebugMediaStore = {
  async checkPermissions() {
    console.log('🔵 MediaStore.checkPermissions() called');
    try {
      const result = await OriginalMediaStore.checkPermissions();
      console.log('🔵 MediaStore.checkPermissions() result:', result);
      return result;
    } catch (error) {
      console.error('🔴 MediaStore.checkPermissions() error:', error);
      throw error;
    }
  },
  async requestPermissions() {
    console.log('🔵 MediaStore.requestPermissions() called');
    try {
      const result = await OriginalMediaStore.requestPermissions();
      console.log('🔵 MediaStore.requestPermissions() result:', result);
      return result;
    } catch (error) {
      console.error('🔴 MediaStore.requestPermissions() error:', error);
      throw error;
    }
  },
  scanMedia: OriginalMediaStore.scanMedia,
  getThumbnail: OriginalMediaStore.getThumbnail,
  getAlbums: OriginalMediaStore.getAlbums,
  startMediaChangeListener: OriginalMediaStore.startMediaChangeListener,
  stopMediaChangeListener: OriginalMediaStore.stopMediaChangeListener,
  addListener: OriginalMediaStore.addListener,
  removeAllListeners: OriginalMediaStore.removeAllListeners,
} as MediaStorePlugin;

export default DebugMediaStore;
