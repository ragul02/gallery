import { Component, OnInit } from '@angular/core';
import { ActionSheetController, AlertController } from '@ionic/angular';
import { PhotoService } from '../../services/photo.service';
import { Photo, SortType } from '../../models/gallery.model';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false
})
export class HomePage implements OnInit {
  photos: Photo[] = [];
  currentSort: SortType = SortType.DATE_DESC;
  sortTypes = SortType;

  constructor(
    public photoService: PhotoService,
    public actionSheetController: ActionSheetController,
    private alertController: AlertController
  ) {}

  ngOnInit() {
    this.loadPhotos();
  }

  ionViewWillEnter() {
    this.loadPhotos();
  }

  loadPhotos() {
    this.photos = this.photoService.getPhotos(this.currentSort);
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
          text: 'Choose from Gallery',
          icon: 'images',
          handler: () => {
            this.chooseFromGallery();
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
      this.loadPhotos();
    } catch (error) {
      console.error('Error taking photo:', error);
    }
  }

  async chooseFromGallery() {
    try {
      await this.photoService.addFromGallery();
      this.loadPhotos();
    } catch (error) {
      console.error('Error choosing from gallery:', error);
    }
  }

  async showPhotoActions(photo: Photo) {
    const albums = this.photoService.getAlbums();
    const albumButtons = albums.map(album => ({
      text: album.name,
      handler: () => {
        this.addToAlbum(photo, album.id);
      }
    }));

    const actionSheet = await this.actionSheetController.create({
      header: 'Photo Actions',
      buttons: [
        {
          text: 'Add to Album',
          icon: 'folder',
          handler: async () => {
            if (albums.length === 0) {
              const alert = await this.alertController.create({
                header: 'No Albums',
                message: 'Create an album first from the Albums tab.',
                buttons: ['OK']
              });
              await alert.present();
            } else {
              const albumSheet = await this.actionSheetController.create({
                header: 'Select Album',
                buttons: [...albumButtons, {
                  text: 'Cancel',
                  icon: 'close',
                  role: 'cancel'
                }]
              });
              await albumSheet.present();
            }
          }
        },
        {
          text: 'Delete',
          role: 'destructive',
          icon: 'trash',
          handler: () => {
            this.deletePhoto(photo);
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

  async addToAlbum(photo: Photo, albumId: string) {
    await this.photoService.addPhotoToAlbum(photo.id, albumId);
    this.loadPhotos();
    
    const alert = await this.alertController.create({
      header: 'Success',
      message: 'Photo added to album',
      buttons: ['OK']
    });
    await alert.present();
  }

  async deletePhoto(photo: Photo) {
    const alert = await this.alertController.create({
      header: 'Delete Photo',
      message: 'Are you sure you want to delete this photo?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            await this.photoService.deletePhoto(photo);
            this.loadPhotos();
          }
        }
      ]
    });
    await alert.present();
  }

  async showSortOptions() {
    const actionSheet = await this.actionSheetController.create({
      header: 'Sort By',
      buttons: [
        {
          text: 'Date (Newest First)',
          icon: 'calendar',
          handler: () => {
            this.currentSort = SortType.DATE_DESC;
            this.loadPhotos();
          }
        },
        {
          text: 'Date (Oldest First)',
          icon: 'calendar-outline',
          handler: () => {
            this.currentSort = SortType.DATE_ASC;
            this.loadPhotos();
          }
        },
        {
          text: 'Name (A-Z)',
          icon: 'text',
          handler: () => {
            this.currentSort = SortType.NAME_ASC;
            this.loadPhotos();
          }
        },
        {
          text: 'Name (Z-A)',
          icon: 'text-outline',
          handler: () => {
            this.currentSort = SortType.NAME_DESC;
            this.loadPhotos();
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
}
