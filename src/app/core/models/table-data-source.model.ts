import { HttpParams } from '@angular/common/http';
import { Inject, Injectable, InjectionToken, Optional } from '@angular/core';
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
   * Scroll action.
   */
  scroll: void;

  /**
   * Clear rows action.
   */
  clearRows: void;

  /**
   * Refresh action.
   * - If true, forces refresh.
   * @see TableDataSource.refresh
   */
  refresh: boolean;

  /**
   * Reset action.
   */
  reset: void;

  /**
   * Set pagination strategy action.
   */
  setPaginationStrategy: PaginationStrategy;

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
   * Observable of {@link TableDataSourceActions.clearRows clear rows} action.
   */
  public readonly clearRows$: Observable<void>;

  /**
   * Observable of {@link refresh} action.
   */
  public readonly refresh$: Observable<boolean>;

  /**
   * Observable of {@link reset} action.
   */
  public readonly reset$: Observable<void>;

  /**
   * Fallback {@link limit$ limit} for paginate and scroll {@link paginationStrategy$ strategies} if none is already defined.
   * @private
   */
  private readonly fallbackLimit: number = 10;

  private readonly actions = this.factory.create();

  constructor(
    @Optional() @Inject(TABLE_DATA_SOURCE_CONFIG) config: Partial<TableDataSourceConfig> | null,
    private readonly dataSource: DataSource<T[]>,
    private readonly factory: RxActionFactory<TableDataSourceActions<T>>,
    private readonly state: RxState<TableDataSourceState<T>>
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

    this.clearRows$ = this.actions.clearRows$;
    this.refresh$ = this.actions.refresh$;
    this.reset$ = this.actions.reset$;

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
     * Connect {@link DataSourceState.dataSource dataSource's source} with {@link dataSource$} observable.
     */
    this.dataSource.connectSource(this.dataSource$);

    /**
     * Connect {@link TableDataSourceState.page page state} to {@link jumpToPage}, {@link nextPage} and {@link previousPage} actions.
     * - On jumpToPage, resets scan operator and uses emitted value as seed.
     * - On nextPage, adds 1 to currentPage accumulator.
     * - On previousPage, subtracts 1 from currentPage accumulator.
     */
    this.state.connect(
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
     * - Set back to empty array on {@link reset} action.
     * - Appends new {@link DataSource.data$ data$} to the {@link rows$ rows} array if {@link paginationStrategy$} is set to scroll,
     * otherwise replaces it.
     */
    this.state.connect(
      'rows',
      this.clearRows$.pipe(
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
     * Connect {@link TableDataSourceState.paginationStrategy pagination strategy state}
     * with {@link TableDataSourceActions.setPaginationStrategy set pagination strategy action}.
     * @see paginationStrategy
     */
    this.state.connect(
      this.actions.setPaginationStrategy$,
      (oldState: TableDataSourceState<T>, paginationStrategy: PaginationStrategy) => {
        if (
          oldState.paginationStrategy === PaginationStrategy.none &&
          oldState.limit === false &&
          paginationStrategy === PaginationStrategy.scroll
        ) {
          this.dataSource.clearData();
        } else if (
          oldState.paginationStrategy === PaginationStrategy.scroll &&
          oldState.page !== 1 &&
          paginationStrategy === PaginationStrategy.paginate
        ) {
          this.dataSource.clearData();
          this.actions.jumpToPage(1);
        }
        return {
          paginationStrategy,
        };
      }
    );

    /**
     * Define additional effects of {@link TableDataSourceActions.setPaginationStrategy set pagination strategy action}.
     * @see paginationStrategy
     */
    this.state.hold(this.actions.setPaginationStrategy$, () => this.actions.refresh(false));

    /**
     * Define effects of {@link refresh$} action.
     * @see refresh
     */
    this.state.hold(
      this.refresh$.pipe(withLatestFrom(this.page$, this.paginationStrategy$)),
      ([forceRefresh, page, paginationStrategy]: [boolean, number, PaginationStrategy]) => {
        if (paginationStrategy !== PaginationStrategy.paginate && page !== 1) {
          // Only clearData as jump to page will trigger a refresh
          this.dataSource.clearData();
          this.actions.jumpToPage(1);
        } else if (forceRefresh) {
          this.dataSource.refresh();
        }
        if (paginationStrategy === PaginationStrategy.scroll) this.actions.clearRows();
      }
    );

    /**
     * Define effects of {@link reset$} action.
     * @see reset
     */
    this.state.hold(
      this.reset$.pipe(withLatestFrom(this.page$, this.scrollStrategy$)),
      ([_, page, scrollStrategy]: [void, number, boolean]) => {
        if (page !== 1) {
          // Only reset, jump to page will trigger a refresh
          this.dataSource.reset();
          this.actions.jumpToPage(1);
        } else {
          this.dataSource.resetAndRefresh();
        }
        if (scrollStrategy) this.actions.clearRows();
      }
    );
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
   * Update {@link paginationStrategy$ pagination strategy}, and:
   * - Call {@link DataSource.clearData data source clear data} only when switching from 'none' to 'scroll', and if {@link limit$ limit}
   * is currently false; otherwise latest {@link DataSource.data$ data source data$} will be immediately added to {@link rows$ rows},
   * causing new emission to only be appended afterwards. This behaviour is a result of {@link refresh table's refresh}
   * not calling clear data itself, as page will always be 1 while pagination strategy is none.
   * - Call {@link DataSource.clearData data source clear data} and {@link jumpToPage jump to page} 1 only when switching
   * from 'scroll' to 'none', and if {@link page$ page} is not 1. This is required since {@link refresh table's refresh}
   * will not reset page itself, if pagination strategy is 'paginate'.
   *
   * Afterwards, as effect:
   * - Trigger {@link refresh table's refresh with force refresh = false}: Force refresh is disabled to avoid table from
   * refreshing when switching between strategies if the action is expected to return the same {@link rows$ rows}.
   *
   * @param paginationStrategy
   */
  public set paginationStrategy(paginationStrategy: PaginationStrategy) {
    this.actions.setPaginationStrategy(paginationStrategy);
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
   * Updates source of {@link dataSource$}.
   *
   * @param dataSource - Arrow function which returns an observable and takes
   * {@link HttpParams HTTP parameters}. The following parameters will be passed when
   * the function is consumed: skip, take, sortBy and sortDirection.
   */
  public set source(dataSource: (params: HttpParams) => Observable<T[]>) {
    this.actions.setDataSource(dataSource);
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
    if (this.state.get('paginationStrategy') === PaginationStrategy.paginate)
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
   * - If {@link paginationStrategy$ pagination strategy} is not paginate and {@link page$ page} !== 1,
   * {@link jumpToPage jump to page}  1 (which will trigger a refresh) and call internal
   * {@link DataSource.clearData data source clear data}. This behavior is not desired for paginate strategy in order to
   * simply refresh current page.
   * - Else if {@link page$ page} === 1 and forceRefresh === true (default = true),
   * call internal {@link DataSource.refresh data source refresh}.
   *
   * Additionally:
   * - If {@link paginationStrategy$ pagination strategy} is scroll: Call {@link TableDataSourceActions.clearRows clear rows} action
   * to reset {@link rows$} accumulator back to an empty array.
   *
   * @param forceRefresh
   */
  public refresh(forceRefresh: boolean = true): void {
    this.actions.refresh(forceRefresh);
  }

  /**
   * Reset table:
   * - If {@link page$ page} !== 1, {@link jumpToPage jump to page}  1 (which will trigger a refresh)
   * and call internal {@link DataSource.reset data source reset}.
   * - Else, call internal {@link DataSource.resetAndRefresh data source reset and refresh}.
   *
   * Additionally:
   * - If {@link paginationStrategy$ pagination strategy} is scroll:
   * Call {@link TableDataSourceActions.clearRows clear rows} action
   * to reset {@link rows$} accumulator back to an empty array.
   */
  public reset(): void {
    this.actions.reset();
  }
}
