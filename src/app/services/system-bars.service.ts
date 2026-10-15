import { Injectable } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';

interface SystemBarsPlugin {
  setHidden(options: { hidden: boolean }): Promise<void>;
}

const SystemBars = registerPlugin<SystemBarsPlugin>('SystemBars');

@Injectable({ providedIn: 'root' })
export class SystemBarsService {
  private hidden = false;

  get isHidden(): boolean {
    return this.hidden;
  }

  async setHidden(hidden: boolean): Promise<void> {
    if (Capacitor.getPlatform() !== 'android' || this.hidden === hidden) return;
    const previous = this.hidden;
    this.hidden = hidden;
    try {
      await SystemBars.setHidden({ hidden });
    } catch (error) {
      this.hidden = previous;
      console.warn('Unable to update Android navigation bar visibility:', error);
    }
  }

  async toggle(): Promise<void> {
    await this.setHidden(!this.hidden);
  }
}
