import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ActionSheetController, AlertController } from '@ionic/angular';
import { PhotoService } from '../../services/photo.service';
import { Album, Photo, SortType } from '../../models/gallery.model';

@Component({
  selector: 'app-album-detail',
  templateUrl: './album-detail.page.html',
  styleUrls: ['./album-detail.page.scss'],
  standalone: false
})
export class AlbumDetailPage implements OnInit {
  album?: Album;
  photos: Photo[] = [];
  currentSort: SortType = SortType.DATE_DESC;

  constructor(
    private route: ActivatedRoute,
    private photoService: PhotoService,
    private actionSheetController: ActionSheetController,
    private alertController: AlertController
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.album = this.photoService.getAlbumById(id);
      this.loadPhotos();
    }
  }

  ionViewWillEnter() {
    this.loadPhotos();
  }

  loadPhotos() {
    if (this.album) {
      this.photos = this.photoService.getPhotosByAlbum(this.album.id, this.currentSort);
    }
  }

  async showPhotoActions(photo: Photo) {
    const actionSheet = await this.actionSheetController.create({
      header: 'Photo Actions',
      buttons: [
        {
          text: 'Remove from Album',
          icon: 'remove-circle',
          handler: () => {
            this.removeFromAlbum(photo);
          }
        },
        {
          text: 'Delete Photo',
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

  async removeFromAlbum(photo: Photo) {
    const alert = await this.alertController.create({
      header: 'Remove from Album',
      message: 'Remove this photo from the album? The photo will still be in your gallery.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Remove',
          handler: async () => {
            await this.photoService.removePhotoFromAlbum(photo.id);
            this.loadPhotos();
          }
        }
      ]
    });
    await alert.present();
  }

  async deletePhoto(photo: Photo) {
    const alert = await this.alertController.create({
      header: 'Delete Photo',
      message: 'Are you sure you want to delete this photo permanently?',
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
