import { Injectable } from '@angular/core';
import { prepare } from '@app/shared/operators/prepare.operator';
import { RxState } from '@rx-angular/state';
import { RxActionFactory } from '@rx-angular/state/actions';
import {
  catchError,
  EMPTY,
  finalize,
  map,
  Observable,
  startWith,
  switchMap,
  takeUntil,
  withLatestFrom,
} from 'rxjs';

import { Interval } from './interval.model';

export interface DataSourceState<T> {
  data: T | null;
  dataSource: Observable<T>;
  error: boolean;
  initialState: boolean;
  loading: boolean;
  resetting: boolean;
}

// eslint-disable-next-line  @typescript-eslint/no-explicit-any
const initDataSourceState: Partial<DataSourceState<any>> = {
  loading: false,
  error: false,
  initialState: true,
};

interface DataSourceActions {
  clearData: void;
  reset: void;
  resetAndRefresh: void;
}

@Injectable()
export class DataSource<T> {
  public readonly data$: Observable<T | null> = this.state.select('data');
  public readonly error$: Observable<boolean> = this.state.select('error');
  public readonly initialState$: Observable<boolean> = this.state.select('initialState');
  public readonly loading$: Observable<boolean> = this.state.select('loading');

  public readonly afterFirstLoading$: Observable<boolean>;
  public readonly firstLoading$: Observable<boolean>;

  public readonly clearData$: Observable<void>;
  public readonly reset$: Observable<void>;
  public readonly resetAndRefresh$: Observable<void>;

  private readonly actions = new RxActionFactory<DataSourceActions>().create();
  private readonly dataSource$: Observable<T>;

  constructor(private interval: Interval, private state: RxState<DataSourceState<T>>) {
    this.state.set(initDataSourceState);

    this.clearData$ = this.actions.clearData$;
    this.reset$ = this.actions.reset$;
    this.resetAndRefresh$ = this.actions.resetAndRefresh$;

    this.afterFirstLoading$ = this.loading$.pipe(
      withLatestFrom(this.initialState$),
      map(([loading, initialState]: [boolean, boolean]) => loading && !initialState)
    );

    this.firstLoading$ = this.loading$.pipe(
      withLatestFrom(this.initialState$),
      map(([loading, initialState]: [boolean, boolean]) => loading && initialState)
    );

    // Add operators to data source
    this.dataSource$ = this.state.select('dataSource').pipe(
      switchMap((dataSource: Observable<T>) =>
        dataSource.pipe(
          prepare(() => this.state.set({ loading: true })),
          takeUntil(this.interval.execute$), // Stop if new execution takes place
          catchError(() => {
            this.state.set({ error: true });
            if (this.state.get('initialState')) this.state.set({ initialState: false });
            return EMPTY;
          }),
          map((response: T) => {
            if (this.state.get('error')) this.state.set({ error: false });
            if (this.state.get('initialState')) this.state.set({ initialState: false });
            return response;
          }),
          finalize(() => {
            this.state.set({ loading: false });
          })
        )
      )
    );

    // Connect data state with datasource and run every time internal interval's execute observable is emitted
    this.state.connect(
      'data',
      this.interval.execute$.pipe(
        startWith(undefined),
        switchMap(() => this.dataSource$)
      )
    );

    // Define effects of clear data action
    this.state.hold(this.clearData$, () => {
      this.state.set({ data: null });
    });

    // Define effects of reset action
    this.state.hold(this.reset$, () => {
      this.state.set({ data: null, initialState: true });
    });

    // Define effects of reset and refresh action
    this.state.hold(this.resetAndRefresh$, () => {
      this.actions.reset();
      this.interval.refresh();
    });
  }

  /**
   * Update refresh rate of internal interval.
   *
   * @param refreshInterval Refresh interval.
   */
  public set refreshInterval(refreshInterval: number | undefined) {
    this.interval.refreshInterval = refreshInterval;
  }

  /**
   * Update data source observable.
   *
   * @param dataSource Data source.
   */
  public set source(dataSource: Observable<T>) {
    this.state.set({ dataSource });
  }

  /**
   * Connect data source observable.
   *
   * @param sourceObservable Source observable.
   */
  public connectSource(sourceObservable: Observable<Observable<T>>): void {
    this.state.connect('dataSource', sourceObservable);
  }

  /**
   * Clears data.
   */
  public clearData(): void {
    this.actions.clearData();
  }

  /**
   * Reset data source to its initial state.
   */
  public reset(): void {
    this.actions.reset();
  }

  /**
   * Reset data source to its initial state and refresh.
   */
  public resetAndRefresh(): void {
    this.actions.resetAndRefresh();
  }

  /**
   * Refresh internal interval.
   */
  public refresh(): void {
    this.interval.refresh();
  }
}
