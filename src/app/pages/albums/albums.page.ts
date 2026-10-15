import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { PhotoService } from '../../services/photo.service';
import { MediaService } from '../../services/media.service';
import { Album, AlbumView } from '../../models/gallery.model';

@Component({
  selector: 'app-albums',
  templateUrl: './albums.page.html',
  styleUrls: ['./albums.page.scss'],
  standalone: false
})
export class AlbumsPage implements OnInit {
  // Legacy custom albums
  customAlbums: Album[] = [];
  
  // Auto-detected folders from MediaStore
  autoAlbums: AlbumView[] = [];
  
  // Combined view
  allAlbums: AlbumView[] = [];
  
  hasPermission = false;
  isLoading = false;
  thumbnails = new Map<string, string>();

  constructor(
    private photoService: PhotoService,
    private mediaService: MediaService,
    private alertController: AlertController,
    private router: Router
  ) {}

  async ngOnInit() {
    await this.initialize();
  }

  async ionViewWillEnter() {
    if (this.hasPermission) {
      await this.mediaService.scanAllMedia({ forceRefresh: false });
      await this.mediaService.refreshRecentMedia(false);
    }
    await this.loadAlbums();
  }

  async initialize() {
    this.hasPermission = await this.mediaService.checkPermissions();
    if (this.hasPermission) await this.mediaService.scanAllMedia({ forceRefresh: false });
    await this.loadAlbums();
  }

  async loadAlbums() {
    this.isLoading = true;

    // Load custom albums (legacy)
    this.customAlbums = this.photoService.getAlbums();

    // Load auto-detected albums if we have permission
    if (this.hasPermission) {
      try {
        const albums = await this.mediaService.getAlbums();
        
        // Convert to view models
        this.autoAlbums = await Promise.all(
          albums.map(async (album) => {
            const cover = this.mediaService.getAlbumCover(album.name, album.id);
            let coverThumbnail: string | undefined;
            
            if (cover) {
              try {
                coverThumbnail = await this.mediaService.getThumbnail(cover.id, cover.type);
                this.thumbnails.set(album.id, coverThumbnail);
              } catch (error) {
                console.error('Error loading album cover:', error);
              }
            }

            return {
              id: album.id,
              name: album.name,
              count: album.count,
              coverThumbnail,
              type: 'auto' as const
            };
          })
        );

        // Combine both types
        this.allAlbums = [
          ...this.autoAlbums,
          ...this.customAlbums.map(album => ({
            id: album.id,
            name: album.name,
            count: album.photoCount,
            coverThumbnail: album.coverPhoto,
            type: 'custom' as const
          }))
        ];
      } catch (error) {
        console.error('Error loading auto albums:', error);
        // Fall back to custom albums only
        this.allAlbums = this.customAlbums.map(album => ({
          id: album.id,
          name: album.name,
          count: album.photoCount,
          coverThumbnail: album.coverPhoto,
          type: 'custom' as const
        }));
      }
    } else {
      // Only show custom albums
      this.allAlbums = this.customAlbums.map(album => ({
        id: album.id,
        name: album.name,
        count: album.photoCount,
        coverThumbnail: album.coverPhoto,
        type: 'custom' as const
      }));
    }

    this.isLoading = false;
  }

  async createAlbum() {
    const alert = await this.alertController.create({
      header: 'Create Album',
      message: 'Create a custom album to organize your photos',
      inputs: [
        {
          name: 'name',
          type: 'text',
          placeholder: 'Album name'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Create',
          handler: async (data) => {
            if (data.name && data.name.trim()) {
              await this.photoService.createAlbum(data.name.trim());
              await this.loadAlbums();
            }
          }
        }
      ]
    });
    await alert.present();
  }

  openAlbum(album: AlbumView) {
    if (album.type === 'auto') {
      // Navigate to home with filter
      this.router.navigate(['/home'], {
        queryParams: { album: album.name, albumId: album.id }
      });
    } else {
      // Navigate to custom album detail
      this.router.navigate(['/album', album.id]);
    }
  }

  async deleteAlbum(album: AlbumView) {
    if (album.type !== 'custom') {
      return; // Cannot delete auto albums
    }

    const alert = await this.alertController.create({
      header: 'Delete Album',
      message: `Are you sure you want to delete "${album.name}"? Photos will not be deleted.`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            await this.photoService.deleteAlbum(album.id);
            await this.loadAlbums();
          }
        }
      ]
    });
    await alert.present();
  }

  getThumbnail(albumId: string): string {
    return this.thumbnails.get(albumId) || '';
  }

  get autoAlbumsCount(): number {
    return this.autoAlbums.length;
  }

  get customAlbumsCount(): number {
    return this.customAlbums.length;
  }
}
