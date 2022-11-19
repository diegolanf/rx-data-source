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

export interface TableDataSourceConfig {
  limit: number | boolean;
  page: number;
  paginationStrategy: PaginationStrategy;
  sort?: Sort;
}

export const TABLE_DATA_SOURCE_CONFIG = new InjectionToken<Partial<TableDataSourceConfig>>(
  'table-data-source.config'
);

export const defaultTableDataSourceConfig: Partial<TableDataSourceConfig> = {
  limit: false,
  paginationStrategy: PaginationStrategy.none,
};

interface TableDataSourceState<T> extends TableDataSourceConfig {
  rows: T[];
}

interface TableDataSourceActions<T> {
  jumpToPage: number;
  nextPage: void;
  previousPage: void;
  reset: void;
  scroll: void;
  setDataSource: (params: HttpParams) => Observable<T[]>;
}

@Injectable()
export class TableDataSource<T> {
  /**
   * Returns true if table's rows length is 0.
   */
  public readonly empty$: Observable<boolean>;

  /**
   * Row limit per page.
   */
  public readonly limit$: Observable<number | boolean> = this.state.select('limit');

  /**
   * Current page.
   */
  public readonly page$: Observable<number> = this.state.select('page');

  /**
   * Table's rows.
   */
  public readonly rows$: Observable<T[]> = this.state.select('rows');

  /**
   * Sort column and direction.
   */
  public readonly sort$: Observable<Sort | undefined> = this.state.select('sort');

  /**
   * Pagination strategy (paginate, scroll or none).
   */
  public readonly paginationStrategy$: Observable<PaginationStrategy> =
    this.state.select('paginationStrategy');

  /**
   * True if {@link paginationStrategy | pagination strategy} is 'none'.
   */
  public readonly noPaginationStrategy$: Observable<boolean>;

  /**
   * True if {@link paginationStrategy | pagination strategy} is 'paginate'.
   */
  public readonly paginateStrategy$: Observable<boolean>;

  /**
   * True if {@link paginationStrategy | pagination strategy} is 'scroll'.
   */
  public readonly scrollStrategy$: Observable<boolean>;

  /**
   * Skip and take parameters for pagination.
   */
  public readonly paginationParams$: Observable<PaginationParams | undefined>;

  /**
   * Data source observable containing the pagination and sort parameters.
   */
  public readonly dataSource$: Observable<Observable<T[]>>;

  private readonly actions = new RxActionFactory<TableDataSourceActions<T>>().create();
  private readonly fallbackLimit: number = 10; // Fallback limit for paginate and scroll strategies if none is already defined

  constructor(
    @Optional() @Inject(TABLE_DATA_SOURCE_CONFIG) config: Partial<TableDataSourceConfig> | null,
    private dataSource: DataSource<T[]>,
    private state: RxState<TableDataSourceState<T>>
  ) {
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

    this.dataSource$ = combineLatest([
      this.actions.setDataSource$,
      this.paginationParams$,
      this.sort$.pipe(startWith(undefined)),
    ]).pipe(
      map(
        ([dataSource, paginationParams, sort]: [
          (params: HttpParams) => Observable<T[]>,
          PaginationParams | undefined,
          Sort | undefined
        ]) => {
          let params = new HttpParams();
          if (paginationParams !== undefined)
            params = params.set('skip', paginationParams.skip).set('take', paginationParams.take);
          if (sort) {
            params = params.set('sortBy', sort.column).set('sortDirection', sort.direction);
          }
          return dataSource(params);
        }
      )
    );

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
            scan((currentPage: number, change: number) => {
              const newPage = currentPage + change;
              return newPage <= 0 ? currentPage : newPage;
            }, jumpToPage)
          )
        )
      )
    );

    this.state.hold(this.paginationStrategy$.pipe(skip(1)), () => this.reset(false));

    this.dataSource.connectSource(this.dataSource$);

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
  }

  private get paginateStrategy(): boolean {
    return this.state.get('paginationStrategy') === PaginationStrategy.paginate;
  }

  /**
   * Updates source of internal data source.
   *
   * @param dataSource
   */
  public set source(dataSource: (params: HttpParams) => Observable<T[]>) {
    this.actions.setDataSource(dataSource);
  }

  /**
   * Update page's row limit.
   *
   * @param limit
   */
  public set limit(limit: number | boolean) {
    this.state.set({ limit });
  }

  /**
   * Update pagination strategy.
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
   * Update sort column and direction.
   *
   * @param sort
   */
  public set sort(sort: Sort | undefined) {
    this.state.set({ sort });
  }

  /**
   * Load next set of rows and concatenate it to the existing ones.
   */
  public scroll(): void {
    if (this.state.get('paginationStrategy') === PaginationStrategy.scroll) this.actions.nextPage();
  }

  /**
   * Load next page.
   */
  public nextPage(): void {
    if (this.paginateStrategy) this.actions.nextPage();
  }

  /**
   * Load previous page.
   */
  public previousPage(): void {
    if (this.paginateStrategy) this.actions.previousPage();
  }

  /**
   * Jump to specified page.
   *
   * @param page
   */
  public jumpToPage(page: number): void {
    if (this.paginateStrategy) this.actions.jumpToPage(page);
  }

  /**
   * Reset table data.
   */
  public reset(forceRefresh: boolean = true): void {
    if (this.state.get('page') !== 1) {
      // Only reset, jump to page will trigger a refresh
      this.dataSource.reset();
      this.actions.jumpToPage(1);
    } else if (forceRefresh) {
      this.dataSource.refresh();
    }

    // Ensure accumulator reset occurs after dataSource.
    asyncScheduler.schedule(() => this.actions.reset());
  }
}
