import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

/** Persists stable media keys and publishes changes to every gallery screen. */
@Injectable({ providedIn: 'root' })
export class FavoriteService {
  private readonly storageKey = 'favorite_media_v1';
  private readonly favorites = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private readonly ready: Promise<void>;

  constructor() { this.ready = this.load(); }

  private async load(): Promise<void> {
    try {
      const result = await Preferences.get({ key: this.storageKey });
      const parsed = JSON.parse(result.value || '[]');
      if (Array.isArray(parsed)) parsed.filter((key): key is string => typeof key === 'string').forEach(key => this.favorites.add(key));
    } catch (error) { console.warn('Could not load favorites:', error); }
  }

  async whenReady(): Promise<void> { await this.ready; }
  static key(id: string, type: 'image' | 'video' | 'local'): string { return `${type}:${id}`; }
  async isFavorite(id: string, type: 'image' | 'video' | 'local'): Promise<boolean> { await this.ready; return this.favorites.has(FavoriteService.key(id, type)); }
  isFavoriteSync(id: string, type: 'image' | 'video' | 'local'): boolean { return this.favorites.has(FavoriteService.key(id, type)); }
  getFavoriteKeys(): string[] { return Array.from(this.favorites); }
  getCount(): number { return this.favorites.size; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  async add(id: string, type: 'image' | 'video' | 'local'): Promise<void> { await this.set(id, type, true); }
  async remove(id: string, type: 'image' | 'video' | 'local'): Promise<void> { await this.set(id, type, false); }
  async toggle(id: string, type: 'image' | 'video' | 'local'): Promise<boolean> {
    await this.ready;
    const key = FavoriteService.key(id, type);
    const favorite = !this.favorites.has(key);
    if (favorite) this.favorites.add(key); else this.favorites.delete(key);
    await this.persistAndNotify();
    return favorite;
  }
  private async set(id: string, type: 'image' | 'video' | 'local', favorite: boolean): Promise<void> {
    await this.ready;
    const key = FavoriteService.key(id, type);
    const changed = favorite ? !this.favorites.has(key) : this.favorites.has(key);
    if (!changed) return;
    if (favorite) this.favorites.add(key); else this.favorites.delete(key);
    await this.persistAndNotify();
  }
  private async persistAndNotify(): Promise<void> {
    await Preferences.set({ key: this.storageKey, value: JSON.stringify(Array.from(this.favorites)) });
    this.listeners.forEach(listener => listener());
  }
}
