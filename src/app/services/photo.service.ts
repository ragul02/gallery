import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource, Photo as CameraPhoto } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Photo, Album, SortType } from '../models/gallery.model';

@Injectable({
  providedIn: 'root'
})
export class PhotoService {
  private photos: Photo[] = [];
  private albums: Album[] = [];
  private PHOTO_STORAGE = 'photos';
  private ALBUM_STORAGE = 'albums';

  constructor() {
    this.loadSaved();
  }

  // Load photos and albums from storage
  async loadSaved() {
    const photoList = await Preferences.get({ key: this.PHOTO_STORAGE });
    this.photos = JSON.parse(photoList.value || '[]').map((p: any) => ({
      ...p,
      dateTaken: new Date(p.dateTaken)
    }));

    const albumList = await Preferences.get({ key: this.ALBUM_STORAGE });
    this.albums = JSON.parse(albumList.value || '[]').map((a: any) => ({
      ...a,
      createdDate: new Date(a.createdDate)
    }));

    // Load photo data from filesystem
    for (let photo of this.photos) {
      const readFile = await Filesystem.readFile({
        path: photo.filepath,
        directory: Directory.Data
      });
      photo.webviewPath = `data:image/jpeg;base64,${readFile.data}`;
    }
  }

  // Take a new photo
  async addNewPhoto() {
    const capturedPhoto = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      quality: 90
    });

    const savedPhoto = await this.savePicture(capturedPhoto);
    this.photos.unshift(savedPhoto);
    await this.savePhotos();
    return savedPhoto;
  }

  // Pick photo from gallery
  async addFromGallery() {
    const capturedPhoto = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Photos,
      quality: 90
    });

    const savedPhoto = await this.savePicture(capturedPhoto);
    this.photos.unshift(savedPhoto);
    await this.savePhotos();
    return savedPhoto;
  }

  // Save picture to filesystem
  private async savePicture(photo: CameraPhoto): Promise<Photo> {
    const base64Data = await this.readAsBase64(photo);
    const fileName = new Date().getTime() + '.jpeg';
    
    await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Data
    });

    // Calculate size from base64 data
    const sizeInBytes = Math.round((base64Data.length * 3) / 4);

    return {
      id: fileName,
      filepath: fileName,
      webviewPath: photo.webPath,
      name: fileName,
      dateTaken: new Date(),
      base64: base64Data,
      size: sizeInBytes
    };
  }

  // Convert photo to base64
  private async readAsBase64(photo: CameraPhoto): Promise<string> {
    if (photo.base64String) {
      return photo.base64String;
    }

    if (!photo.webPath) {
      throw new Error('Photo webPath is not available');
    }

    const response = await fetch(photo.webPath);
    const blob = await response.blob();

    return await this.convertBlobToBase64(blob) as string;
  }

  // Convert blob to base64
  private convertBlobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.readAsDataURL(blob);
  });

  // Delete a photo
  async deletePhoto(photo: Photo) {
    this.photos = this.photos.filter(p => p.id !== photo.id);
    
    await Filesystem.deleteFile({
      path: photo.filepath,
      directory: Directory.Data
    });

    await this.savePhotos();
  }

  // Save photos to storage
  private async savePhotos() {
    const photosToSave = this.photos.map(p => ({
      id: p.id,
      filepath: p.filepath,
      name: p.name,
      dateTaken: p.dateTaken,
      size: p.size,
      albumId: p.albumId
    }));
    await Preferences.set({
      key: this.PHOTO_STORAGE,
      value: JSON.stringify(photosToSave)
    });
  }

  // Get all photos
  getPhotos(sortType: SortType = SortType.DATE_DESC): Photo[] {
    return this.sortPhotos([...this.photos], sortType);
  }

  // Get photos by album
  getPhotosByAlbum(albumId: string, sortType: SortType = SortType.DATE_DESC): Photo[] {
    const albumPhotos = this.photos.filter(p => p.albumId === albumId);
    return this.sortPhotos(albumPhotos, sortType);
  }

  // Sort photos
  private sortPhotos(photos: Photo[], sortType: SortType): Photo[] {
    switch (sortType) {
      case SortType.DATE_DESC:
        return photos.sort((a, b) => b.dateTaken.getTime() - a.dateTaken.getTime());
      case SortType.DATE_ASC:
        return photos.sort((a, b) => a.dateTaken.getTime() - b.dateTaken.getTime());
      case SortType.NAME_ASC:
        return photos.sort((a, b) => a.name.localeCompare(b.name));
      case SortType.NAME_DESC:
        return photos.sort((a, b) => b.name.localeCompare(a.name));
      case SortType.SIZE_DESC:
        return photos.sort((a, b) => (b.size || 0) - (a.size || 0));
      case SortType.SIZE_ASC:
        return photos.sort((a, b) => (a.size || 0) - (b.size || 0));
      default:
        return photos;
    }
  }

  // Album management
  async createAlbum(name: string): Promise<Album> {
    const album: Album = {
      id: new Date().getTime().toString(),
      name: name,
      createdDate: new Date(),
      photoCount: 0
    };
    this.albums.push(album);
    await this.saveAlbums();
    return album;
  }

  async deleteAlbum(albumId: string) {
    // Remove album reference from photos
    this.photos.forEach(p => {
      if (p.albumId === albumId) {
        p.albumId = undefined;
      }
    });
    await this.savePhotos();

    this.albums = this.albums.filter(a => a.id !== albumId);
    await this.saveAlbums();
  }

  getAlbums(): Album[] {
    // Update photo counts
    this.albums.forEach(album => {
      album.photoCount = this.photos.filter(p => p.albumId === album.id).length;
      const albumPhotos = this.photos.filter(p => p.albumId === album.id);
      if (albumPhotos.length > 0) {
        album.coverPhoto = albumPhotos[0].webviewPath;
      }
    });
    return this.albums;
  }

  getAlbumById(id: string): Album | undefined {
    return this.albums.find(a => a.id === id);
  }

  async addPhotoToAlbum(photoId: string, albumId: string) {
    const photo = this.photos.find(p => p.id === photoId);
    if (photo) {
      photo.albumId = albumId;
      await this.savePhotos();
    }
  }

  async removePhotoFromAlbum(photoId: string) {
    const photo = this.photos.find(p => p.id === photoId);
    if (photo) {
      photo.albumId = undefined;
      await this.savePhotos();
    }
  }

  private async saveAlbums() {
    await Preferences.set({
      key: this.ALBUM_STORAGE,
      value: JSON.stringify(this.albums)
    });
  }
}
