import { Injectable } from '@angular/core';
import { RxState } from '@rx-angular/state';
import { RxActionFactory } from '@rx-angular/state/actions';
import { Observable, scan, startWith } from 'rxjs';

interface AppState {
  showExample: boolean;
}

interface AppActions {
  toggle: void;
}

@Injectable({
  providedIn: 'root',
})
export class AppService {
  public readonly showExample$: Observable<boolean>;

  private readonly state = new RxState<AppState>();
  private readonly actions = new RxActionFactory<AppActions>().create();

  constructor() {
    this.showExample$ = this.state.select('showExample');

    this.state.connect(
      'showExample',
      this.actions.toggle$.pipe(
        scan((state: boolean) => !state, true),
        startWith(true)
      )
    );
  }

  public toggle(): void {
    this.actions.toggle();
  }
}
