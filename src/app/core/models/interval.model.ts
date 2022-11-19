import { Inject, Injectable, InjectionToken, Optional } from '@angular/core';
import { isNumber } from '@app/shared/utils/validate.utils';
import { RxState } from '@rx-angular/state';
import { RxActionFactory } from '@rx-angular/state/actions';
import { combineLatest, interval, map, merge, Observable, startWith, switchMap } from 'rxjs';

export interface IntervalState {
  refreshInterval?: number;
}

export const defaultIntervalConfig: IntervalState = {
  refreshInterval: undefined,
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
   * If refresh interval is undefined, no emission takes place.
   */
  private readonly interval$: Observable<void>;

  private readonly actions = new RxActionFactory<IntervalActions>().create();

  constructor(
    @Optional() @Inject(INTERVAL_CONFIG) config: IntervalState | null,
    private state: RxState<IntervalState>
  ) {
    this.state.set(config ?? defaultIntervalConfig);

    this.refresh$ = this.actions.refresh$;

    this.interval$ = combineLatest([
      this.state.select('refreshInterval'),
      this.refresh$.pipe(startWith(undefined)),
    ]).pipe(
      switchMap(([refreshInterval]: [number | undefined, void | undefined]) =>
        // Only accept intervals greater than 1s
        interval(
          isNumber(refreshInterval) && refreshInterval > 0 ? refreshInterval * 1000 : undefined
        )
      ),
      map(() => undefined) // Return void instead of number
    );

    this.execute$ = merge(this.actions.refresh$, this.interval$);
  }

  /**
   * Update interval's refresh rate.
   * @param refreshInterval Refresh interval.
   */
  public set refreshInterval(refreshInterval: number | undefined) {
    this.state.set({ refreshInterval });
  }

  /**
   * Immediately trigger execution and reset interval.
   */
  public refresh(): void {
    this.actions.refresh();
  }
}
