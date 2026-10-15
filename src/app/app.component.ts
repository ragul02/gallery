import { Component } from '@angular/core';
import { SystemBarsService } from './services/system-bars.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false
})
export class AppComponent {
  constructor(private systemBars: SystemBarsService) {
    void this.systemBars.setHidden(true);
  }

  onAppTap(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('button, a, ion-button, ion-fab, input, select, textarea, video, ion-alert, ion-action-sheet, ion-modal, [data-keep-system-bars]')) return;
    void this.systemBars.toggle();
  }
}
