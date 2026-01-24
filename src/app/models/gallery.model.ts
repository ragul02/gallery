export interface Photo {
  id: string;
  filepath: string;
  webviewPath?: string;
  base64?: string;
  name: string;
  dateTaken: Date;
  size?: number;
  albumId?: string;
}

export interface Album {
  id: string;
  name: string;
  createdDate: Date;
  coverPhoto?: string;
  photoCount: number;
}

export enum SortType {
  DATE_DESC = 'date_desc',
  DATE_ASC = 'date_asc',
  NAME_ASC = 'name_asc',
  NAME_DESC = 'name_desc',
  SIZE_DESC = 'size_desc',
  SIZE_ASC = 'size_asc'
}

// New interfaces for MediaStore integration
export interface MediaItemView {
  id: string;
  name: string;
  dateTaken: Date;
  size: number;
  thumbnailUrl?: string;
  uri: string;
  type: 'image' | 'video';
  bucket: string;
  width: number;
  height: number;
  duration?: number;
}

export interface AlbumView {
  id: string;
  name: string;
  count: number;
  coverThumbnail?: string;
  type: 'auto' | 'custom';
}

export enum MediaFilterType {
  ALL = 'all',
  IMAGES = 'image',
  VIDEOS = 'video'
}

