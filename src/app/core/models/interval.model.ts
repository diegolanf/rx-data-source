import { Inject, Injectable, InjectionToken, OnDestroy, Optional } from '@angular/core';
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

/**
 * Interval state.
 */
export interface IntervalState {
  /**
   * Refresh interval in seconds.
   */
  refreshInterval: number;
}

/**
 * Default interval state.
 * - refreshInterval = 60 (seconds)
 */
export const defaultIntervalConfig: IntervalState = {
  refreshInterval: 60,
};

export const INTERVAL_CONFIG = new InjectionToken<IntervalState>('interval.config');

/**
 * Interval actions.
 */
interface IntervalActions {
  /**
   * Refresh action.
   */
  refresh: void;
}

/**
 * Interval class with {@link execute$} observable and {@link refresh} action.
 */
@Injectable()
export class Interval implements OnDestroy {
  /**
   * Combines {@link interval$} observable and {@link refresh$} action.
   * Indicates that an execution should take place.
   */
  public readonly execute$: Observable<void>;

  /**
   * Observable of {@link refresh} action.
   */
  public readonly refresh$: Observable<void>;

  /**
   * Emits every specified interval of time (based on the {@link IntervalState.refreshInterval refresh rate}).
   * Interval resets on {@link refresh$} action emission.
   * @private
   */
  private readonly interval$: Observable<void>;

  private readonly actions = this.factory.create();
  private readonly state = new RxState<IntervalState>();

  constructor(
    @Optional() @Inject(INTERVAL_CONFIG) config: IntervalState | null,
    private readonly factory: RxActionFactory<IntervalActions>
  ) {
    /**
     * Set initial {@link IntervalState state} based on provided or {@link defaultIntervalConfig default} config.
     */
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
   * Update interval's {@link IntervalState.refreshInterval refresh rate}. If set to any number < 0.1, no interval is created.
   * @param refreshInterval Refresh interval in seconds.
   */
  public set refreshInterval(refreshInterval: number) {
    this.state.set({ refreshInterval });
  }

  ngOnDestroy(): void {
    this.state.ngOnDestroy();
  }

  /**
   * Immediately trigger {@link execute$ execution} and reset {@link interval$ interval}.
   */
  public refresh(): void {
    this.actions.refresh();
  }
}
