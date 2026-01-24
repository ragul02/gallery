import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AlbumDetailPageRoutingModule } from './album-detail-routing.module';
import { AlbumDetailPage } from './album-detail.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AlbumDetailPageRoutingModule
  ],
  declarations: [AlbumDetailPage]
})
export class AlbumDetailPageModule {}
