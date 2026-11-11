import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { PbToastHost } from './shared/ui/toast/toast-host';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, PbToastHost],
  template: '<router-outlet /><pb-toast-host />',
  styles: ':host { display: block; height: 100%; }',
})
export class App {}
