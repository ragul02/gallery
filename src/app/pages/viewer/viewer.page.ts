import { Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ActionSheetController, AlertController } from '@ionic/angular';
import { MediaService, MediaSortType } from '../../services/media.service';
import { PhotoService } from '../../services/photo.service';
import { MediaItem } from '../../plugins/media-store.plugin';
import { Photo } from '../../models/gallery.model';
import { SystemBarsService } from '../../services/system-bars.service';
import { ImageCropperComponent, LoadedImage } from 'ngx-image-cropper';
import { FavoriteService } from '../../services/favorite.service';

@Component({
  selector: 'app-viewer',
  templateUrl: './viewer.page.html',
  styleUrls: ['./viewer.page.scss'],
  standalone: false
})
export class ViewerPage implements OnInit, OnDestroy {
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
  @ViewChild('viewerStage') set viewerStage(element: ElementRef<HTMLElement> | undefined) {
    this.bindStage(element?.nativeElement);
  }
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
  private boundStage?: HTMLElement;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pointerMode: 'idle' | 'pan' | 'pinch' = 'idle';
  private hadMultiTouch = false;
  private startX = 0;
  private startY = 0;
  private startTx = 0;
  private startTy = 0;
  private startScale = 1;
  private pinchStartDistance = 0;
  private pinchAnchorX = 0;
  private pinchAnchorY = 0;
  private lastTapAt = 0;
  private lastTapX = 0;
  private lastTapY = 0;
  private scale = 1;
  private translateX = 0;
  private translateY = 0;
  private readonly maxZoom = 5;
  private readonly pointerDownListener = (event: PointerEvent) => this.onPointerDown(event);
  private readonly pointerMoveListener = (event: PointerEvent) => this.onPointerMove(event);
  private readonly pointerUpListener = (event: PointerEvent) => this.onPointerUp(event);
  private readonly pointerCancelListener = (event: PointerEvent) => this.onPointerCancel(event);
  private readonly lostPointerCaptureListener = (event: PointerEvent) => this.onPointerCancel(event);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mediaService: MediaService,
    private photoService: PhotoService,
    private actionSheetController: ActionSheetController,
    private alertController: AlertController,
    private systemBars: SystemBarsService,
    public favoriteService: FavoriteService,
    private zone: NgZone
  ) {}

  ngOnDestroy() { this.bindStage(undefined); }

  ionViewWillEnter() {
    void this.systemBars.setHidden(true);
  }

  async ngOnInit() {
    const mediaId = this.route.snapshot.paramMap.get('id');
    const filter = this.route.snapshot.queryParamMap.get('filter');
    const album = this.route.snapshot.queryParamMap.get('album');
    const favoritesOnly = this.route.snapshot.queryParamMap.get('favorites') === 'true';
    await this.favoriteService.whenReady();

    if (!mediaId) {
      this.router.navigate(['/home']);
      return;
    }

    if (this.route.snapshot.queryParamMap.get('source') === 'local') {
      await this.photoService.whenReady();
      this.localPhotos = this.photoService.getPhotos().filter(photo => !favoritesOnly || this.favoriteService.isFavoriteSync(photo.id, 'local'));
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
    if (favoritesOnly) this.allMedia = this.allMedia.filter(item => this.favoriteService.isFavoriteSync(item.id, item.type));
    
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
    this.resetZoom(false);
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
    this.resetZoom(false);
    this.currentPhoto = this.localPhotos[index];
    this.currentMedia = null;
    this.thumbnailUrl = this.currentPhoto.webviewPath || '';
  }

  get currentIsFavorite(): boolean {
    if (this.currentPhoto) return this.favoriteService.isFavoriteSync(this.currentPhoto.id, 'local');
    return !!this.currentMedia && this.favoriteService.isFavoriteSync(this.currentMedia.id, this.currentMedia.type);
  }

  async toggleFavorite(event?: Event) {
    event?.stopPropagation();
    const item = this.currentMedia;
    const photo = this.currentPhoto;
    if (!item && !photo) return;
    await this.favoriteService.toggle(item?.id || photo!.id, item?.type || 'local');
    if (this.route.snapshot.queryParamMap.get('favorites') === 'true' && !this.currentIsFavorite) {
      if (photo) {
        this.localPhotos.splice(this.currentIndex, 1);
        if (this.localPhotos.length) this.loadLocalPhoto(Math.min(this.currentIndex, this.localPhotos.length - 1));
        else await this.close();
      } else if (item) {
        this.allMedia.splice(this.currentIndex, 1);
        if (this.allMedia.length) await this.loadMedia(Math.min(this.currentIndex, this.allMedia.length - 1));
        else await this.close();
      }
    }
  }

  get isZoomed(): boolean { return this.scale > 1.01; }

  resetZoom(animate = true) {
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.applyImageTransform(animate);
  }

  private bindStage(stage?: HTMLElement) {
    if (this.boundStage === stage) return;
    this.unbindStage();
    if (!stage) return;
    this.boundStage = stage;
    this.zone.runOutsideAngular(() => {
      stage.addEventListener('pointerdown', this.pointerDownListener, { passive: false });
      stage.addEventListener('pointermove', this.pointerMoveListener, { passive: false });
      stage.addEventListener('pointerup', this.pointerUpListener, { passive: false });
      stage.addEventListener('pointercancel', this.pointerCancelListener, { passive: false });
      stage.addEventListener('lostpointercapture', this.lostPointerCaptureListener);
    });
  }

  private unbindStage() {
    if (!this.boundStage) return;
    const stage = this.boundStage;
    stage.removeEventListener('pointerdown', this.pointerDownListener);
    stage.removeEventListener('pointermove', this.pointerMoveListener);
    stage.removeEventListener('pointerup', this.pointerUpListener);
    stage.removeEventListener('pointercancel', this.pointerCancelListener);
    stage.removeEventListener('lostpointercapture', this.lostPointerCaptureListener);
    this.pointers.clear();
    this.pointerMode = 'idle';
    this.boundStage = undefined;
  }

  private onPointerDown(event: PointerEvent) {
    if (!this.boundStage || event.button !== 0) return;
    const imageTarget = (event.target as HTMLElement).closest('.zoomable-image');
    const isImage = !!imageTarget && this.isImageMedia;
    // Leave native video controls and playback gestures untouched.
    if (!isImage) return;
    event.preventDefault();
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { this.boundStage.setPointerCapture(event.pointerId); } catch { /* The pointer may already have been released. */ }
    if (this.pointers.size >= 2 && isImage) {
      this.hadMultiTouch = true;
      this.pointerMode = 'pinch';
      this.lastTapAt = 0;
      this.beginPinch();
      return;
    }
    if (this.pointers.size === 1) {
      this.pointerMode = this.scale > 1.01 ? 'pan' : 'idle';
      this.startX = event.clientX;
      this.startY = event.clientY;
      this.startTx = this.translateX;
      this.startTy = this.translateY;
    }
  }

  private onPointerMove(event: PointerEvent) {
    if (!this.pointers.has(event.pointerId) || !this.boundStage) return;
    event.preventDefault();
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointerMode === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = Array.from(this.pointers.values());
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const centerX = (a.x + b.x) / 2 - this.stageCenterX();
      const centerY = (a.y + b.y) / 2 - this.stageCenterY();
      const nextScale = Math.min(this.maxZoom, Math.max(1, this.startScale * distance / Math.max(1, this.pinchStartDistance)));
      this.scale = nextScale;
      this.translateX = centerX - this.pinchAnchorX * nextScale;
      this.translateY = centerY - this.pinchAnchorY * nextScale;
      this.constrainPan();
      this.applyImageTransform(false);
    } else if (this.pointerMode === 'pan' && this.scale > 1.01) {
      this.translateX = this.startTx + event.clientX - this.startX;
      this.translateY = this.startTy + event.clientY - this.startY;
      this.constrainPan();
      this.applyImageTransform(false);
    }
  }

  private onPointerUp(event: PointerEvent) {
    if (!this.pointers.has(event.pointerId)) return;
    const wasPinching = this.pointerMode === 'pinch' || this.hadMultiTouch;
    this.pointers.delete(event.pointerId);
    if (this.pointers.size > 0) {
      if (this.pointers.size === 1 && this.pointerMode === 'pinch') {
        const remaining = Array.from(this.pointers.values())[0];
        this.pointerMode = this.scale > 1.01 ? 'pan' : 'idle';
        this.startX = remaining.x;
        this.startY = remaining.y;
        this.startTx = this.translateX;
        this.startTy = this.translateY;
      }
      return;
    }
    this.pointerMode = 'idle';
    if (wasPinching) {
      this.hadMultiTouch = false;
      this.constrainPan();
      this.applyImageTransform(true);
      return;
    }

    const deltaX = event.clientX - this.startX;
    const deltaY = event.clientY - this.startY;
    if (this.scale <= 1.01 && Math.abs(deltaX) >= 58 && Math.abs(deltaY) < 100) {
      this.lastTapAt = 0;
      this.zone.run(() => { if (deltaX < 0) void this.nextMedia(); else void this.previousMedia(); });
      return;
    }
    if (Math.abs(deltaX) < 18 && Math.abs(deltaY) < 18 && this.isImageMedia) this.handleTap(event.clientX, event.clientY);
    if (this.scale <= 1.01) this.resetZoom(false);
    else { this.constrainPan(); this.applyImageTransform(true); }
  }

  private onPointerCancel(event: PointerEvent) {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.delete(event.pointerId);
    if (!this.pointers.size) {
      this.pointerMode = 'idle';
      this.hadMultiTouch = false;
      this.constrainPan();
      this.applyImageTransform(true);
    }
  }

  private beginPinch() {
    const [a, b] = Array.from(this.pointers.values());
    this.pinchStartDistance = Math.hypot(b.x - a.x, b.y - a.y);
    this.startScale = this.scale;
    this.startTx = this.translateX;
    this.startTy = this.translateY;
    const centerX = (a.x + b.x) / 2 - this.stageCenterX();
    const centerY = (a.y + b.y) / 2 - this.stageCenterY();
    this.pinchAnchorX = (centerX - this.translateX) / this.scale;
    this.pinchAnchorY = (centerY - this.translateY) / this.scale;
  }

  private handleTap(x: number, y: number) {
    const now = performance.now();
    if (now - this.lastTapAt < 320 && Math.hypot(x - this.lastTapX, y - this.lastTapY) < 32) {
      this.lastTapAt = 0;
      if (this.scale > 1.01) this.resetZoom(true);
      else this.zoomTo(2, x, y);
    } else {
      this.lastTapAt = now;
      this.lastTapX = x;
      this.lastTapY = y;
    }
  }

  private zoomTo(scale: number, x: number, y: number) {
    const focalX = x - this.stageCenterX();
    const focalY = y - this.stageCenterY();
    const imageX = (focalX - this.translateX) / this.scale;
    const imageY = (focalY - this.translateY) / this.scale;
    this.scale = Math.max(1, Math.min(this.maxZoom, scale));
    this.translateX = focalX - imageX * this.scale;
    this.translateY = focalY - imageY * this.scale;
    this.constrainPan();
    this.applyImageTransform(true);
  }

  private stageCenterX(): number { return this.boundStage ? this.boundStage.getBoundingClientRect().left + this.boundStage.clientWidth / 2 : 0; }
  private stageCenterY(): number { return this.boundStage ? this.boundStage.getBoundingClientRect().top + this.boundStage.clientHeight / 2 : 0; }

  private constrainPan() {
    const image = this.boundStage?.querySelector<HTMLImageElement>('.zoomable-image');
    if (!image || !this.boundStage) return;
    const maxX = Math.max(0, (image.offsetWidth * this.scale - this.boundStage.clientWidth) / 2);
    const maxY = Math.max(0, (image.offsetHeight * this.scale - this.boundStage.clientHeight) / 2);
    this.translateX = Math.max(-maxX, Math.min(maxX, this.translateX));
    this.translateY = Math.max(-maxY, Math.min(maxY, this.translateY));
    if (this.scale <= 1.001) { this.translateX = 0; this.translateY = 0; this.scale = 1; }
  }

  private applyImageTransform(animate: boolean) {
    const image = this.boundStage?.querySelector<HTMLImageElement>('.zoomable-image');
    if (!image) return;
    image.style.transition = animate ? 'transform 220ms cubic-bezier(.2,.75,.25,1)' : 'none';
    image.style.transform = `translate3d(${this.translateX}px, ${this.translateY}px, 0) scale(${this.scale})`;
  }

  onImageLoaded() {
    this.resetZoom(false);
    requestAnimationFrame(() => this.constrainPan());
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
