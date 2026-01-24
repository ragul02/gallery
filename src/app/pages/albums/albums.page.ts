import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, ActionSheetController } from '@ionic/angular';
import { PhotoService } from '../../services/photo.service';
import { Album } from '../../models/gallery.model';

@Component({
  selector: 'app-albums',
  templateUrl: './albums.page.html',
  styleUrls: ['./albums.page.scss'],
})
export class AlbumsPage implements OnInit {
  albums: Album[] = [];

  constructor(
    private photoService: PhotoService,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadAlbums();
  }

  ionViewWillEnter() {
    this.loadAlbums();
  }

  loadAlbums() {
    this.albums = this.photoService.getAlbums();
  }

  async createAlbum() {
    const alert = await this.alertController.create({
      header: 'Create Album',
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
              this.loadAlbums();
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async showAlbumActions(album: Album) {
    const actionSheet = await this.actionSheetController.create({
      header: album.name,
      buttons: [
        {
          text: 'Open',
          icon: 'open',
          handler: () => {
            this.openAlbum(album);
          }
        },
        {
          text: 'Delete',
          role: 'destructive',
          icon: 'trash',
          handler: () => {
            this.deleteAlbum(album);
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

  openAlbum(album: Album) {
    this.router.navigate(['/album', album.id]);
  }

  async deleteAlbum(album: Album) {
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
            this.loadAlbums();
          }
        }
      ]
    });
    await alert.present();
  }
}
