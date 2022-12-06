import { Injectable } from '@angular/core';
import { indicate } from '@app/shared/operators/indicate.operator';
import { RxState } from '@rx-angular/state';
import { RxActionFactory } from '@rx-angular/state/actions';
import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  map,
  Observable,
  startWith,
  switchMap,
  takeUntil,
  withLatestFrom,
} from 'rxjs';

import { Interval } from './interval.model';

/**
 * Data source state.
 */
export interface DataSourceState<T> {
  /**
   * Data received from {@link dataSource}.
   */
  data: T | null;

  /**
   * Source, as observable, for the {@link data}.
   */
  dataSource: Observable<T>;

  /**
   * Indicates error state.
   * - Set as true if {@link dataSource} observable throws an error.
   */
  error: boolean;

  /**
   * Indicates initial state.
   * - Set as false after first {@link dataSource} emission, and true again on reset.
   */
  initialState: boolean;

  /**
   * Indicates loading state.
   * - Set as true while {@link dataSource} is active.
   */
  loading: boolean;
}

/**
 * Initial data source state.
 * - loading = false
 * - error = false
 * - initialState = true
 */
// eslint-disable-next-line  @typescript-eslint/no-explicit-any
const initDataSourceState: Partial<DataSourceState<any>> = {
  loading: false,
  error: false,
  initialState: true,
};

/**
 * Reset data source state.
 * - data = null
 * - initialState = true
 */
// eslint-disable-next-line  @typescript-eslint/no-explicit-any
const resetDataSourceState: Partial<DataSourceState<any>> = {
  data: null,
  initialState: true,
};

/**
 * Data source actions.
 * @remark Refresh is not required as it's already part of the interval actions.
 */
interface DataSourceActions {
  /**
   * Clear data action.
   */
  clearData: void;

  /**
   * Reset action.
   */
  reset: void;

  /**
   * Reset and refresh action.
   */
  resetAndRefresh: void;
}

/**
 * Data source class which exposes responses from a {@link dataSource$ source} observable in a {@link data$} stream.
 * Composed of an internal {@link Interval interval} and reset {@link DataSourceActions actions}.
 */
@Injectable()
export class DataSource<T> {
  /**
   * Observable of {@link DataSourceState.data data state}.
   */
  public readonly data$: Observable<T | null> = this.state.select('data');

  /**
   * Observable of {@link DataSourceState.error error state}.
   */
  public readonly error$: Observable<boolean> = this.state.select('error');

  /**
   * Observable of {@link DataSourceState.initialState initial state}.
   */
  public readonly initialState$: Observable<boolean> = this.state.select('initialState');

  /**
   * Observable of {@link DataSourceState.loading loading state}.
   * Emits true every time {@link dataSource$} observable is active.
   * @see afterFirstLoading$
   * @see firstLoading$
   */
  public readonly loading$: Observable<boolean> = this.state.select('loading');

  /**
   * Emits true when {@link dataSource$} observable is active,
   * but only if {@link DataSourceState.initialState initial state} is false,
   * i.e. after first successful dataSource$ emission .
   * @see loading$
   */
  public readonly afterFirstLoading$: Observable<boolean>;

  /**
   * Emits true when {@link dataSource$} observable is active,
   * but only if {@link DataSourceState.initialState initial state} is true,
   * i.e. before first successful dataSource$ emission or after {@link reset} action.
   * @see loading$
   */
  public readonly firstLoading$: Observable<boolean>;

  /**
   * Observable of {@link clearData} action.
   */
  public readonly clearData$: Observable<void>;

  /**
   * Observable of {@link reset} action.
   */
  public readonly reset$: Observable<void>;

  /**
   * Observable of {@link resetAndRefresh} action.
   */
  public readonly resetAndRefresh$: Observable<void>;

  /**
   * Observable of {@link DataSourceState.dataSource dataSource state},
   * including the following operations:
   * - Sets {@link DataSourceState.loading loading state} to true while active.
   * - Sets {@link DataSourceState.initialState initial state} to false after first successful completion.
   * - Sets {@link DataSourceState.error error state} to true if source throws error.
   * - Is interrupted by internal {@link Interval interval} execute emissions.
   * @private
   */
  private readonly dataSource$: Observable<T>;

  private readonly actions = this.factory.create();

  constructor(
    private readonly factory: RxActionFactory<DataSourceActions>,
    private readonly interval: Interval,
    private readonly state: RxState<DataSourceState<T>>
  ) {
    /**
     * Set {@link initDataSourceState initial state}.
     */
    this.state.set(initDataSourceState);

    this.clearData$ = this.actions.clearData$;
    this.reset$ = this.actions.reset$;
    this.resetAndRefresh$ = this.actions.resetAndRefresh$;

    this.afterFirstLoading$ = this.loading$.pipe(
      withLatestFrom(this.initialState$),
      map(([loading, initialState]: [boolean, boolean]) => loading && !initialState),
      distinctUntilChanged()
    );

    this.firstLoading$ = this.loading$.pipe(
      withLatestFrom(this.initialState$),
      map(([loading, initialState]: [boolean, boolean]) => loading && initialState),
      distinctUntilChanged()
    );

    /**
     * Add operators to {@link DataSourceState.dataSource dataSource state}.
     * @see dataSource$
     */
    this.dataSource$ = this.state.select('dataSource').pipe(
      switchMap((dataSource: Observable<T>) =>
        dataSource.pipe(
          indicate(this.state), // Set loading in state to true while dataSource is active
          takeUntil(this.interval.execute$), // Stop if new execution takes place
          catchError(() => {
            this.state.set({ error: true, initialState: false });
            return EMPTY;
          }),
          map((response: T) => {
            this.state.set({ error: false, initialState: false });
            return response;
          })
        )
      )
    );

    /**
     * Connect {@link DataSourceState.data data state} with {@link dataSource$}.
     * @see data$
     */
    this.state.connect(
      'data',
      this.interval.execute$.pipe(
        startWith(undefined),
        switchMap(() => this.dataSource$)
      )
    );

    /**
     * Define effects of {@link clearData$} action.
     * @see clearData
     */
    this.state.hold(this.clearData$, () => {
      this.state.set({ data: null });
    });

    /**
     * Define effects of {@link reset$} action.
     * @see reset
     */
    this.state.hold(this.reset$, () => {
      this.state.set(resetDataSourceState);
    });

    /**
     * Define effects of {@link resetAndRefresh$} action.
     * @see resetAndRefresh
     */
    this.state.hold(this.resetAndRefresh$, () => {
      this.actions.reset();
      this.interval.refresh();
    });
  }

  /**
   * Update refresh rate of internal {@link interval}.
   *
   * @param refreshInterval Refresh interval.
   */
  public set refreshInterval(refreshInterval: number) {
    this.interval.refreshInterval = refreshInterval;
  }

  /**
   * Update {@link dataSource$} observable.
   *
   * @param dataSource Data source.
   */
  public set source(dataSource: Observable<T>) {
    this.state.set({ dataSource });
  }

  /**
   * Connect {@link dataSource$} observable.
   *
   * @param sourceObservable Source observable.
   */
  public connectSource(sourceObservable: Observable<Observable<T>>): void {
    this.state.connect('dataSource', sourceObservable);
  }

  /**
   * Reset {@link DataSourceState.data data} to null.
   */
  public clearData(): void {
    this.actions.clearData();
  }

  /**
   * Reset data source to its {@link resetDataSourceState reset state}.
   */
  public reset(): void {
    this.actions.reset();
  }

  /**
   * Reset data source to its {@link resetDataSourceState reset state} and {@link refresh}.
   */
  public resetAndRefresh(): void {
    this.actions.resetAndRefresh();
  }

  /**
   * Refresh internal {@link Interval interval}.
   */
  public refresh(): void {
    this.interval.refresh();
  }
}
