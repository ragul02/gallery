import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MediaService, MediaSortType } from '../../services/media.service';
import { MediaItem } from '../../plugins/media-store.plugin';
import { GestureController, Platform } from '@ionic/angular';

@Component({
  selector: 'app-viewer',
  templateUrl: './viewer.page.html',
  styleUrls: ['./viewer.page.scss'],
  standalone: false
})
export class ViewerPage implements OnInit {
  @ViewChild('imageContainer', { read: ElementRef }) imageContainer!: ElementRef;
  
  currentMedia: MediaItem | null = null;
  allMedia: MediaItem[] = [];
  currentIndex = 0;
  thumbnailUrl = '';
  showControls = true;
  
  // Zoom state
  scale = 1;
  minScale = 1;
  maxScale = 4;
  translateX = 0;
  translateY = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mediaService: MediaService,
    private gestureCtrl: GestureController,
    private platform: Platform
  ) {}

  async ngOnInit() {
    const mediaId = this.route.snapshot.paramMap.get('id');
    const filter = this.route.snapshot.queryParamMap.get('filter');
    const album = this.route.snapshot.queryParamMap.get('album');

    if (!mediaId) {
      this.router.navigate(['/home']);
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

  ionViewDidEnter() {
    this.setupGestures();
  }

  async loadMedia(index: number) {
    if (index < 0 || index >= this.allMedia.length) {
      return;
    }

    this.currentIndex = index;
    this.currentMedia = this.allMedia[index];
    this.resetZoom();

    // Load thumbnail
    try {
      this.thumbnailUrl = await this.mediaService.getThumbnail(
        this.currentMedia.id,
        this.currentMedia.type
      );
    } catch (error) {
      console.error('Error loading thumbnail:', error);
    }
  }

  setupGestures() {
    if (!this.imageContainer) {
      return;
    }

    const element = this.imageContainer.nativeElement;

    // Pinch to zoom
    const pinchGesture = this.gestureCtrl.create({
      el: element,
      gestureName: 'pinch',
      onMove: (detail) => {
        this.scale = Math.max(this.minScale, Math.min(this.maxScale, detail.deltaX / 100 + 1));
        this.updateTransform();
      }
    });

    pinchGesture.enable();

    // Pan gesture
    const panGesture = this.gestureCtrl.create({
      el: element,
      gestureName: 'pan',
      direction: 'x',
      onMove: (detail) => {
        if (this.scale > 1) {
          this.translateX += detail.deltaX;
          this.translateY += detail.deltaY;
          this.updateTransform();
        }
      },
      onEnd: (detail) => {
        // Swipe to next/previous if not zoomed
        if (this.scale === 1) {
          if (detail.deltaX > 100) {
            this.previousMedia();
          } else if (detail.deltaX < -100) {
            this.nextMedia();
          }
        }
      }
    });

    panGesture.enable();
  }

  updateTransform() {
    if (this.imageContainer) {
      const element = this.imageContainer.nativeElement.querySelector('img, video');
      if (element) {
        element.style.transform = `scale(${this.scale}) translate(${this.translateX}px, ${this.translateY}px)`;
      }
    }
  }

  resetZoom() {
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.updateTransform();
  }

  toggleControls() {
    this.showControls = !this.showControls;
  }

  async nextMedia() {
    if (this.currentIndex < this.allMedia.length - 1) {
      await this.loadMedia(this.currentIndex + 1);
    }
  }

  async previousMedia() {
    if (this.currentIndex > 0) {
      await this.loadMedia(this.currentIndex - 1);
    }
  }

  close() {
    this.router.navigate(['/home']);
  }

  get canGoNext(): boolean {
    return this.currentIndex < this.allMedia.length - 1;
  }

  get canGoPrevious(): boolean {
    return this.currentIndex > 0;
  }

  get mediaCounter(): string {
    return `${this.currentIndex + 1} / ${this.allMedia.length}`;
  }
}
