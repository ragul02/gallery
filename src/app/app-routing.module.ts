import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'home',
    loadChildren: () => import('./pages/home/home.module').then(m => m.HomePageModule)
  },
  {
    path: 'albums',
    loadChildren: () => import('./pages/albums/albums.module').then(m => m.AlbumsPageModule)
  },
  {
    path: 'album/:id',
    loadChildren: () => import('./pages/album-detail/album-detail.module').then(m => m.AlbumDetailPageModule)
  },
  {
    path: 'viewer/:id',
    loadChildren: () => import('./pages/viewer/viewer.module').then(m => m.ViewerPageModule)
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
