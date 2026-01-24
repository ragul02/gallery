import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActionSheetController, AlertController, LoadingController } from '@ionic/angular';
import { Router } from '@angular/router';
import { PhotoService } from '../../services/photo.service';
import { MediaService, MediaSortType, MediaFilter } from '../../services/media.service';
import { Photo, SortType, MediaItemView, MediaFilterType } from '../../models/gallery.model';
import { MediaItem } from '../../plugins/media-store.plugin';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false
})
export class HomePage implements OnInit, OnDestroy {
  // Legacy photos from PhotoService
  photos: Photo[] = [];
  
  // New media from MediaService
  mediaItems: MediaItemView[] = [];
  displayedMedia: MediaItemView[] = [];
  thumbnails = new Map<string, string>();
  
  currentSort: MediaSortType = MediaSortType.DATE_DESC;
  currentFilter: MediaFilterType = MediaFilterType.ALL;
  sortTypes = SortType;
  
  isLoading = false;
  hasPermission = false;
  batchSize = 50;
  currentBatch = 0;
  
  // Thumbnail loading queue
  private thumbnailQueue: string[] = [];
  private loadingThumbnails = false;

  constructor(
    public photoService: PhotoService,
    private mediaService: MediaService,
    public actionSheetController: ActionSheetController,
    private alertController: AlertController,
    private loadingController: LoadingController,
    private router: Router
  ) {}

  async ngOnInit() {
    await this.initializeGallery();
  }

  ngOnDestroy() {
    // Cleanup if needed
  }

  async ionViewWillEnter() {
    // Check for album filter from query params
    const albumFilter = this.router.routerState.snapshot.root.queryParams['album'];
    if (albumFilter) {
      this.currentFilter = MediaFilterType.ALL;
      await this.loadMediaFromStore(albumFilter);
    } else {
      this.loadLegacyPhotos();
      if (this.hasPermission && this.mediaItems.length > 0) {
        this.loadNextBatch();
      }
    }
  }

  async initializeGallery() {
    // Check if initial scan has been done
    const hasScanned = await this.mediaService.hasCompletedInitialScan();
    
    if (!hasScanned) {
      await this.promptInitialScan();
    } else {
      // Check permissions
      this.hasPermission = await this.mediaService.checkPermissions();
      
      if (this.hasPermission) {
        await this.loadMediaFromStore();
      } else {
        // Fall back to legacy photos
        this.loadLegacyPhotos();
      }
    }
  }

  async promptInitialScan() {
    const alert = await this.alertController.create({
      header: 'Welcome to Gallery!',
      message: 'Would you like to scan your device for photos and videos? This app will automatically organize your media into albums.',
      buttons: [
        {
          text: 'Not Now',
          role: 'cancel',
          handler: () => {
            this.loadLegacyPhotos();
          }
        },
        {
          text: 'Scan Device',
          handler: async () => {
            await this.scanDeviceMedia();
          }
        }
      ],
      backdropDismiss: false
    });
    await alert.present();
  }

  async scanDeviceMedia() {
    // Request permissions first
    const granted = await this.mediaService.requestPermissions();
    
    if (!granted) {
      const alert = await this.alertController.create({
        header: 'Permission Required',
        message: 'Please grant storage permission to scan your photos and videos. You can change this in app settings.',
        buttons: [
          {
            text: 'Cancel',
            role: 'cancel',
            handler: () => {
              this.loadLegacyPhotos();
            }
          },
          {
            text: 'Try Again',
            handler: async () => {
              await this.scanDeviceMedia();
            }
          }
        ]
      });
      await alert.present();
      return;
    }

    this.hasPermission = true;

    // Show loading
    const loading = await this.loadingController.create({
      message: 'Scanning device for media...',
      spinner: 'circles'
    });
    await loading.present();

    try {
      let loadedCount = 0;
      await this.mediaService.scanAllMedia({
        forceRefresh: true,
        progressCallback: (loaded, total) => {
          loadedCount = loaded;
          loading.message = `Found ${loaded} media files...`;
        }
      });

      await loading.dismiss();

      // Show success message
      const successAlert = await this.alertController.create({
        header: 'Scan Complete!',
        message: `Found ${loadedCount} photos and videos on your device.`,
        buttons: ['OK']
      });
      await successAlert.present();

      // Load the media
      await this.loadMediaFromStore();
    } catch (error) {
      await loading.dismiss();
      console.error('Error scanning media:', error);
      
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

  async loadMediaFromStore(albumName?: string) {
    this.isLoading = true;

    try {
      const filter: MediaFilter = {
        type: this.currentFilter === MediaFilterType.ALL ? undefined : this.currentFilter,
        album: albumName
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
        if (!this.thumbnails.has(item.id)) {
          this.thumbnailQueue.push(item.id);
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
    const batchSize = 5;
    while (this.thumbnailQueue.length > 0) {
      const batch = this.thumbnailQueue.splice(0, batchSize);
      
      await Promise.all(
        batch.map(async (mediaId) => {
          const media = this.displayedMedia.find(m => m.id === mediaId);
          if (media && !this.thumbnails.has(mediaId)) {
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

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
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

  async openMediaViewer(media: MediaItemView) {
    this.router.navigate(['/viewer', media.id], {
      queryParams: {
        filter: this.currentFilter !== MediaFilterType.ALL ? this.currentFilter : null
      }
    });
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
          text: 'Scan Device Media',
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
      header: 'Sort & Filter',
      buttons: [
        {
          text: 'All Media',
          icon: this.currentFilter === MediaFilterType.ALL ? 'checkmark' : 'image',
          handler: () => {
            this.currentFilter = MediaFilterType.ALL;
            this.refreshMedia();
          }
        },
        {
          text: 'Images Only',
          icon: this.currentFilter === MediaFilterType.IMAGES ? 'checkmark' : 'images',
          handler: () => {
            this.currentFilter = MediaFilterType.IMAGES;
            this.refreshMedia();
          }
        },
        {
          text: 'Videos Only',
          icon: this.currentFilter === MediaFilterType.VIDEOS ? 'checkmark' : 'videocam',
          handler: () => {
            this.currentFilter = MediaFilterType.VIDEOS;
            this.refreshMedia();
          }
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
    await this.loadMediaFromStore();
  }

  get totalMediaCount(): number {
    return this.hasPermission ? this.mediaService.getTotalCount() : this.photos.length;
  }

  get imageCount(): number {
    return this.hasPermission ? this.mediaService.getImageCount() : this.photos.length;
  }

  get videoCount(): number {
    return this.hasPermission ? this.mediaService.getVideoCount() : 0;
  }

  trackByMediaId(index: number, media: MediaItemView): string {
    return media.id;
  }
}

