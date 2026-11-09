import { Injectable } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface PrivateAlbum { id: string; name: string; count: number; }
export interface PrivateMedia { id: string; albumId: string; name: string; mimeType: string; type: 'image'|'video'; size: number; dateTaken: number; thumbnail?:string; }
interface SecureFolderNative {
  status(): Promise<{configured:boolean; authenticated:boolean}>;
  setupPin(options:{pin:string}):Promise<{ok:boolean}>;
  verifyPin(options:{pin:string}):Promise<{ok:boolean;retryAfterMs?:number}>;
  lock():Promise<{ok:boolean}>;
  albums():Promise<{albums:PrivateAlbum[]}>;
  createAlbum(options:{name:string}):Promise<PrivateAlbum>;
  listMedia(options:{albumId:string}):Promise<{media:PrivateMedia[]}>;
  importDeviceMedia(options:{mediaId:string;type:'image'|'video'}):Promise<{media:PrivateMedia;sourceId:string;sourceType:'image'|'video'}>;
  importLocalMedia(options:{fileName:string;name:string;mimeType:string;dateTaken:number}):Promise<{media:PrivateMedia}>;
  privateThumbnail(options:{id:string}):Promise<{thumbnail:string}>;
  openPrivateMedia(options:{id:string}):Promise<{path:string;mimeType:string}>;
  clearPrivatePreview():Promise<{ok:boolean}>;
  deletePrivateMedia(options:{id:string}):Promise<{removed:boolean}>;
  restoreMedia(options:{id:string}):Promise<{restored:boolean;bytes:number}>;
  changePin(options:{currentPin:string;newPin:string}):Promise<{ok:boolean}>;
}
const NativeSecureFolder=registerPlugin<SecureFolderNative>('SecureFolder');

@Injectable({providedIn:'root'})
export class SecureFolderService {
  private state?: {configured:boolean;authenticated:boolean};
  private lifecycleBound=false;
  async status(){this.state=await NativeSecureFolder.status();return this.state;}
  async setup(pin:string){const r=await NativeSecureFolder.setupPin({pin});this.state={configured:r.ok,authenticated:r.ok};}
  async authenticate(pin:string){const r=await NativeSecureFolder.verifyPin({pin});this.state={configured:true,authenticated:r.ok};return r;}
  async lock(){this.state={configured:true,authenticated:false};await NativeSecureFolder.lock();}
  watchLifecycle(onLock:()=>void){if(this.lifecycleBound)return;this.lifecycleBound=true;document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){void this.lock();onLock();}});}
  async albums(){return (await NativeSecureFolder.albums()).albums;}
  async createAlbum(name:string){return NativeSecureFolder.createAlbum({name});}
  async media(albumId:string){return (await NativeSecureFolder.listMedia({albumId})).media;}
  async importDevice(mediaId:string,type:'image'|'video'){return NativeSecureFolder.importDeviceMedia({mediaId,type});}
  async importLocal(fileName:string,name:string,mimeType:string,dateTaken:number){return NativeSecureFolder.importLocalMedia({fileName,name,mimeType,dateTaken});}
  async thumbnail(id:string){return (await NativeSecureFolder.privateThumbnail({id})).thumbnail;}
  async openPrivateMedia(id:string){await NativeSecureFolder.clearPrivatePreview();const r=await NativeSecureFolder.openPrivateMedia({id});return {url:Capacitor.convertFileSrc(r.path),mimeType:r.mimeType};}
  async clearPreview(){await NativeSecureFolder.clearPrivatePreview();}
  async remove(id:string){return NativeSecureFolder.deletePrivateMedia({id});}
  async restore(id:string){return NativeSecureFolder.restoreMedia({id});}
  async changePin(currentPin:string,newPin:string){await NativeSecureFolder.changePin({currentPin,newPin});}
}
