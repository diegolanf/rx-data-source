import { HttpParams } from '@angular/common/http';
import { Inject, Injectable, InjectionToken, OnDestroy, Optional } from '@angular/core';
import { isNumber } from '@app/shared/utils/validate.utils';
import { RxState } from '@rx-angular/state';
import { RxActionFactory } from '@rx-angular/state/actions';
import {
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  merge,
  Observable,
  scan,
  startWith,
  switchMap,
  withLatestFrom,
} from 'rxjs';

import { DataSource } from './data-source.model';
import { PaginationParams, PaginationStrategy, Sort } from './table-config.model';

/**
 * Pagination state.
 */
export interface PaginationState {
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

export const TABLE_DATA_SOURCE_CONFIG = new InjectionToken<Partial<PaginationState>>(
  'table-data-source.config'
);

/**
 * Default table data source configuration.
 * - limit = false
 * - paginationStrategy = none
 */
export const defaultTableDataSourceConfig: Partial<PaginationState> = {
  limit: false,
  paginationStrategy: PaginationStrategy.none,
};

/**
 * Table data source state.
 */
interface TableDataSourceState<T> {
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
   * Scroll action.
   */
  scroll: void;

  /**
   * Clear rows action.
   */
  clearRows: void;

  /**
   * Refresh action.
   */
  refresh: void;

  /**
   * Reset action.
   */
  reset: void;

  /**
   * Set data source action.
   */
  setDataSource: (params: HttpParams) => Observable<T[]>;

  /**
   * Set pagination strategy action.
   */
  setPaginationStrategy: PaginationStrategy;

  /**
   * Set sort action.
   */
  setSort: Sort | null;
}

/**
 * Table data source class which exposes responses from a {@link dataSource$ source} observable in a {@link rows$} stream.
 * Composed of internal {@link DataSource dataSource} and {@link Interval interval} classes.
 */
@Injectable()
export class TableDataSource<T> implements OnDestroy {
  /**
   * Observable of {@link PaginationState.rows rows state}.
   */
  public readonly rows$: Observable<T[]>;

  /**
   * Returns true if table's {@link rows$ rows} length is 0.
   */
  public readonly empty$: Observable<boolean>;

  /**
   * Observable of {@link PaginationState pagination state}.
   */
  public readonly paginationState$: Observable<PaginationState>;

  /**
   * Observable of {@link PaginationState.limit limit state}.
   */
  public readonly limit$: Observable<number | boolean>;

  /**
   * Observable of {@link PaginationState.page page state}.
   */
  public readonly page$: Observable<number>;

  /**
   * Observable of {@link PaginationState.sort sort state}.
   */
  public readonly sort$: Observable<Sort | null>;

  /**
   * Observable of {@link PaginationState.paginationStrategy pagination strategy state}.
   */
  public readonly paginationStrategy$: Observable<PaginationStrategy>;

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
   * Skip, take and sort parameters for pagination.
   */
  public readonly paginationParams$: Observable<PaginationParams>;

  /**
   * Data source observable containing {@link paginationParams$ pagination parameters}.
   * Observable is connected to internal {@link DataSourceState.dataSource dataSource's source} during initialisation.
   */
  public readonly dataSource$: Observable<Observable<T[]>>;

  /**
   * Observable of {@link nextPage} action.
   * Emits only if {@link paginationStrategy$ pagination strategy} is 'paginate'.
   */
  public readonly nextPage$: Observable<void>;

  /**
   * Observable of {@link previousPage} action.
   * Emits only if {@link paginationStrategy$ pagination strategy} is 'paginate'.
   */
  public readonly previousPage$: Observable<void>;

  /**
   * Observable of {@link jumpToPage} action.
   * Unlike {@link nextPage$ next page} and {@link previousPage$ previous page}, jump to page can be
   * automatically triggered during {@link refresh} and {@link reset} actions, regardless of the current
   * {@link paginationStrategy$ pagination strategy}.
   */
  public readonly jumpToPage$: Observable<number>;

  /**
   * Observable of {@link scroll} action.
   * Emits only if {@link paginationStrategy$ pagination strategy} is 'scroll'.
   */
  public readonly scroll$: Observable<void>;

  /**
   * Observable of {@link refresh} action.
   */
  public readonly refresh$: Observable<void>;

  /**
   * Observable of {@link reset} action.
   */
  public readonly reset$: Observable<void>;

  /**
   * Fallback {@link limit$ limit} for paginate and scroll {@link paginationStrategy$ strategies} if none is already defined.
   * @private
   */
  private readonly fallbackLimit: number = 10;

  private readonly factory = new RxActionFactory<TableDataSourceActions<T>>();
  private readonly paginationState = new RxState<PaginationState>();
  private readonly state = new RxState<TableDataSourceState<T>>();

  private readonly actions = this.factory.create();

  constructor(
    @Optional() @Inject(TABLE_DATA_SOURCE_CONFIG) config: Partial<PaginationState> | null,
    public readonly dataSource: DataSource<T[]>
  ) {
    /**
     * Set initial {@link PaginationState pagination state} based on provided or {@link defaultTableDataSourceConfig default} config.
     */
    this.paginationState.set({
      limit: config?.limit ?? defaultTableDataSourceConfig.limit,
      paginationStrategy:
        config?.paginationStrategy ?? defaultTableDataSourceConfig.paginationStrategy,
      sort: config?.sort,
    });

    this.rows$ = this.state.select('rows');
    this.empty$ = this.rows$.pipe(
      map((rows: T[]) => rows.length === 0),
      distinctUntilChanged()
    );

    this.paginationState$ = this.paginationState.select();
    this.limit$ = this.paginationState.select('limit');
    this.page$ = this.paginationState.select('page');
    this.sort$ = this.paginationState.select('sort');
    this.paginationStrategy$ = this.paginationState.select('paginationStrategy');

    this.noPaginationStrategy$ = this.paginationStrategy$.pipe(
      map((strategy: PaginationStrategy) => strategy === PaginationStrategy.none),
      distinctUntilChanged()
    );

    this.paginateStrategy$ = this.paginationStrategy$.pipe(
      map((strategy: PaginationStrategy) => strategy === PaginationStrategy.paginate),
      distinctUntilChanged()
    );

    this.scrollStrategy$ = this.paginationStrategy$.pipe(
      map((strategy: PaginationStrategy) => strategy === PaginationStrategy.scroll),
      distinctUntilChanged()
    );

    this.nextPage$ = this.actions.nextPage$.pipe(
      withLatestFrom(this.paginateStrategy$),
      filter(([_, paginateStrategy]: [void, boolean]) => paginateStrategy),
      map(() => undefined)
    );

    this.previousPage$ = this.actions.previousPage$.pipe(
      withLatestFrom(this.paginateStrategy$),
      filter(([_, paginateStrategy]: [void, boolean]) => paginateStrategy),
      map(() => undefined)
    );

    this.jumpToPage$ = this.actions.jumpToPage$;

    this.scroll$ = this.actions.scroll$.pipe(
      withLatestFrom(this.scrollStrategy$),
      filter(([_, scrollStrategy]: [void, boolean]) => scrollStrategy),
      map(() => undefined)
    );

    this.refresh$ = this.actions.refresh$;
    this.reset$ = this.actions.reset$;

    /**
     * Map {@link paginationState$} into {@link paginationParams$}.
     */
    this.paginationParams$ = this.paginationState$.pipe(
      map((paginationState: PaginationState) => {
        const take =
          paginationState.limit === true ||
          (!isNumber(paginationState.limit) &&
            (paginationState.paginationStrategy === PaginationStrategy.paginate ||
              paginationState.paginationStrategy === PaginationStrategy.scroll))
            ? this.fallbackLimit
            : paginationState.limit;
        return {
          pagination: isNumber(take)
            ? {
                skip: (paginationState.page - 1) * take,
                take,
              }
            : undefined,
          sort: paginationState.sort,
        };
      }),
      distinctUntilChanged(
        (a: PaginationParams, b: PaginationParams) =>
          a.pagination?.take === b.pagination?.take &&
          a.pagination?.skip === b.pagination?.skip &&
          a.sort?.column === b.sort?.column &&
          a.sort?.direction === b.sort?.direction
      )
    );

    /**
     * Combines source from {@link source set source action}
     * with {@link paginationParams$ pagination parameters}.
     * @see dataSource$.
     */
    this.dataSource$ = combineLatest([this.actions.setDataSource$, this.paginationParams$]).pipe(
      map(
        ([dataSource, paginationParams]: [
          (params: HttpParams) => Observable<T[]>,
          PaginationParams
        ]) => {
          let params = new HttpParams();
          if (paginationParams.pagination)
            params = params
              .set('skip', paginationParams.pagination.skip)
              .set('take', paginationParams.pagination.take);
          if (paginationParams.sort) {
            params = params
              .set('sortBy', paginationParams.sort.column)
              .set('sortDirection', paginationParams.sort.direction);
          }
          return dataSource(params);
        }
      )
    );

    /**
     * Connect {@link DataSourceState.dataSource dataSource's source} with {@link dataSource$} observable.
     */
    this.dataSource.connectSource(this.dataSource$);

    /**
     * Connect {@link PaginationState.page page state} to {@link jumpToPage}, {@link nextPage} and {@link previousPage} actions.
     * - On jumpToPage, resets scan operator and uses emitted value as seed.
     * - On nextPage, adds 1 to currentPage accumulator.
     * - On previousPage, subtracts 1 from currentPage accumulator.
     */
    this.paginationState.connect(
      'page',
      this.jumpToPage$.pipe(
        startWith(config?.page ?? 1),
        switchMap((jumpToPage: number) =>
          merge(
            merge(this.scroll$, this.nextPage$).pipe(
              map(() => 1),
              startWith(0)
            ),
            this.previousPage$.pipe(
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
     * Connect {@link TableDataSourceState.rows rows state} with {@link DataSource.data$ dataSource's data$}.
     * - Appends new {@link DataSource.data$ data$} to the {@link rows$ rows} array if {@link paginationStrategy$} is set to scroll,
     * otherwise replaces it.
     */
    this.state.connect(
      this.dataSource.data$.pipe(withLatestFrom(this.scrollStrategy$)),
      (oldState: TableDataSourceState<T>, [data, scrollStrategy]: [T[] | null, boolean]) => ({
        rows: scrollStrategy
          ? data
            ? oldState.rows
              ? [...oldState.rows, ...data]
              : data
            : oldState.rows
          : data ?? [],
      })
    );

    /**
     * Define effects of {@link TableDataSourceActions.clearRows clear rows action}.
     */
    this.state.hold(this.actions.clearRows$, () =>
      this.state.set((oldState: TableDataSourceState<T>) => ({
        rows: oldState.rows && oldState.rows.length > 0 ? [] : oldState.rows,
      }))
    );

    /**
     * Define effects of {@link TableDataSourceActions.setSort set sort action}.
     * @see sort
     */
    this.state.hold(
      this.actions.setSort$.pipe(withLatestFrom(this.scrollStrategy$, this.page$)),
      ([sort, scrollStrategy]: [Sort | null, boolean, number]) => {
        if (scrollStrategy) {
          this.actions.clearRows();
          this.dataSource.clearData();
        }
        this.paginationState.set((oldState: PaginationState) => ({
          sort,
          page: scrollStrategy && oldState.page !== 1 ? 1 : oldState.page,
        }));
      }
    );

    /**
     * Connect {@link PaginationState.paginationStrategy pagination strategy state}
     * with {@link TableDataSourceActions.setPaginationStrategy set pagination strategy action}.
     * @see paginationStrategy
     */
    this.paginationState.connect(
      this.actions.setPaginationStrategy$,
      (oldState: PaginationState, paginationStrategy: PaginationStrategy) => ({
        page:
          oldState.paginationStrategy === PaginationStrategy.scroll &&
          paginationStrategy === PaginationStrategy.paginate &&
          oldState.page !== 1
            ? 1
            : oldState.page,
        paginationStrategy,
      })
    );

    /**
     * Define additional effects of {@link TableDataSourceActions.setPaginationStrategy set pagination strategy action}.
     * @see paginationStrategy
     */
    this.state.hold(this.actions.setPaginationStrategy$, () => this.actions.refresh());

    /**
     * Define effects of {@link refresh$} action.
     * @see refresh
     */
    this.state.hold(
      this.refresh$.pipe(withLatestFrom(this.page$, this.paginationStrategy$)),
      ([_, page, paginationStrategy]: [void, number, PaginationStrategy]) => {
        this.dataSource.clearData();
        if (paginationStrategy === PaginationStrategy.scroll) this.actions.clearRows();
        if (paginationStrategy !== PaginationStrategy.paginate && page !== 1) {
          this.actions.jumpToPage(1);
        } else {
          this.dataSource.refresh();
        }
      }
    );

    /**
     * Define effects of {@link reset$} action.
     * @see reset
     */
    this.state.hold(
      this.reset$.pipe(withLatestFrom(this.page$, this.scrollStrategy$)),
      ([_, page, scrollStrategy]: [void, number, boolean]) => {
        if (scrollStrategy) this.actions.clearRows();
        if (page !== 1) {
          // Only reset, jump to page will trigger a refresh
          this.dataSource.reset();
          this.actions.jumpToPage(1);
        } else {
          this.dataSource.resetAndRefresh();
        }
      }
    );
  }

  /**
   * Update page's row {@link limit$ limit}.
   *
   * @param limit
   */
  public set limit(limit: number | boolean) {
    this.paginationState.set({ limit });
  }

  /**
   * Update {@link paginationStrategy$ pagination strategy}, and:
   * -  {@link jumpToPage Jump to page} 1 when switching from 'scroll' to 'none',
   * and if {@link page$ page} is not 1. This is required since {@link refresh table's refresh}
   * will not reset page itself, if pagination strategy is 'paginate'.
   *
   * Afterwards, as effect:
   * - Trigger {@link refresh table's refresh}.
   *
   * @param paginationStrategy
   */
  public set paginationStrategy(paginationStrategy: PaginationStrategy) {
    this.actions.setPaginationStrategy(paginationStrategy);
  }

  /**
   * Update {@link sort$ sort} column and direction.
   *
   * Additionally:
   * - If {@link paginationStrategy$ pagination strategy} is scroll, call {@link TableDataSourceActions.clearRows clear rows} action
   * to reset {@link rows$} accumulator back to an empty array, and {@link jumpToPage jump to page} 1 if {@link page$ page} !== 1.
   *
   * @param sort
   */
  public set sort(sort: Sort | null) {
    this.actions.setSort(sort);
  }

  /**
   * Updates source of {@link dataSource$}.
   *
   * @param dataSource - Arrow function which returns an observable and takes
   * {@link HttpParams HTTP parameters}. The following parameters will be passed when
   * the function is consumed: skip, take, sortBy and sortDirection.
   */
  public set source(dataSource: (params: HttpParams) => Observable<T[]>) {
    this.actions.setDataSource(dataSource);
  }

  ngOnDestroy(): void {
    this.factory.ngOnDestroy();
    this.paginationState.ngOnDestroy();
    this.state.ngOnDestroy();
  }

  /**
   * Load next {@link page$ page} if pagination strategy is set to 'paginate'.
   */
  public nextPage(): void {
    this.actions.nextPage();
  }

  /**
   * Load previous {@link page$ page} if pagination strategy is set to 'paginate'.
   */
  public previousPage(): void {
    this.actions.previousPage();
  }

  /**
   * Jump to specified {@link page$ page} if pagination strategy is set to 'paginate'.
   *
   * @param page
   */
  public jumpToPage(page: number): void {
    /**
     * Unlike {@link nextPage} or {@link previousPage}, requires pagination strategy check
     * as jumpToPage action is triggered inside {@link TableDataSource} to reset page to 1
     * (e.g. during {@link refresh} and {@link reset}).
     */
    if (this.paginationState.get('paginationStrategy') === PaginationStrategy.paginate)
      this.actions.jumpToPage(page);
  }

  /**
   * Load next set of {@link rows$ rows} and concatenate it to the existing ones
   * if pagination strategy is set to 'scroll'.
   */
  public scroll(): void {
    this.actions.scroll();
  }

  /**
   * Refresh table:
   * - Call internal {@link DataSource.clearData data source clear data} to reset {@link rows$} accumulator
   * back to an empty array.
   * - If {@link paginationStrategy$ pagination strategy} is not paginate and {@link page$ page} !== 1,
   * {@link jumpToPage jump to page} 1 (which will trigger a refresh). This behavior is not desired for paginate strategy
   * in order to simply refresh current page.
   * - Else, call internal {@link DataSource.refresh data source refresh}.
   *
   * Additionally:
   * - If {@link paginationStrategy$ pagination strategy} is scroll, call {@link TableDataSourceActions.clearRows clear rows} action
   * to reset {@link rows$} accumulator back to an empty array.
   */
  public refresh(): void {
    this.actions.refresh();
  }

  /**
   * Reset table:
   * - If {@link page$ page} !== 1, call internal {@link DataSource.reset data source reset}
   * and {@link jumpToPage jump to page} 1 (which will trigger a refresh).
   * - Else, call internal {@link DataSource.resetAndRefresh data source reset and refresh}.
   *
   * Additionally:
   * - If {@link paginationStrategy$ pagination strategy} is scroll,
   * call {@link TableDataSourceActions.clearRows clear rows} action
   * to reset {@link rows$} accumulator back to an empty array.
   */
  public reset(): void {
    this.actions.reset();
  }
}
