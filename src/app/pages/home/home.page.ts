import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActionSheetController, AlertController, LoadingController } from '@ionic/angular';
import { Router } from '@angular/router';
import { PhotoService } from '../../services/photo.service';
import { MediaService, MediaSortType, MediaFilter } from '../../services/media.service';
import { Photo, SortType, MediaItemView, MediaFilterType } from '../../models/gallery.model';
import { MediaItem } from '../../plugins/media-store.plugin';
import { SystemBarsService } from '../../services/system-bars.service';

interface MediaDateGroup {
  key: string;
  date: Date;
  items: MediaItemView[];
  label: string;
  dateLabel: string;
  selectionState: 'none' | 'partial' | 'all';
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false
})
export class HomePage implements OnInit, OnDestroy {
  private unsubscribeMediaUpdates?: () => void;
  private skipNextViewEntry = true;
  // Legacy photos from PhotoService
  photos: Photo[] = [];
  
  // New media from MediaService
  mediaItems: MediaItemView[] = [];
  displayedMedia: MediaItemView[] = [];
  dateGroups: MediaDateGroup[] = [];
  thumbnails = new Map<string, string>();
  private mediaByDate = new Map<string, MediaItemView[]>();
  private mediaByKey = new Map<string, MediaItemView>();
  private selectedCountsByDate = new Map<string, number>();
  
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
  private suppressMediaClickKey?: string;
  private suppressMediaClickTimer?: ReturnType<typeof setTimeout>;
  selectionMode = false;
  selectedMediaKeys = new Set<string>();
  isDeleting = false;

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
    this.cancelMediaLongPress();
    if (this.suppressMediaClickTimer) clearTimeout(this.suppressMediaClickTimer);
  }

  async ionViewWillEnter() {
    await this.systemBars.setHidden(false);
    await this.photoService.whenReady();

    // ngOnInit owns the first load. Avoid starting a second scan while that
    // first cached/index load is still running.
    if (this.skipNextViewEntry) {
      this.skipNextViewEntry = false;
      return;
    }

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

    const albumFilter = this.router.routerState.snapshot.root.queryParams['album'];
    if (albumFilter) {
      this.activeAlbumName = albumFilter;
      this.activeAlbumId = this.router.routerState.snapshot.root.queryParams['albumId'] || '';
      this.currentFilter = MediaFilterType.ALL;
    }

    if (this.hasPermission && hasScanned) {
      const cached = await this.mediaService.loadCachedMediaIndex();
      const hasLocalPhotos = this.photos.length > 0;
      if (cached.length > 0 || hasLocalPhotos) {
        await this.loadMediaFromStore(albumFilter, this.activeAlbumId || undefined);
      } else {
        // Keep the empty-state card hidden until the silent index check finishes.
        this.isLoading = true;
      }
      await this.refreshMediaIndexInBackground(albumFilter, this.activeAlbumId || undefined);
      return;
    }

    if (!this.hasPermission) {
      console.log('🟡 HomePage: No permission, calling scanDeviceMedia with showMessage=false, forceRefresh=false');
      this.isLoading = true;
      await this.scanDeviceMedia(false, false);
      if (!this.hasPermission) await this.loadMediaFromStore();
      return;
    }

    console.log('🟢 HomePage: Has permission, calling scanDeviceMedia with showMessage=false, forceRefresh=' + !hasScanned);
    this.isLoading = true;
    await this.scanDeviceMedia(false, !hasScanned);
  }

  private async refreshMediaIndexInBackground(albumName?: string, albumId?: string) {
    const previousKeys = new Set(this.mediaService.getMedia().map(item => `${item.type}:${item.id}`));
    const waitingForFirstIndex = this.isLoading;
    try {
      await this.mediaService.scanAllMedia();
      await this.mediaService.refreshRecentMedia(false);
      const refreshed = this.mediaService.getMedia();
      const hasNewMedia = refreshed.some(item => !previousKeys.has(`${item.type}:${item.id}`));
      if (hasNewMedia || waitingForFirstIndex) {
        await this.loadMediaFromStore(albumName, albumId);
      }
    } catch (error) {
      console.warn('Background gallery refresh failed; keeping the cached gallery visible.', error);
      if (waitingForFirstIndex) await this.loadMediaFromStore(albumName, albumId);
    }
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
      this.loadLegacyPhotos();
      await this.loadMediaFromStore();
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
      // A device scan can fail transiently (for example, while Android refreshes
      // MediaStore). Still render the last cached index so the gallery is not blank.
      await this.loadMediaFromStore();
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

      const allMedia = this.hasPermission ? this.mediaService.getMedia(filter, this.currentSort) : [];
      
      // Convert to view models
      this.mediaItems = allMedia.map(item => this.convertToViewModel(item));
      if (!albumName && !albumId && this.currentFilter !== MediaFilterType.VIDEOS) {
        this.mediaItems.push(...this.photos.map(photo => this.convertLocalPhoto(photo)));
      }
      this.mediaItems.sort((a, b) => b.dateTaken.getTime() - a.dateTaken.getTime());
      this.mediaByKey.clear();
      this.mediaItems.forEach(item => this.mediaByKey.set(this.mediaKey(item), item));
      this.buildMediaByDate();
      if (this.selectionMode) {
        const availableKeys = new Set(this.mediaItems.map(item => this.mediaKey(item)));
        this.selectedMediaKeys.forEach(key => {
          if (!availableKeys.has(key)) this.selectedMediaKeys.delete(key);
        });
        this.rebuildSelectionCounts();
        if (this.selectedMediaKeys.size === 0) this.selectionMode = false;
      }
      
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
      duration: item.duration,
      source: 'device'
    };
  }

  private convertLocalPhoto(photo: Photo): MediaItemView {
    return {
      id: photo.id,
      name: photo.name,
      dateTaken: new Date(photo.dateTaken),
      size: photo.size || 0,
      thumbnailUrl: photo.webviewPath,
      uri: photo.filepath,
      type: 'image',
      bucket: '',
      width: 0,
      height: 0,
      source: 'local',
      localPhoto: photo
    };
  }

  private dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private buildMediaByDate() {
    this.mediaByDate.clear();
    for (const item of this.mediaItems) {
      const key = this.dateKey(item.dateTaken);
      const dayItems = this.mediaByDate.get(key);
      if (dayItems) dayItems.push(item);
      else this.mediaByDate.set(key, [item]);
    }
    this.rebuildVisibleDateGroups();
  }

  private rebuildVisibleDateGroups() {
    const groups = new Map<string, MediaDateGroup>();
    const todayKey = this.dateKey(new Date());
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayKey = this.dateKey(yesterdayDate);

    for (const item of this.displayedMedia) {
      const key = this.dateKey(item.dateTaken);
      let group = groups.get(key);
      if (!group) {
        const date = new Date(item.dateTaken.getFullYear(), item.dateTaken.getMonth(), item.dateTaken.getDate());
        const label = key === todayKey ? 'Today' : key === yesterdayKey
          ? 'Yesterday'
          : date.toLocaleDateString(undefined, { weekday: 'long' });
        group = {
          key,
          date,
          items: [],
          label,
          dateLabel: date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
          selectionState: this.groupSelectionState(key)
        };
        groups.set(key, group);
      }
      group.items.push(item);
    }
    this.dateGroups = Array.from(groups.values());
  }

  loadNextBatch() {
    const start = this.currentBatch * this.batchSize;
    const end = start + this.batchSize;
    const newItems = this.mediaItems.slice(start, end);
    
    if (newItems.length > 0) {
      this.displayedMedia = [...this.displayedMedia, ...newItems];
      this.rebuildVisibleDateGroups();
      this.currentBatch++;
      
      // Queue thumbnails for loading
      newItems.forEach(item => {
        if (item.source === 'local') return;
        const cachedThumbnail = this.thumbnails.get(this.mediaKey(item));
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
          const cacheKey = this.mediaKey(media);
          if (!this.thumbnails.has(cacheKey)) {
            try {
              const thumbnail = await this.mediaService.getThumbnail(mediaId, media.type);
              this.thumbnails.set(cacheKey, thumbnail);
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

  formatDuration(duration?: number): string {
    const totalSeconds = Math.max(0, Math.floor((duration || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
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

  mediaKey(media: MediaItemView): string {
    return media.source === 'local' ? `local:${media.id}` : `${media.type}:${media.id}`;
  }

  isMediaSelected(media: MediaItemView): boolean {
    return media.selected === true;
  }

  groupSelectionState(groupKey: string): 'none' | 'partial' | 'all' {
    const total = this.mediaByDate.get(groupKey)?.length || 0;
    const selected = this.selectedCountsByDate.get(groupKey) || 0;
    if (selected === 0 || total === 0) return 'none';
    return selected === total ? 'all' : 'partial';
  }

  toggleDateSelection(groupKey: string) {
    const items = this.mediaByDate.get(groupKey) || [];
    if (!items.length) return;
    const selecting = this.groupSelectionState(groupKey) !== 'all';
    for (const item of items) {
      this.setItemSelected(item, selecting);
    }
    this.updateDateGroupState(groupKey);
  }

  private setItemSelected(item: MediaItemView, selected: boolean) {
    const key = this.mediaKey(item);
    if (item.selected === selected) return;
    item.selected = selected;
    if (selected) this.selectedMediaKeys.add(key);
    else this.selectedMediaKeys.delete(key);
    const dateKey = this.dateKey(item.dateTaken);
    const count = (this.selectedCountsByDate.get(dateKey) || 0) + (selected ? 1 : -1);
    if (count > 0) this.selectedCountsByDate.set(dateKey, count);
    else this.selectedCountsByDate.delete(dateKey);
  }

  private updateDateGroupState(groupKey: string) {
    const state = this.groupSelectionState(groupKey);
    const visibleGroup = this.dateGroups.find(group => group.key === groupKey);
    if (visibleGroup) visibleGroup.selectionState = state;
  }

  private suppressClickFor(media: MediaItemView) {
    this.suppressMediaClickKey = this.mediaKey(media);
    if (this.suppressMediaClickTimer) clearTimeout(this.suppressMediaClickTimer);
    // Android normally dispatches the click immediately after pointerup. Keep
    // suppression short and scoped to that same thumbnail so the next tap on
    // another item is never swallowed.
    this.suppressMediaClickTimer = setTimeout(() => {
      this.suppressMediaClickKey = undefined;
      this.suppressMediaClickTimer = undefined;
    }, 250);
  }

  private rebuildSelectionCounts() {
    this.selectedCountsByDate.clear();
    for (const item of this.mediaItems) {
      item.selected = this.selectedMediaKeys.has(this.mediaKey(item));
      if (!item.selected) continue;
      const key = this.dateKey(item.dateTaken);
      this.selectedCountsByDate.set(key, (this.selectedCountsByDate.get(key) || 0) + 1);
    }
    this.dateGroups.forEach(group => group.selectionState = this.groupSelectionState(group.key));
  }

  toggleSelectAll() {
    if (this.selectedMediaKeys.size === this.mediaItems.length) {
      this.selectedMediaKeys.clear();
      this.mediaItems.forEach(item => item.selected = false);
      this.selectedCountsByDate.clear();
      this.dateGroups.forEach(group => group.selectionState = 'none');
    } else {
      this.selectedMediaKeys = new Set(this.mediaItems.map(item => this.mediaKey(item)));
      this.rebuildSelectionCounts();
    }
    this.selectionMode = true;
  }

  get isEverythingSelected(): boolean {
    return this.mediaItems.length > 0 && this.selectedMediaKeys.size === this.mediaItems.length;
  }

  startMediaLongPress(media: MediaItemView) {
    this.cancelMediaLongPress();
    this.longPressTimer = setTimeout(() => {
      this.selectionMode = true;
      const key = this.mediaKey(media);
      if (!this.selectedMediaKeys.has(key)) {
        this.setItemSelected(media, true);
        this.updateDateGroupState(this.dateKey(media.dateTaken));
      }
      this.suppressClickFor(media);
    }, 360);
  }

  cancelMediaLongPress() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = undefined;
    }
  }

  onMediaCardClick(media: MediaItemView) {
    const mediaKey = this.mediaKey(media);
    if (this.suppressMediaClickKey === mediaKey) {
      this.suppressMediaClickKey = undefined;
      if (this.suppressMediaClickTimer) clearTimeout(this.suppressMediaClickTimer);
      this.suppressMediaClickTimer = undefined;
      return;
    }
    if (this.selectionMode) {
      this.setItemSelected(media, !media.selected);
      this.updateDateGroupState(this.dateKey(media.dateTaken));
      if (this.selectedMediaKeys.size === 0) this.selectionMode = false;
      return;
    }
    if (media.source === 'local' && media.localPhoto) void this.openPhotoViewer(media.localPhoto);
    else void this.openMediaViewer(media);
  }

  onMediaContextMenu(event: MouseEvent, media: MediaItemView) {
    event.preventDefault();
    this.cancelMediaLongPress();
    this.selectionMode = true;
    this.suppressClickFor(media);
    const key = this.mediaKey(media);
    if (!this.selectedMediaKeys.has(key)) {
      this.setItemSelected(media, true);
      this.updateDateGroupState(this.dateKey(media.dateTaken));
    }
  }

  cancelSelection() {
    this.cancelMediaLongPress();
    this.selectionMode = false;
    this.mediaByKey.forEach(item => item.selected = false);
    this.selectedMediaKeys.clear();
    this.selectedCountsByDate.clear();
    this.dateGroups.forEach(group => group.selectionState = 'none');
  }

  async deleteSelectedMedia() {
    const selected = this.mediaItems.filter(item => this.selectedMediaKeys.has(this.mediaKey(item)));
    if (selected.length === 0) return;

    const count = selected.length;
    const alert = await this.alertController.create({
      header: `Delete ${count} selected ${count === 1 ? 'item' : 'items'}?`,
      message: 'This action will delete the selected photos and videos.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive' }
      ]
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return;

    let dismissDeletingLoading: (() => Promise<void>) | undefined;
    const dismissProgress = async () => {
      if (!dismissDeletingLoading) return;
      const dismiss = dismissDeletingLoading;
      dismissDeletingLoading = undefined;
      try { await dismiss(); } catch { /* Loading overlay may already be gone. */ }
    };

    try {
      this.isDeleting = true;
      const deletingLoading = await this.loadingController.create({
        message: 'Deleting selected files…',
        spinner: 'crescent',
        backdropDismiss: false
      });
      dismissDeletingLoading = async () => { await deletingLoading.dismiss(); };
      await deletingLoading.present();
      const deviceItems = selected.filter(item => item.source !== 'local');
      const localItems = selected.filter(item => item.source === 'local' && item.localPhoto);
      const deviceResult = deviceItems.length
        ? await this.mediaService.deleteMediaDetailed(deviceItems)
        : { deleted: true, deletedCount: 0 };
      if (deviceItems.length > 0 && deviceResult.deletedCount === 0 && !deviceResult.deleted) {
        // Android's system deletion consent was declined; keep selection intact.
        return;
      }
      if (deviceResult.deleted || deviceResult.deletedCount > 0 || localItems.length > 0) {
        const failedLocal: MediaItemView[] = [];
        let deletedLocalCount = 0;
        for (const item of localItems) {
          try {
            await this.photoService.deletePhoto(item.localPhoto!);
            deletedLocalCount++;
          } catch (error) {
            console.error('Unable to delete saved photo:', item.id, error);
            failedLocal.push(item);
          }
        }
        this.loadLegacyPhotos();
        this.cancelSelection();
        await this.refreshMedia();
        await dismissProgress();
        const failedCount = failedLocal.length + (deviceItems.length - deviceResult.deletedCount);
        if (failedCount > 0) {
          const partialAlert = await this.alertController.create({
            header: 'Some items could not be deleted',
            message: `${failedCount} of ${count} selected items could not be deleted. ${deviceResult.deletedCount + deletedLocalCount} item(s) were removed. The gallery has been refreshed.`,
            buttons: ['OK']
          });
          await partialAlert.present();
        }
      }
    } catch (error) {
      console.error('Unable to delete selected media:', error);
      try {
        await this.mediaService.scanAllMedia({ forceRefresh: true });
        this.loadLegacyPhotos();
        await this.refreshMedia();
      } catch (refreshError) {
        console.error('Unable to refresh after a partial deletion:', refreshError);
      }
      await dismissProgress();
      this.cancelSelection();
      const alert = await this.alertController.create({
        header: 'Could not delete media',
        message: 'Some items may have been deleted before Android reported a failure. The gallery was refreshed; review it before trying again.',
        buttons: ['OK']
      });
      await alert.present();
    } finally {
      await dismissProgress();
      this.isDeleting = false;
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
    this.cancelSelection();
    this.currentFilter = filter;
    await this.refreshMedia();
  }

  get totalMediaCount(): number {
    return this.mediaItems.length;
  }

  get isAlbumView(): boolean {
    return Boolean(this.activeAlbumId || this.activeAlbumName);
  }

  get imageCount(): number {
    return this.mediaItems.filter(item => item.type === 'image').length;
  }

  get videoCount(): number {
    return this.mediaItems.filter(item => item.type === 'video').length;
  }

  trackByMediaId(index: number, media: MediaItemView): string {
    // Angular may invoke trackBy callbacks without the component as `this`.
    // Build the stable key directly so change detection cannot crash the page.
    return media.source === 'local' ? `local:${media.id}` : `${media.type}:${media.id}`;
  }

  trackByDateGroup(index: number, group: MediaDateGroup): string {
    return group.key;
  }
}
