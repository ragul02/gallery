import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActionSheetController, AlertController, LoadingController } from '@ionic/angular';
import { Router } from '@angular/router';
import { PhotoService } from '../../services/photo.service';
import { MediaService, MediaSortType, MediaFilter } from '../../services/media.service';
import { Photo, SortType, MediaItemView, MediaFilterType } from '../../models/gallery.model';
import { MediaItem } from '../../plugins/media-store.plugin';
import { SystemBarsService } from '../../services/system-bars.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false
})
export class HomePage implements OnInit, OnDestroy {
  private unsubscribeMediaUpdates?: () => void;
  // Legacy photos from PhotoService
  photos: Photo[] = [];
  
  // New media from MediaService
  mediaItems: MediaItemView[] = [];
  displayedMedia: MediaItemView[] = [];
  thumbnails = new Map<string, string>();
  
  currentSort: MediaSortType = MediaSortType.DATE_DESC;
  currentFilter: MediaFilterType = MediaFilterType.ALL;
  activeAlbumName = '';
  activeAlbumId = '';
  readonly MediaFilterType = MediaFilterType;
  sortTypes = SortType;
  
  isLoading = false;
  hasPermission = false;
  batchSize = 50;
  currentBatch = 0;
  
  // Thumbnail loading queue
  private thumbnailQueue: MediaItemView[] = [];
  private loadingThumbnails = false;
  private longPressTimer?: ReturnType<typeof setTimeout>;
  private suppressNextMediaClick = false;
  selectionMode = false;
  selectedMediaKeys = new Set<string>();

  constructor(
    public photoService: PhotoService,
    private mediaService: MediaService,
    public actionSheetController: ActionSheetController,
    private alertController: AlertController,
    private loadingController: LoadingController,
    public router: Router,
    private systemBars: SystemBarsService
  ) {}

  async ngOnInit() {
    console.log('🔵 HomePage: ngOnInit called');
    this.unsubscribeMediaUpdates = this.mediaService.subscribeMediaUpdated(() => { void this.refreshMedia(); });
    await this.initializeGallery();
  }

  ngOnDestroy() {
    this.unsubscribeMediaUpdates?.();
  }

  async ionViewWillEnter() {
    await this.systemBars.setHidden(true);
    await this.photoService.whenReady();

    // Check for album filter from query params
    const albumFilter = this.router.routerState.snapshot.root.queryParams['album'];
    if (albumFilter) {
      this.activeAlbumName = albumFilter;
      this.activeAlbumId = this.router.routerState.snapshot.root.queryParams['albumId'] || '';
      this.currentFilter = MediaFilterType.ALL;
      await this.mediaService.refreshRecentMedia(false);
      await this.loadMediaFromStore(albumFilter, this.activeAlbumId);
    } else {
      this.activeAlbumName = '';
      this.activeAlbumId = '';
      this.loadLegacyPhotos();
      if (this.hasPermission) {
        await this.mediaService.refreshRecentMedia(false);
        await this.refreshMedia();
      }
    }
  }

  async initializeGallery() {
    console.log('🔵 HomePage: initializeGallery - START');
    await this.photoService.whenReady();
    console.log('🔵 HomePage: PhotoService ready');
    
    this.loadLegacyPhotos();
    console.log('🔵 HomePage: Legacy photos loaded:', this.photos.length);

    const hasScanned = await this.mediaService.hasCompletedInitialScan();
    console.log('🔵 HomePage: hasCompletedInitialScan:', hasScanned);
    
    this.hasPermission = await this.mediaService.checkPermissions();
    console.log('🔵 HomePage: checkPermissions result:', this.hasPermission);

    if (!this.hasPermission) {
      console.log('🟡 HomePage: No permission, calling scanDeviceMedia with showMessage=false, forceRefresh=false');
      await this.scanDeviceMedia(false, false);
      return;
    }

    console.log('🟢 HomePage: Has permission, calling scanDeviceMedia with showMessage=false, forceRefresh=' + !hasScanned);
    await this.scanDeviceMedia(false, !hasScanned);
  }

  async scanDeviceMedia(showPermissionMessage = true, forceRefresh = false) {
    console.log('🔵 HomePage: scanDeviceMedia - START', { showPermissionMessage, forceRefresh });
    console.log('🔵 HomePage: About to call mediaService.requestPermissions()');
    
    const granted = await this.mediaService.requestPermissions();
    
    console.log('🔵 HomePage: mediaService.requestPermissions() returned:', granted);
    
    if (!granted) {
      this.hasPermission = false;
      console.log('🔴 HomePage: Permission NOT granted');
      if (showPermissionMessage) {
        const alert = await this.alertController.create({
          header: 'Permission Required',
          message: 'Allow photo and video access to scan your device media. You can change this in app settings.',
          buttons: ['OK']
        });
        await alert.present();
      }
      return;
    }

    console.log('🟢 HomePage: Permission granted! Setting hasPermission = true');
    this.hasPermission = true;

    // Show loading
    const loading = await this.loadingController.create({
      message: 'Scanning device for media...',
      spinner: 'circles'
    });
    await loading.present();
    console.log('🔵 HomePage: Loading dialog shown');

    try {
      console.log('🔵 HomePage: Starting media scan...');
      await this.mediaService.scanAllMedia({ forceRefresh });
      if (!forceRefresh) await this.mediaService.refreshRecentMedia(false);

      await loading.dismiss();
      console.log('🟢 HomePage: Media scan completed successfully');

      // Load the media
      await this.loadMediaFromStore();
      console.log('🟢 HomePage: Media loaded to display');
    } catch (error) {
      await loading.dismiss();
      console.error('🔴 HomePage: Error scanning media:', error);
      
      const errorAlert = await this.alertController.create({
        header: 'Scan Failed',
        message: 'Could not scan device media. Please try again or check app permissions.',
        buttons: ['OK']
      });
      await errorAlert.present();
      
      // Fall back to legacy
      this.loadLegacyPhotos();
    }
  }

  async loadMediaFromStore(albumName?: string, albumId?: string) {
    this.isLoading = true;
    this.displayedMedia = [];
    this.currentBatch = 0;
    this.thumbnailQueue = [];

    try {
      const filter: MediaFilter = {
        type: this.currentFilter === MediaFilterType.ALL ? undefined : this.currentFilter,
        album: albumName,
        albumId
      };

      const allMedia = this.mediaService.getMedia(filter, this.currentSort);
      
      // Convert to view models
      this.mediaItems = allMedia.map(item => this.convertToViewModel(item));
      
      // Load first batch
      this.currentBatch = 0;
      this.loadNextBatch();
    } catch (error) {
      console.error('Error loading media:', error);
    } finally {
      this.isLoading = false;
    }
  }

  convertToViewModel(item: MediaItem): MediaItemView {
    return {
      id: item.id,
      name: item.name,
      dateTaken: new Date(item.dateTaken),
      size: item.size,
      uri: item.uri,
      type: item.type,
      bucket: item.bucket,
      width: item.width,
      height: item.height,
      duration: item.duration
    };
  }

  loadNextBatch() {
    const start = this.currentBatch * this.batchSize;
    const end = start + this.batchSize;
    const newItems = this.mediaItems.slice(start, end);
    
    if (newItems.length > 0) {
      this.displayedMedia = [...this.displayedMedia, ...newItems];
      this.currentBatch++;
      
      // Queue thumbnails for loading
      newItems.forEach(item => {
        const cachedThumbnail = this.thumbnails.get(item.id);
        if (cachedThumbnail) {
          item.thumbnailUrl = cachedThumbnail;
        } else {
          this.thumbnailQueue.push(item);
        }
      });
      
      this.processThumbnailQueue();
    }
  }

  async processThumbnailQueue() {
    if (this.loadingThumbnails || this.thumbnailQueue.length === 0) {
      return;
    }

    this.loadingThumbnails = true;

    // Load thumbnails in small batches to avoid overwhelming the system
    const batchSize = 8;
    while (this.thumbnailQueue.length > 0) {
      const batch = this.thumbnailQueue.splice(0, batchSize);
      
      await Promise.all(
        batch.map(async (media) => {
          const mediaId = media.id;
          if (!this.thumbnails.has(mediaId)) {
            try {
              const thumbnail = await this.mediaService.getThumbnail(mediaId, media.type);
              this.thumbnails.set(mediaId, thumbnail);
              media.thumbnailUrl = thumbnail;
            } catch (error) {
              console.error('Error loading thumbnail:', error);
            }
          }
        })
      );

    }

    this.loadingThumbnails = false;
  }

  getThumbnail(mediaId: string): string {
    return this.thumbnails.get(mediaId) || '';
  }

  onScroll(event: any) {
    const scrollElement = event.target;
    const scrollHeight = scrollElement.scrollHeight;
    const scrollTop = scrollElement.scrollTop;
    const clientHeight = scrollElement.clientHeight;

    // Load more when scrolled to 80% of content
    if (scrollTop + clientHeight >= scrollHeight * 0.8) {
      if (this.displayedMedia.length < this.mediaItems.length) {
        this.loadNextBatch();
      }
    }
  }

  loadLegacyPhotos() {
    this.photos = this.photoService.getPhotos(this.currentSort as any);
  }

  openPhotoViewer(photo: Photo) {
    this.router.navigate(['/viewer', photo.id], {
      queryParams: { source: 'local' }
    });
  }

  async openMediaViewer(media: MediaItemView) {
    this.router.navigate(['/viewer', media.id], {
      queryParams: {
        filter: this.currentFilter !== MediaFilterType.ALL ? this.currentFilter : null
      }
    });
  }

  private mediaKey(media: MediaItemView): string {
    return `${media.type}:${media.id}`;
  }

  startMediaLongPress(media: MediaItemView) {
    this.cancelMediaLongPress();
    this.longPressTimer = setTimeout(() => {
      this.selectionMode = true;
      this.selectedMediaKeys.add(this.mediaKey(media));
      this.suppressNextMediaClick = true;
    }, 480);
  }

  cancelMediaLongPress() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = undefined;
    }
  }

  onMediaCardClick(media: MediaItemView) {
    if (this.suppressNextMediaClick) {
      this.suppressNextMediaClick = false;
      return;
    }
    if (this.selectionMode) {
      const key = this.mediaKey(media);
      this.selectedMediaKeys.has(key) ? this.selectedMediaKeys.delete(key) : this.selectedMediaKeys.add(key);
      if (this.selectedMediaKeys.size === 0) this.selectionMode = false;
      return;
    }
    void this.openMediaViewer(media);
  }

  onMediaContextMenu(event: MouseEvent, media: MediaItemView) {
    event.preventDefault();
    this.selectionMode = true;
    this.selectedMediaKeys.add(this.mediaKey(media));
  }

  cancelSelection() {
    this.cancelMediaLongPress();
    this.selectionMode = false;
    this.selectedMediaKeys.clear();
  }

  async deleteSelectedMedia() {
    const selected = this.mediaItems.filter(item => this.selectedMediaKeys.has(this.mediaKey(item)));
    if (selected.length === 0) return;

    try {
      const deleted = await this.mediaService.deleteMedia(selected);
      if (deleted) {
        this.cancelSelection();
        await this.refreshMedia();
      }
    } catch (error) {
      console.error('Unable to delete selected media:', error);
      const alert = await this.alertController.create({
        header: 'Could not delete media',
        message: 'Android could not delete the selected item(s). Try again or check the app’s media access.',
        buttons: ['OK']
      });
      await alert.present();
    }
  }

  async addPhotoToGallery() {
    const actionSheet = await this.actionSheetController.create({
      header: 'Add Photo',
      buttons: [
        {
          text: 'Take Photo',
          icon: 'camera',
          handler: () => {
            this.takePhoto();
          }
        },
        {
          text: 'Refresh media',
          icon: 'refresh',
          handler: async () => {
            await this.scanDeviceMedia();
          }
        },
        {
          text: 'Cancel',
          icon: 'close',
          role: 'cancel'
        }
      ]
    });
    await actionSheet.present();
  }

  async takePhoto() {
    try {
      await this.photoService.addNewPhoto();
      this.loadLegacyPhotos();
    } catch (error) {
      console.error('Error taking photo:', error);
    }
  }

  async showSortOptions() {
    const actionSheet = await this.actionSheetController.create({
      header: 'Filter and sort',
      buttons: [
        {
          text: 'All media',
          icon: this.currentFilter === MediaFilterType.ALL ? 'checkmark' : 'albums-outline',
          handler: () => { void this.selectFilter(MediaFilterType.ALL); }
        },
        {
          text: 'Photos',
          icon: this.currentFilter === MediaFilterType.IMAGES ? 'checkmark' : 'image-outline',
          handler: () => { void this.selectFilter(MediaFilterType.IMAGES); }
        },
        {
          text: 'Videos',
          icon: this.currentFilter === MediaFilterType.VIDEOS ? 'checkmark' : 'videocam-outline',
          handler: () => { void this.selectFilter(MediaFilterType.VIDEOS); }
        },
        {
          text: 'Date (Newest First)',
          icon: this.currentSort === MediaSortType.DATE_DESC ? 'checkmark' : 'calendar',
          handler: () => {
            this.currentSort = MediaSortType.DATE_DESC;
            this.refreshMedia();
          }
        },
        {
          text: 'Date (Oldest First)',
          icon: this.currentSort === MediaSortType.DATE_ASC ? 'checkmark' : 'calendar-outline',
          handler: () => {
            this.currentSort = MediaSortType.DATE_ASC;
            this.refreshMedia();
          }
        },
        {
          text: 'Name (A-Z)',
          icon: this.currentSort === MediaSortType.NAME_ASC ? 'checkmark' : 'text',
          handler: () => {
            this.currentSort = MediaSortType.NAME_ASC;
            this.refreshMedia();
          }
        },
        {
          text: 'Size (Largest)',
          icon: this.currentSort === MediaSortType.SIZE_DESC ? 'checkmark' : 'expand',
          handler: () => {
            this.currentSort = MediaSortType.SIZE_DESC;
            this.refreshMedia();
          }
        },
        {
          text: 'Cancel',
          icon: 'close',
          role: 'cancel'
        }
      ]
    });
    await actionSheet.present();
  }

  async refreshMedia() {
    this.displayedMedia = [];
    this.currentBatch = 0;
    this.thumbnailQueue = [];
    const query = this.router.routerState.snapshot.root.queryParams;
    await this.loadMediaFromStore(query['album'], query['albumId']);
  }

  async selectFilter(filter: MediaFilterType) {
    if (this.currentFilter === filter) return;
    this.currentFilter = filter;
    await this.refreshMedia();
  }

  get totalMediaCount(): number {
    return this.activeAlbumId || this.activeAlbumName
      ? this.mediaItems.length
      : this.hasPermission ? this.mediaService.getTotalCount() : this.photos.length;
  }

  get isAlbumView(): boolean {
    return Boolean(this.activeAlbumId || this.activeAlbumName);
  }

  get imageCount(): number {
    return this.activeAlbumId || this.activeAlbumName
      ? this.mediaItems.filter(item => item.type === 'image').length
      : this.hasPermission ? this.mediaService.getImageCount() : this.photos.length;
  }

  get videoCount(): number {
    return this.activeAlbumId || this.activeAlbumName
      ? this.mediaItems.filter(item => item.type === 'video').length
      : this.hasPermission ? this.mediaService.getVideoCount() : 0;
  }

  trackByMediaId(index: number, media: MediaItemView): string {
    return media.id;
  }
}
