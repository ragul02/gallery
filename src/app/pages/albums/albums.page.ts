import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { PhotoService } from '../../services/photo.service';
import { MediaService } from '../../services/media.service';
import { Album, AlbumView } from '../../models/gallery.model';
import { FavoriteService } from '../../services/favorite.service';
import { AlbumInfo, MediaItem } from '../../plugins/media-store.plugin';

@Component({
  selector: 'app-albums',
  templateUrl: './albums.page.html',
  styleUrls: ['./albums.page.scss'],
  standalone: false
})
export class AlbumsPage implements OnInit {
  private unsubscribeFavorites?: () => void;
  // Legacy custom albums
  customAlbums: Album[] = [];
  
  // Auto-detected folders from MediaStore
  autoAlbums: AlbumView[] = [];
  
  // Combined view
  allAlbums: AlbumView[] = [];
  
  hasPermission = false;
  isLoading = false;
  thumbnails = new Map<string, string>();
  private coverMediaKeys = new Map<string, string>();

  constructor(
    private photoService: PhotoService,
    private mediaService: MediaService,
    private alertController: AlertController,
    private router: Router,
    private favoriteService: FavoriteService
  ) {}

  async ngOnInit() {
    this.unsubscribeFavorites = this.favoriteService.subscribe(() => { void this.loadAlbums(); });
    await this.initialize();
  }

  ngOnDestroy() { this.unsubscribeFavorites?.(); }

  async ionViewWillEnter() {
    await this.loadAlbums();
  }

  async initialize() {
    this.hasPermission = await this.mediaService.checkPermissions();
    if (this.hasPermission) {
      const cachedMedia = await this.mediaService.loadCachedMediaIndex();
      if (cachedMedia.length === 0) await this.mediaService.scanAllMedia({ forceRefresh: false });
    }
    await this.loadAlbums();
  }

  async loadAlbums() {
    this.isLoading = true;
    await this.favoriteService.whenReady();
    this.customAlbums = this.photoService.getAlbums();
    const favoriteMedia = this.mediaService.getMedia().filter(item => this.favoriteService.isFavoriteSync(item.id, item.type));
    const localFavorites = this.photoService.getPhotos().filter(photo => this.favoriteService.isFavoriteSync(photo.id, 'local'));
    const favoriteCover = favoriteMedia[0];
    const favoriteCoverKey = favoriteCover ? `${favoriteCover.type}:${favoriteCover.id}` : localFavorites[0] ? `local:${localFavorites[0].id}` : undefined;
    const favoritesAlbum: AlbumView = {
      id: 'favorites',
      name: 'Favorites',
      count: favoriteMedia.length + localFavorites.length,
      coverThumbnail: favoriteCoverKey && this.coverMediaKeys.get('favorites') === favoriteCoverKey
        ? this.thumbnails.get('favorites')
        : favoriteCover ? undefined : localFavorites[0]?.webviewPath,
      type: 'auto'
    };

    if (this.hasPermission) {
      try {
        const albums = await this.mediaService.getAlbums();
        this.autoAlbums = albums.map(album => {
          const cover = this.mediaService.getAlbumCover(album.name, album.id);
          const coverKey = cover ? `${cover.type}:${cover.id}` : undefined;
          return {
            id: album.id,
            name: album.name,
            count: album.count,
            coverThumbnail: coverKey && this.coverMediaKeys.get(album.id) === coverKey ? this.thumbnails.get(album.id) : undefined,
            type: 'auto' as const
          };
        });
        this.allAlbums = [
          favoritesAlbum,
          ...this.autoAlbums,
          ...this.customAlbums.map(album => ({
            id: album.id,
            name: album.name,
            count: album.photoCount,
            coverThumbnail: album.coverPhoto,
            type: 'custom' as const
          }))
        ];
        this.isLoading = false;
        void this.loadAlbumCovers(albums, favoriteCover, favoriteCoverKey);
        return;
      } catch (error) {
        console.error('Error loading auto albums:', error);
      }
    }

    this.autoAlbums = [];
    this.allAlbums = [favoritesAlbum, ...this.customAlbums.map(album => ({
        id: album.id,
        name: album.name,
        count: album.photoCount,
        coverThumbnail: album.coverPhoto,
        type: 'custom' as const
      }))];
    this.isLoading = false;
  }

  private async loadAlbumCovers(albums: AlbumInfo[], favoriteCover?: MediaItem, favoriteCoverKey?: string) {
    const work: Array<{ key: string; media?: MediaItem }> = [];
    if (favoriteCover && favoriteCoverKey && this.coverMediaKeys.get('favorites') !== favoriteCoverKey) work.push({ key: 'favorites', media: favoriteCover });
    for (const album of albums) {
      const cover = this.mediaService.getAlbumCover(album.name, album.id);
      const coverKey = cover ? `${cover.type}:${cover.id}` : undefined;
      if (cover && coverKey && this.coverMediaKeys.get(album.id) !== coverKey) work.push({ key: album.id, media: cover });
    }

    for (let i = 0; i < work.length; i += 4) {
      await Promise.all(work.slice(i, i + 4).map(async ({ key, media }) => {
        if (!media) return;
        try {
          const thumbnail = await this.mediaService.getThumbnail(media.id, media.type);
          this.thumbnails.set(key, thumbnail);
          this.coverMediaKeys.set(key, `${media.type}:${media.id}`);
          const album = this.allAlbums.find(item => item.id === key);
          if (album) album.coverThumbnail = thumbnail;
        } catch (error) {
          console.warn('Could not load album cover:', key, error);
        }
      }));
    }
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
    if (album.id === 'favorites') {
      this.router.navigate(['/home'], { queryParams: { favorites: 'true' } });
      return;
    }
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
