import { HttpParams } from '@angular/common/http';
import { Inject, Injectable, InjectionToken, Optional } from '@angular/core';
import { isNumber } from '@app/shared/utils/validate.utils';
import { RxState } from '@rx-angular/state';
import { RxActionFactory } from '@rx-angular/state/actions';
import {
  asyncScheduler,
  combineLatest,
  distinctUntilChanged,
  map,
  merge,
  Observable,
  scan,
  skip,
  startWith,
  switchMap,
  withLatestFrom,
} from 'rxjs';

import { DataSource } from './data-source.model';
import { PaginationParams, PaginationStrategy, Sort } from './table-config.model';

/**
 * Table data source configuration.
 */
export interface TableDataSourceConfig {
  /**
   * Row limit per page.
   */
  limit: number | boolean;

  /**
   * Current page.
   */
  page: number;

  /**
   * Pagination strategy.
   * - scroll
   * - paginate
   * - none
   */
  paginationStrategy: PaginationStrategy;

  /**
   * Sort column and direction.
   */
  sort: Sort | null;
}

export const TABLE_DATA_SOURCE_CONFIG = new InjectionToken<Partial<TableDataSourceConfig>>(
  'table-data-source.config'
);

/**
 * Default table data source configuration.
 * - limit = false
 * - paginationStrategy = none
 */
export const defaultTableDataSourceConfig: Partial<TableDataSourceConfig> = {
  limit: false,
  paginationStrategy: PaginationStrategy.none,
};

/**
 * Table data source state.
 */
interface TableDataSourceState<T> extends TableDataSourceConfig {
  /**
   * Rows received from {@link dataSource$} observable.
   */
  rows: T[];
}

/**
 * Table data source actions.
 */
interface TableDataSourceActions<T> {
  /**
   * Jump to page action.
   */
  jumpToPage: number;

  /**
   * Next page action.
   */
  nextPage: void;

  /**
   * Previous page action.
   */
  previousPage: void;

  /**
   * Reset action:
   * - Sets {@link rows$} to an empty array.
   */
  reset: void;

  /**
   * Scroll action.
   */
  scroll: void;

  /**
   * Set data source action.
   */
  setDataSource: (params: HttpParams) => Observable<T[]>;
}

/**
 * Table data source class which exposes responses from a {@link dataSource$ source} observable in a {@link rows$} stream.
 * Composed of internal {@link DataSource dataSource} and {@link Interval interval} classes.
 */
@Injectable()
export class TableDataSource<T> {
  /**
   * Returns true if table's {@link rows$ rows} length is 0.
   */
  public readonly empty$: Observable<boolean>;

  /**
   * Observable of {@link TableDataSourceState.limit limit state}.
   */
  public readonly limit$: Observable<number | boolean> = this.state.select('limit');

  /**
   * Observable of {@link TableDataSourceState.page page state}.
   */
  public readonly page$: Observable<number> = this.state.select('page');

  /**
   * Observable of {@link TableDataSourceState.rows rows state}.
   */
  public readonly rows$: Observable<T[]> = this.state.select('rows');

  /**
   * Observable of {@link TableDataSourceState.sort sort state}.
   */
  public readonly sort$: Observable<Sort | null> = this.state.select('sort');

  /**
   * Observable of {@link TableDataSourceState.paginationStrategy pagination strategy state}.
   */
  public readonly paginationStrategy$: Observable<PaginationStrategy> =
    this.state.select('paginationStrategy');

  /**
   * True if {@link paginationStrategy pagination strategy} is 'none'.
   */
  public readonly noPaginationStrategy$: Observable<boolean>;

  /**
   * True if {@link paginationStrategy pagination strategy} is 'paginate'.
   */
  public readonly paginateStrategy$: Observable<boolean>;

  /**
   * True if {@link paginationStrategy pagination strategy} is 'scroll'.
   */
  public readonly scrollStrategy$: Observable<boolean>;

  /**
   * Skip and take {@link PaginationParams parameters} for pagination.
   */
  public readonly paginationParams$: Observable<PaginationParams | undefined>;

  /**
   * Data source observable containing {@link paginationParams$ pagination} and {@link sort$ sort} {@link HttpParams parameters}.
   * Observable is connected to internal {@link DataSourceState.dataSource dataSource's source} during initialisation.
   */
  public readonly dataSource$: Observable<Observable<T[]>>;

  /**
   * Fallback {@link limit$ limit} for paginate and scroll {@link paginationStrategy$ strategies} if none is already defined.
   * @private
   */
  private readonly fallbackLimit: number = 10;

  private readonly actions = this.factory.create();

  constructor(
    @Optional() @Inject(TABLE_DATA_SOURCE_CONFIG) config: Partial<TableDataSourceConfig> | null,
    private dataSource: DataSource<T[]>,
    private factory: RxActionFactory<TableDataSourceActions<T>>,
    private state: RxState<TableDataSourceState<T>>
  ) {
    /**
     * Set initial {@link TableDataSourceState state} based on provided or {@link defaultTableDataSourceConfig default} config.
     */
    this.state.set({
      limit: config?.limit ?? defaultTableDataSourceConfig.limit,
      paginationStrategy:
        config?.paginationStrategy ?? defaultTableDataSourceConfig.paginationStrategy,
      sort: config?.sort,
    });

    this.empty$ = this.rows$.pipe(map((rows: T[]) => rows.length === 0));

    this.noPaginationStrategy$ = this.paginationStrategy$.pipe(
      map((strategy: PaginationStrategy) => strategy === PaginationStrategy.none)
    );

    this.paginateStrategy$ = this.paginationStrategy$.pipe(
      map((strategy: PaginationStrategy) => strategy === PaginationStrategy.paginate)
    );

    this.scrollStrategy$ = this.paginationStrategy$.pipe(
      map((strategy: PaginationStrategy) => strategy === PaginationStrategy.scroll)
    );

    /**
     * Combine {@link limit$ }, {@link page$ } and {@link paginationStrategy$ }
     * into a single observable of {@link PaginationParams}.
     * @see paginationParams$
     */
    this.paginationParams$ = combineLatest([
      this.limit$,
      this.page$,
      this.paginationStrategy$,
    ]).pipe(
      map(([limit, page, paginationStrategy]: [number | boolean, number, PaginationStrategy]) => {
        const take =
          limit === true ||
          (!isNumber(limit) &&
            (paginationStrategy === PaginationStrategy.paginate ||
              paginationStrategy === PaginationStrategy.scroll))
            ? this.fallbackLimit
            : limit;
        return isNumber(take)
          ? {
              skip: (page - 1) * take,
              take,
            }
          : undefined;
      }),
      distinctUntilChanged(
        (a: PaginationParams | undefined, b: PaginationParams | undefined) =>
          a?.take === b?.take && a?.skip === b?.skip
      )
    );

    /**
     * Combines source from {@link source set source action}
     * with {@link paginationParams$ pagination} and {@link sort$ sort} {@link HttpParams parameters}.
     * @see dataSource$.
     */
    this.dataSource$ = combineLatest([
      this.actions.setDataSource$,
      this.paginationParams$,
      this.sort$.pipe(startWith(null)),
    ]).pipe(
      map(
        ([dataSource, paginationParams, sort]: [
          (params: HttpParams) => Observable<T[]>,
          PaginationParams | undefined,
          Sort | null
        ]) => {
          let params = new HttpParams();
          if (paginationParams !== undefined)
            params = params.set('skip', paginationParams.skip).set('take', paginationParams.take);
          if (sort !== null) {
            params = params.set('sortBy', sort.column).set('sortDirection', sort.direction);
          }
          return dataSource(params);
        }
      )
    );

    /**
     * Connect {@link TableDataSourceState.page page state} to {@link jumpToPage}, {@link nextPage} and {@link previousPage} actions.
     * - On jumpToPage, resets scan operator and uses emitted value as seed.
     * - On nextPage, adds 1 to currentPage accumulator.
     * - On previousPage, subtracts 1 from currentPage accumulator.
     */
    this.state.connect(
      'page',
      this.actions.jumpToPage$.pipe(
        startWith(config?.page ?? 1),
        switchMap((jumpToPage: number) =>
          merge(
            this.actions.nextPage$.pipe(
              map(() => 1),
              startWith(0)
            ),
            this.actions.previousPage$.pipe(
              map(() => -1),
              startWith(0)
            )
          ).pipe(
            scan(
              (currentPage: number, change: number) => {
                const newPage = currentPage + change;
                return newPage <= 0 ? currentPage : newPage;
                // Jump to page must be at least 1
              },
              jumpToPage >= 1 ? jumpToPage : 1
            )
          )
        )
      )
    );

    /**
     * Connect {@link DataSourceState.dataSource dataSource's source} with {@link dataSource$} observable.
     */
    this.dataSource.connectSource(this.dataSource$);

    /**
     * Connect {@link TableDataSourceState.rows rows state} with {@link DataSource.data$ dataSource's data$}.
     * - Set back to empty array on {@link reset} action.
     * - Appends new {@link DataSource.data$ data$} to the {@link rows$ rows} array if {@link paginationStrategy$} is set to scroll,
     * otherwise replaces it.
     */
    this.state.connect(
      'rows',
      this.actions.reset$.pipe(
        map(() => []),
        startWith([]),
        switchMap((reset: never[]) =>
          this.dataSource.data$.pipe(
            withLatestFrom(this.scrollStrategy$),
            scan(
              (currentRows: T[], [newRows, scrollStrategy]: [T[] | null, boolean]) =>
                scrollStrategy
                  ? newRows
                    ? [...currentRows, ...newRows]
                    : currentRows
                  : newRows ?? [],
              reset
            )
          )
        )
      )
    );

    /**
     * Trigger {@link reset} whenever {@link paginationStrategy$} changes after its initial value.
     */
    this.state.hold(this.paginationStrategy$.pipe(skip(1)), () => this.refresh(false));
  }

  /**
   * Current value of {@link TableDataSourceState.paginationStrategy pagination strategy state}.
   * @private
   */
  private get paginateStrategy(): boolean {
    return this.state.get('paginationStrategy') === PaginationStrategy.paginate;
  }

  /**
   * Updates source of {@link dataSource$}.
   *
   * @param dataSource
   */
  public set source(dataSource: (params: HttpParams) => Observable<T[]>) {
    this.actions.setDataSource(dataSource);
  }

  /**
   * Update page's row {@link limit$ limit}.
   *
   * @param limit
   */
  public set limit(limit: number | boolean) {
    this.state.set({ limit });
  }

  /**
   * Update {@link paginationStrategy$ pagination strategy}.
   *
   * @param paginationStrategy
   */
  public set paginationStrategy(paginationStrategy: PaginationStrategy) {
    // Clear data when switching from strategy none to scroll
    if (
      this.state.get('paginationStrategy') === PaginationStrategy.none &&
      paginationStrategy === PaginationStrategy.scroll &&
      this.state.get('limit') === false
    )
      this.dataSource.reset();

    this.state.set({ paginationStrategy });
  }

  /**
   * Update {@link sort$ sort} column and direction.
   *
   * @param sort
   */
  public set sort(sort: Sort | null) {
    this.state.set({ sort });
  }

  /**
   * Load next set of {@link rows$ rows} and concatenate it to the existing ones.
   */
  public scroll(): void {
    if (this.state.get('paginationStrategy') === PaginationStrategy.scroll) this.actions.nextPage();
  }

  /**
   * Load next {@link page$ page}.
   */
  public nextPage(): void {
    if (this.paginateStrategy) this.actions.nextPage();
  }

  /**
   * Load previous {@link page$ page}.
   */
  public previousPage(): void {
    if (this.paginateStrategy) this.actions.previousPage();
  }

  /**
   * Jump to specified {@link page$ page}.
   *
   * @param page
   */
  public jumpToPage(page: number): void {
    if (this.paginateStrategy) this.actions.jumpToPage(page);
  }

  /**
   * Refresh table:
   * - If {@link page$ page} !== 1, {@link jumpToPage jump to page}  1 (which will trigger a refresh)
   * and call internal {@link DataSource.clearData data source clear data}.
   * - Else if {@link page$ page} === 1 and forceRefresh === true (default = true),
   * call internal {@link DataSource.refresh data source refresh}.
   * - Always: Call {@link TableDataSourceActions.reset reset} action.
   *
   * @param forceRefresh
   */
  public refresh(forceRefresh: boolean = true): void {
    if (this.state.get('page') !== 1) {
      // Only clearData as jump to page will trigger a refresh
      this.dataSource.clearData();
      this.actions.jumpToPage(1);
    } else if (forceRefresh) {
      this.dataSource.refresh();
    }

    // Ensure accumulator reset occurs after dataSource.
    asyncScheduler.schedule(() => this.actions.reset());
  }

  /**
   * Reset table:
   * - If {@link page$ page} !== 1, {@link jumpToPage jump to page}  1 (which will trigger a refresh)
   * and call internal {@link DataSource.reset data source reset}.
   * - If {@link page$ page} === 1, call internal {@link DataSource.resetAndRefresh data source reset and refresh}.
   * - Always: Call {@link TableDataSourceActions.reset reset} action.
   */
  public reset(): void {
    if (this.state.get('page') !== 1) {
      // Only reset, jump to page will trigger a refresh
      this.dataSource.reset();
      this.actions.jumpToPage(1);
    } else {
      this.dataSource.resetAndRefresh();
    }

    // Ensure accumulator reset occurs after dataSource.
    asyncScheduler.schedule(() => this.actions.reset());
  }
}
