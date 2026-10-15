import { Component, OnInit } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ActionSheetController, AlertController } from '@ionic/angular';
import { MediaService, MediaSortType } from '../../services/media.service';
import { PhotoService } from '../../services/photo.service';
import { MediaItem } from '../../plugins/media-store.plugin';
import { Photo } from '../../models/gallery.model';
import { SystemBarsService } from '../../services/system-bars.service';

@Component({
  selector: 'app-viewer',
  templateUrl: './viewer.page.html',
  styleUrls: ['./viewer.page.scss'],
  standalone: false
})
export class ViewerPage implements OnInit {
  currentMedia: MediaItem | null = null;
  currentPhoto: Photo | null = null;
  allMedia: MediaItem[] = [];
  localPhotos: Photo[] = [];
  currentIndex = 0;
  thumbnailUrl = '';
  mediaSourceUrl = '';
  imageLoadFailed = false;
  playbackError = false;
  private touchStartX = 0;
  private touchStartY = 0;
  private suppressClickAfterSwipe = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mediaService: MediaService,
    private photoService: PhotoService,
    private actionSheetController: ActionSheetController,
    private alertController: AlertController,
    private systemBars: SystemBarsService
  ) {}

  ionViewWillEnter() {
    void this.systemBars.setHidden(true);
  }

  async ngOnInit() {
    const mediaId = this.route.snapshot.paramMap.get('id');
    const filter = this.route.snapshot.queryParamMap.get('filter');
    const album = this.route.snapshot.queryParamMap.get('album');

    if (!mediaId) {
      this.router.navigate(['/home']);
      return;
    }

    if (this.route.snapshot.queryParamMap.get('source') === 'local') {
      await this.photoService.whenReady();
      this.localPhotos = this.photoService.getPhotos();
      const photoIndex = this.localPhotos.findIndex(photo => photo.id === mediaId);
      if (photoIndex < 0) {
        await this.router.navigate(['/home']);
        return;
      }

      this.loadLocalPhoto(photoIndex);
      return;
    }

    // Get all media with filters
    const mediaFilter = album ? { album } : (filter ? { type: filter as any } : undefined);
    this.allMedia = this.mediaService.getMedia(mediaFilter, MediaSortType.DATE_DESC);
    
    // Find current media
    this.currentIndex = this.allMedia.findIndex(m => m.id === mediaId);
    if (this.currentIndex === -1) {
      this.currentIndex = 0;
    }

    if (this.allMedia.length > 0) {
      await this.loadMedia(this.currentIndex);
    }
  }

  async loadMedia(index: number) {
    if (index < 0 || index >= this.allMedia.length) {
      return;
    }

    this.currentIndex = index;
    this.currentPhoto = null;
    this.currentMedia = this.allMedia[index];
    this.playbackError = false;
    this.imageLoadFailed = false;
    this.thumbnailUrl = '';
    this.mediaSourceUrl = Capacitor.convertFileSrc(this.currentMedia.uri);

    try {
      const thumbnail = await this.mediaService.getThumbnail(
        this.currentMedia.id,
        this.currentMedia.type
      );
      if (this.currentMedia?.id === this.allMedia[index].id) {
        this.thumbnailUrl = thumbnail;
        if (this.imageLoadFailed && this.currentMedia.type === 'image') {
          this.mediaSourceUrl = thumbnail;
        }
      }
    } catch (error) {
      console.error('Error loading thumbnail:', error);
    }
  }

  loadLocalPhoto(index: number) {
    if (index < 0 || index >= this.localPhotos.length) {
      return;
    }

    this.currentIndex = index;
    this.currentPhoto = this.localPhotos[index];
    this.currentMedia = null;
    this.thumbnailUrl = this.currentPhoto.webviewPath || '';
  }

  onTouchStart(event: TouchEvent) {
    if (event.touches.length !== 1) return;
    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
  }

  onTouchEnd(event: TouchEvent) {
    if (event.changedTouches.length !== 1) return;
    const deltaX = event.changedTouches[0].clientX - this.touchStartX;
    const deltaY = event.changedTouches[0].clientY - this.touchStartY;
    if (Math.abs(deltaX) < 65 || Math.abs(deltaY) > 85) return;

    this.suppressClickAfterSwipe = true;
    if (deltaX < 0) void this.nextMedia();
    else void this.previousMedia();
    setTimeout(() => this.suppressClickAfterSwipe = false, 350);
  }

  onVideoError() {
    this.playbackError = true;
  }

  onFullImageError() {
    this.imageLoadFailed = true;
    if (this.thumbnailUrl) this.mediaSourceUrl = this.thumbnailUrl;
  }

  async nextMedia() {
    if (this.currentPhoto && this.currentIndex < this.localPhotos.length - 1) {
      this.loadLocalPhoto(this.currentIndex + 1);
    } else if (!this.currentPhoto && this.currentIndex < this.allMedia.length - 1) {
      await this.loadMedia(this.currentIndex + 1);
    }
  }

  async previousMedia() {
    if (this.currentPhoto && this.currentIndex > 0) {
      this.loadLocalPhoto(this.currentIndex - 1);
    } else if (!this.currentPhoto && this.currentIndex > 0) {
      await this.loadMedia(this.currentIndex - 1);
    }
  }

  close() {
    this.router.navigate(['/home']);
  }

  async showMediaMenu() {
    const actionSheet = await this.actionSheetController.create({
      header: 'Media options',
      buttons: [
        { text: 'Details', icon: 'information-circle-outline', handler: () => { void this.showMediaDetails(); } },
        { text: 'Delete', icon: 'trash-outline', role: 'destructive', handler: () => { void this.deleteCurrentMedia(); } },
        { text: 'Cancel', icon: 'close-outline', role: 'cancel' }
      ]
    });
    await actionSheet.present();
  }

  async showMediaDetails() {
    const item = this.currentMedia;
    const photo = this.currentPhoto;
    if (!item && !photo) return;

    const date = item?.dateTaken || photo?.dateTaken;
    const size = item?.size || photo?.size || 0;
    const dimensions = item?.width && item?.height ? `${item.width} × ${item.height}` : '';
    const details = [
      `Type: ${item?.type === 'video' ? 'Video' : 'Photo'}`,
      date ? `Date: ${(date instanceof Date ? date : new Date(date)).toLocaleString()}` : '',
      dimensions ? `Dimensions: ${dimensions}` : '',
      size ? `Size: ${(size / 1024 / 1024).toFixed(1)} MB` : '',
      item?.type === 'video' && item.duration ? `Duration: ${(item.duration / 1000).toFixed(0)} sec` : ''
    ].filter(Boolean).join('<br>');
    const alert = await this.alertController.create({ header: item?.name || photo?.name || 'Media details', message: details, buttons: ['Done'] });
    await alert.present();
  }

  async deleteCurrentMedia() {
    if (this.currentMedia) {
      try {
        const deleted = await this.mediaService.deleteMedia([this.currentMedia]);
        if (deleted) await this.close();
      } catch (error) {
        console.error('Error deleting media:', error);
        const alert = await this.alertController.create({ header: 'Could not delete media', message: 'The device did not allow this item to be deleted.', buttons: ['OK'] });
        await alert.present();
      }
      return;
    }

    if (this.currentPhoto) {
      const photo = this.currentPhoto;
      const confirm = await this.alertController.create({
        header: 'Delete photo?',
        message: 'This will permanently remove this photo from the app.',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          { text: 'Delete', role: 'destructive', handler: () => { void this.photoService.deletePhoto(photo).then(() => this.close()); } }
        ]
      });
      await confirm.present();
    }
  }

  get canGoNext(): boolean {
    return this.currentIndex < (this.currentPhoto ? this.localPhotos.length : this.allMedia.length) - 1;
  }

  get canGoPrevious(): boolean {
    return this.currentIndex > 0;
  }

  get mediaCounter(): string {
    const count = this.currentPhoto ? this.localPhotos.length : this.allMedia.length;
    return `${this.currentIndex + 1} / ${count}`;
  }
}
