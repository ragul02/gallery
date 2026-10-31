import { Component, OnInit, ViewChild } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ActionSheetController, AlertController } from '@ionic/angular';
import { MediaService, MediaSortType } from '../../services/media.service';
import { PhotoService } from '../../services/photo.service';
import { MediaItem } from '../../plugins/media-store.plugin';
import { Photo } from '../../models/gallery.model';
import { SystemBarsService } from '../../services/system-bars.service';
import { ImageCropperComponent, LoadedImage } from 'ngx-image-cropper';

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
  isEditing = false;
  isSavingEdit = false;
  activeFilter = 'original';
  activeCrop = 'original';
  editorImageWidth = 0;
  editorImageHeight = 0;
  @ViewChild(ImageCropperComponent) imageCropper?: ImageCropperComponent;
  readonly filters = [
    { id: 'original', label: 'Original', css: 'none' },
    { id: 'mono', label: 'Mono', css: 'grayscale(1)' },
    { id: 'warm', label: 'Warm', css: 'sepia(.28) saturate(1.18)' },
    { id: 'cool', label: 'Cool', css: 'saturate(.88) hue-rotate(12deg)' },
    { id: 'vivid', label: 'Vivid', css: 'saturate(1.35) contrast(1.05)' }
  ];
  readonly crops = [
    { id: 'original', label: 'Original' },
    { id: 'square', label: '1:1' },
    { id: '4:3', label: '4:3' },
    { id: '16:9', label: '16:9' },
    { id: 'free', label: 'Free crop' }
  ];
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

  get isImageMedia(): boolean {
    return !!this.currentPhoto || this.currentMedia?.type === 'image';
  }

  get currentImageSource(): string {
    return this.currentPhoto?.webviewPath || this.mediaSourceUrl || '';
  }

  get activeFilterCss(): string {
    return this.filters.find(filter => filter.id === this.activeFilter)?.css || 'none';
  }

  setActiveFilter(filterId: string, event?: Event) {
    event?.stopPropagation();
    this.activeFilter = filterId;
  }

  setActiveCrop(cropId: string, event?: Event) {
    event?.stopPropagation();
    this.activeCrop = cropId;
  }

  onEditorImageLoad(image: LoadedImage) {
    this.editorImageWidth = image.original.size.width;
    this.editorImageHeight = image.original.size.height;
  }

  get maintainCropAspectRatio(): boolean {
    return this.activeCrop !== 'free';
  }

  get cropAspectRatio(): number {
    if (this.activeCrop === 'square') return 1;
    if (this.activeCrop === '4:3') return this.getImageAspectRatio() >= 1 ? 4 / 3 : 3 / 4;
    if (this.activeCrop === '16:9') return this.getImageAspectRatio() >= 1 ? 16 / 9 : 9 / 16;
    if (this.activeCrop === 'free') return 1;
    return this.getImageAspectRatio();
  }

  private getImageAspectRatio(): number {
    const width = this.editorImageWidth || this.currentMedia?.width;
    const height = this.editorImageHeight || this.currentMedia?.height;
    return width && height ? width / height : 4 / 3;
  }

  startEditing() {
    if (!this.isImageMedia) return;
    this.activeFilter = 'original';
    this.activeCrop = 'original';
    this.editorImageWidth = 0;
    this.editorImageHeight = 0;
    this.isEditing = true;
  }

  cancelEditing() {
    if (!this.isSavingEdit) this.isEditing = false;
  }

  async saveEditedCopy() {
    const source = this.currentImageSource;
    if (!source || !this.imageCropper || this.isSavingEdit) return;
    this.isSavingEdit = true;
    try {
      const cropResult = await this.imageCropper.crop('blob');
      if (!cropResult?.blob) throw new Error('The crop area is not ready. Please adjust it and try again.');
      const blob = this.activeFilter === 'original'
        ? cropResult.blob
        : await this.applyFilterToBlob(cropResult.blob, this.activeFilterCss);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read edited image.'));
        reader.onerror = () => reject(new Error('Could not read edited image.'));
        reader.readAsDataURL(blob);
      });
      const originalName = this.currentPhoto?.name || this.currentMedia?.name || 'photo';
      await this.photoService.saveEditedCopy(dataUrl, originalName);
      this.isEditing = false;
      const alert = await this.alertController.create({ header: 'Edited copy saved', message: 'The original is unchanged. Find the edited copy in the app gallery.', buttons: ['OK'] });
      await alert.present();
    } catch (error) {
      console.error('Could not save edited image:', error);
      const alert = await this.alertController.create({ header: 'Could not save image', message: 'Please try again. The original photo has not been changed.', buttons: ['OK'] });
      await alert.present();
    } finally {
      this.isSavingEdit = false;
    }
  }

  private async applyFilterToBlob(blob: Blob, filter: string): Promise<Blob> {
    const image = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image filter is unavailable.');
    context.filter = filter;
    context.drawImage(image, 0, 0);
    image.close();
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not apply the selected filter.')), 'image/jpeg', 0.92);
    });
  }

  async shareCurrentMedia() {
    const item = this.currentMedia;
    const photo = this.currentPhoto;
    if (!item && !photo) return;
    try {
      if (Capacitor.getPlatform() === 'android') {
        await this.mediaService.shareMedia({
          id: item?.id || photo!.id,
          type: item?.type || 'image',
          localPath: photo?.filepath
        });
        return;
      }
      const source = this.currentImageSource;
      if (navigator.share) {
        const title = item?.name || photo?.name || 'Media';
        const mediaUrl = photo ? source : this.mediaSourceUrl;
        try {
          const response = await fetch(mediaUrl);
          const file = new File([await response.blob()], title, { type: item?.type === 'video' ? 'video/mp4' : 'image/jpeg' });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ title, files: [file] });
            return;
          }
        } catch (error) {
          console.warn('Could not prepare a shareable media file:', error);
        }
        await navigator.share({ title, url: mediaUrl });
      } else {
        const alert = await this.alertController.create({ header: 'Sharing unavailable', message: 'Use the Android app to share this media.', buttons: ['OK'] });
        await alert.present();
      }
    } catch (error) {
      console.error('Could not share media:', error);
      const alert = await this.alertController.create({ header: 'Could not share media', message: 'Please try again.', buttons: ['OK'] });
      await alert.present();
    }
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
