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
