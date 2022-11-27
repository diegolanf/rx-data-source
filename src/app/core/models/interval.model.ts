import { Inject, Injectable, InjectionToken, Optional } from '@angular/core';
import { RxState } from '@rx-angular/state';
import { RxActionFactory } from '@rx-angular/state/actions';
import {
  combineLatest,
  EMPTY,
  interval,
  map,
  merge,
  Observable,
  share,
  startWith,
  switchMap,
} from 'rxjs';

export interface IntervalState {
  /**
   * Refresh interval in seconds.
   */
  refreshInterval: number;
}

export const defaultIntervalConfig: IntervalState = {
  refreshInterval: 60,
};

export const INTERVAL_CONFIG = new InjectionToken<IntervalState>('interval.config');

interface IntervalActions {
  refresh: void;
}

@Injectable()
export class Interval {
  /**
   * Combines interval and refresh action and indicates that an execution should take place.
   */
  public readonly execute$: Observable<void>;

  /**
   * Observable of refresh action.
   */
  public readonly refresh$: Observable<void>;

  /**
   * Emits every specified interval of time (based on refresh interval).
   * Interval resets on refresh action emission.
   */
  private readonly interval$: Observable<void>;

  private readonly actions = this.factory.create();

  constructor(
    @Optional() @Inject(INTERVAL_CONFIG) config: IntervalState | null,
    private factory: RxActionFactory<IntervalActions>,
    private state: RxState<IntervalState>
  ) {
    this.state.set(config ?? defaultIntervalConfig);

    this.refresh$ = this.actions.refresh$;

    this.interval$ = combineLatest([
      this.state.select('refreshInterval'),
      this.refresh$.pipe(startWith(undefined)),
    ]).pipe(
      switchMap(([refreshInterval]: [number, void | undefined]) =>
        // Create interval only if refresh rate is greater or equal than 0.1 s
        refreshInterval > 0.1 ? interval(refreshInterval * 1000) : EMPTY
      ),
      map(() => undefined) // Return void instead of number
    );

    this.execute$ = merge(this.actions.refresh$, this.interval$).pipe(share());
  }

  /**
   * Update interval's refresh rate. If set to any number < 0.1, no interval is created.
   * @param refreshInterval Refresh interval in seconds.
   */
  public set refreshInterval(refreshInterval: number) {
    this.state.set({ refreshInterval });
  }

  /**
   * Immediately trigger execution and reset interval.
   */
  public refresh(): void {
    this.actions.refresh();
  }
}
