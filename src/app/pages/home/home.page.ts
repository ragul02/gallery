import { Component, OnInit } from '@angular/core';
import { ActionSheetController, AlertController, LoadingController } from '@ionic/angular';
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
    private alertController: AlertController,
    private loadingController: LoadingController
  ) {}

  async ngOnInit() {
    this.loadPhotos();
    await this.checkInitialScan();
  }

  ionViewWillEnter() {
    this.loadPhotos();
  }

  // Check if we need to prompt for initial photo import
  async checkInitialScan() {
    const hasScanned = await this.photoService.hasCompletedInitialScan();
    
    if (!hasScanned) {
      // Show welcome dialog
      const alert = await this.alertController.create({
        header: 'Welcome to Gallery!',
        message: 'Would you like to import existing photos and videos from your device?',
        buttons: [
          {
            text: 'Not Now',
            role: 'cancel',
            handler: async () => {
              // Mark as complete even if user skips
              await this.photoService.importPhotosFromDevice();
            }
          },
          {
            text: 'Import Photos',
            handler: async () => {
              await this.importDevicePhotos();
            }
          }
        ],
        backdropDismiss: false
      });
      await alert.present();
    }
  }

  // Import photos from device
  async importDevicePhotos() {
    const loading = await this.loadingController.create({
      message: 'Importing photos...',
    });
    await loading.present();

    try {
      const count = await this.photoService.importPhotosFromDevice();
      await loading.dismiss();

      if (count > 0) {
        this.loadPhotos();
        const alert = await this.alertController.create({
          header: 'Success!',
          message: `Imported ${count} photo${count !== 1 ? 's' : ''} successfully.`,
          buttons: ['OK']
        });
        await alert.present();
      }
    } catch (error) {
      await loading.dismiss();
      console.error('Error importing photos:', error);
    }
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
          text: 'Import Multiple Photos',
          icon: 'albums',
          handler: () => {
            this.importDevicePhotos();
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
