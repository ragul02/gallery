import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { MediaService } from '../../services/media.service';
import { PhotoService } from '../../services/photo.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: false
})
export class SettingsPage {
  imageCount = 0;
  videoCount = 0;
  totalSize = 0;

  constructor(private mediaService: MediaService, private photoService: PhotoService, private router: Router) {}

  async ionViewWillEnter() {
    await this.photoService.whenReady();
    await this.mediaService.scanAllMedia({ forceRefresh: false });
    await this.mediaService.refreshRecentMedia(false);
    const photos = this.photoService.getPhotos();
    this.imageCount = this.mediaService.getImageCount() + photos.length;
    this.videoCount = this.mediaService.getVideoCount();
    this.totalSize = this.mediaService.getTotalSize() + photos.reduce((total, photo) => total + (photo.size || 0), 0);
  }

  get totalCount(): number { return this.imageCount + this.videoCount; }

  get storageLabel(): string {
    if (this.totalSize >= 1024 * 1024 * 1024) return `${(this.totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    return `${(this.totalSize / (1024 * 1024)).toFixed(1)} MB`;
  }

  goHome() { void this.router.navigate(['/home']); }
}
