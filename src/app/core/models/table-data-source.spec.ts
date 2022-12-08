import { HttpParams } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { DataSource } from '@app/core/models/data-source.model';
import { PaginationStrategy, SortDirection } from '@app/core/models/table-config.model';
import { RxState } from '@rx-angular/state';
import { RxActionFactory } from '@rx-angular/state/actions';
import { Observable, of, Subject, tap } from 'rxjs';
import { RunHelpers, TestScheduler } from 'rxjs/internal/testing/TestScheduler';

import { TABLE_DATA_SOURCE_CONFIG, TableDataSource } from './table-data-source.model';
import SpyObj = jasmine.SpyObj;

describe('TableDataSource', () => {
  let dataSourceSpy: SpyObj<DataSource<number[]>>;
  let tableDataSource: TableDataSource<number>;
  let testScheduler: TestScheduler;

  const data$ = new Subject<number[]>();

  const source: (params: HttpParams) => Observable<number[]> = (params: HttpParams) => {
    const sortBy = params.get('sortBy') ? 1 : 0;
    const sortDirection = params.get('sortDirection')
      ? params.get('sortDirection') === 'asc'
        ? 2
        : 1
      : 0;
    const skip = +(params.get('skip') ?? 0);
    const take = +(params.get('take') ?? 0);
    return of([sortBy, sortDirection, skip, take]);
  };

  beforeEach(() => {
    dataSourceSpy = jasmine.createSpyObj(
      'DataSource',
      ['clearData', 'connectSource', 'refresh', 'reset', 'resetAndRefresh'],
      {
        data$: data$,
      }
    );

    TestBed.configureTestingModule({
      providers: [
        TableDataSource,
        {
          provide: TABLE_DATA_SOURCE_CONFIG,
          useValue: {
            limit: 30,
            page: 2,
            paginationStrategy: PaginationStrategy.paginate,
            sort: {
              direction: SortDirection.asc,
              column: 'defaultColumn',
            },
          },
        },
        { provide: DataSource, useValue: dataSourceSpy },
        RxActionFactory,
        RxState,
      ],
    });
    tableDataSource = TestBed.inject(TableDataSource);
    testScheduler = new TestScheduler((actual: unknown, expected: unknown) => {
      expect(actual).toEqual(expected);
    });
  });

  it('should create an instance', () => {
    expect(tableDataSource).toBeTruthy();
  });

  it('should call connectSource from dataSource during initialisation', () => {
    expect(dataSourceSpy.connectSource).toHaveBeenCalled();
  });

  // Pagination strategy
  it('should return paginationStrategy$ from provided configuration', () => {
    const unsub = '-!';
    const expectedMarbles = 'a';
    const expectedValues = {
      a: PaginationStrategy.paginate,
    };

    testScheduler.run(({ expectObservable }: RunHelpers) => {
      expectObservable(tableDataSource.paginationStrategy$, unsub).toBe(
        expectedMarbles,
        expectedValues
      );
    });
  });

  it('should update paginationStrategy$', () => {
    const unsub = '----!';
    const expectedMarbles = 'abcd';
    const expectedValues = {
      a: PaginationStrategy.paginate,
      b: PaginationStrategy.none,
      c: PaginationStrategy.scroll,
      d: PaginationStrategy.paginate,
    };

    const triggerMarbles = '-efg';
    const triggerValues = {
      e: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.none;
      },
      f: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.scroll;
      },
      g: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.paginate;
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.paginationStrategy$, unsub).toBe(
        expectedMarbles,
        expectedValues
      );
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should update noPaginationStrategy$ when changing pagination strategy', () => {
    const unsub = '---!';
    const expectedMarbles = 'aba';
    const expectedValues = {
      a: false,
      b: true,
    };

    const triggerMarbles = '-cd';
    const triggerValues = {
      c: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.none;
      },
      d: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.scroll;
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.noPaginationStrategy$, unsub).toBe(
        expectedMarbles,
        expectedValues
      );
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should update paginateStrategy$ when changing pagination strategy', () => {
    const unsub = '---!';
    const expectedMarbles = 'ba-';
    const expectedValues = {
      a: false,
      b: true,
    };

    const triggerMarbles = '-cd';
    const triggerValues = {
      c: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.none;
      },
      d: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.scroll;
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.paginateStrategy$, unsub).toBe(
        expectedMarbles,
        expectedValues
      );
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should update scrollStrategy$ when changing pagination strategy', () => {
    const unsub = '---!';
    const expectedMarbles = 'a-b';
    const expectedValues = {
      a: false,
      b: true,
    };

    const triggerMarbles = '-cd';
    const triggerValues = {
      c: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.none;
      },
      d: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.scroll;
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.scrollStrategy$, unsub).toBe(
        expectedMarbles,
        expectedValues
      );
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should call dataSource.clearData if pagination strategy changes from none to scroll and limit is false', () => {
    const triggerMarbles = 'ab';
    const triggerValues = {
      a: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.none;
        tableDataSource.limit = false;
      },
      b: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.scroll;
      },
    };

    testScheduler.run(({ expectObservable, cold, flush }: RunHelpers) => {
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
      flush();
      expect(dataSourceSpy.clearData).toHaveBeenCalled();
    });
  });

  // Page
  it('should return page$ from provided configuration', () => {
    const unsub = '-!';
    const expectedMarbles = 'a';
    const expectedValues = {
      a: 2,
    };

    testScheduler.run(({ expectObservable }: RunHelpers) => {
      expectObservable(tableDataSource.page$, unsub).toBe(expectedMarbles, expectedValues);
    });
  });

  it('should increase page$ on nextPage', () => {
    const unsub = '---!';
    const expectedMarbles = 'abc';
    const expectedValues = {
      a: 2,
      b: 3,
      c: 4,
    };

    const triggerMarbles = '-dd';
    const triggerValues = {
      d: (): void => {
        tableDataSource.nextPage();
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.page$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should decrease page$ on previousPage, unless page is already 1', () => {
    const unsub = '---!';
    const expectedMarbles = 'ab-';
    const expectedValues = {
      a: 2,
      b: 1,
    };

    const triggerMarbles = '-cc';
    const triggerValues = {
      c: (): void => {
        tableDataSource.previousPage();
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.page$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should update page$ on jumpToPage', () => {
    const unsub = '----!';
    const expectedMarbles = 'abcb';
    const expectedValues = {
      a: 2,
      b: 1,
      c: 4,
    };

    const triggerMarbles = '-def';
    const triggerValues = {
      d: (): void => {
        tableDataSource.jumpToPage(1);
      },
      e: (): void => {
        tableDataSource.jumpToPage(4);
      },
      f: (): void => {
        // Expect minimum value of 1
        tableDataSource.jumpToPage(-1);
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.page$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should jump to page$ 1 when changing pagination strategy to scroll', () => {
    const unsub = '--!';
    const expectedMarbles = 'ba';
    const expectedValues = {
      a: 1,
      b: 2,
    };

    const triggerMarbles = '-c';
    const triggerValues = {
      c: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.scroll;
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.page$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should jump to page$ 1 when changing pagination strategy to none', () => {
    const unsub = '--!';
    const expectedMarbles = 'ba';
    const expectedValues = {
      a: 1,
      b: 2,
    };

    const triggerMarbles = '-c';
    const triggerValues = {
      c: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.none;
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.page$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should update page$ on scroll if pagination strategy is scroll', () => {
    const unsub = '----!';
    const expectedMarbles = 'babc';
    const expectedValues = {
      a: 1,
      b: 2,
      c: 3,
    };

    const triggerMarbles = '-dee';
    const triggerValues = {
      d: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.scroll;
      },
      e: (): void => {
        tableDataSource.scroll();
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.page$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should jump to page$ 1 when changing pagination strategy to scroll to paginate', () => {
    const unsub = '------!';
    const expectedMarbles = '(ba)ba';
    const expectedValues = {
      a: 1,
      b: 2,
    };

    const triggerMarbles = 'c---de';
    const triggerValues = {
      c: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.scroll;
      },
      d: (): void => {
        tableDataSource.scroll();
      },
      e: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.paginate;
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.page$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should ignore all page actions if pagination strategy is not paginate', () => {
    const unsub = '---------!';
    const expectedMarbles = 'ab-------';
    const expectedValues = {
      a: 2,
      b: 1,
    };

    const triggerMarbles = '-cefgdefg';
    const triggerValues = {
      c: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.none;
      },
      d: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.scroll;
      },
      e: (): void => {
        tableDataSource.nextPage();
      },
      f: (): void => {
        tableDataSource.previousPage();
      },
      g: (): void => {
        // Expect minimum value of 1
        tableDataSource.jumpToPage(5);
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.page$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should not scroll if pagination strategy is not scroll', () => {
    const unsub = '----!';
    const expectedMarbles = 'a-b-';
    const expectedValues = {
      a: 2,
      b: 1,
    };

    const triggerMarbles = '-dcd';
    const triggerValues = {
      c: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.none;
      },
      d: (): void => {
        tableDataSource.scroll();
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.page$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  // Sort
  it('should update sort$', () => {
    const unsub = '----!';
    const expectedMarbles = 'abcd';
    const expectedValues = {
      a: { direction: SortDirection.asc, column: 'defaultColumn' },
      b: { direction: SortDirection.desc, column: 'column1' },
      c: null,
      d: { direction: SortDirection.asc, column: 'column2' },
    };

    const triggerMarbles = '-efg';
    const triggerValues = {
      e: (): void => {
        tableDataSource.sort = { direction: SortDirection.desc, column: 'column1' };
      },
      f: (): void => {
        tableDataSource.sort = null;
      },
      g: (): void => {
        tableDataSource.sort = { direction: SortDirection.asc, column: 'column2' };
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.sort$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  // Pagination parameters
  it('should return paginationParams$ from provided configuration', () => {
    const unsub = '-!';
    const expectedMarbles = 'a';
    const expectedValues = {
      a: { skip: 30, take: 30 },
    };

    testScheduler.run(({ expectObservable }: RunHelpers) => {
      expectObservable(tableDataSource.paginationParams$, unsub).toBe(
        expectedMarbles,
        expectedValues
      );
    });
  });

  it('should update paginationParams$ when changing current page', () => {
    const unsub = '-----!';
    const expectedMarbles = '(ab)c';
    const expectedValues = {
      a: { skip: 30, take: 30 },
      b: { skip: 60, take: 30 },
      c: { skip: 300, take: 30 },
    };

    const triggerMarbles = 'd---e';
    const triggerValues = {
      d: (): void => {
        tableDataSource.nextPage();
      },
      e: (): void => {
        tableDataSource.jumpToPage(11);
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.paginationParams$, unsub).toBe(
        expectedMarbles,
        expectedValues
      );
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should update paginationParams$ when changing limit', () => {
    const unsub = '-!';
    const expectedMarbles = '(ab)';
    const expectedValues = {
      a: { skip: 30, take: 30 },
      b: { skip: 10, take: 10 },
    };

    const triggerMarbles = 'c';
    const triggerValues = {
      c: (): void => {
        tableDataSource.limit = 10;
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.paginationParams$, unsub).toBe(
        expectedMarbles,
        expectedValues
      );
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should update paginationParams$ when changing pagination strategy', () => {
    const unsub = '------!';
    const expectedMarbles = '(ab)cd';
    const expectedValues = {
      a: { skip: 30, take: 30 },
      b: { skip: 10, take: 10 },
      c: undefined,
      d: { skip: 0, take: 10 },
    };

    const triggerMarbles = 'e---fg';
    const triggerValues = {
      e: (): void => {
        tableDataSource.limit = false;
      },
      f: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.none;
      },
      g: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.scroll;
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.paginationParams$, unsub).toBe(
        expectedMarbles,
        expectedValues
      );
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  // Data source
  it('should return nested observable with parameters from dataSource$ based on provided configuration', () => {
    const unsub = '-!';

    const expectedMarbles = 'a';
    const expectedValues = {
      // sortBy, sortDirection, skip, take
      a: [1, 2, 30, 30],
    };

    const triggerMarbles = 'b';
    const triggerValues = {
      b: (): void => {
        tableDataSource.source = source;
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.dataSource$, unsub).toBe(expectedMarbles, {
        a: cold('(a|)', { a: expectedValues.a }),
      });
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should update parameters in nested observable from dataSource$ when changing page, limit and sort', () => {
    const unsub = '-----!';
    const expectedMarbles = 'abcde';
    // sortBy, sortDirection, skip, take
    const expectedValues = {
      a: [1, 2, 30, 30],
      b: [1, 2, 60, 30],
      c: [1, 1, 60, 30],
      d: [0, 0, 60, 30],
      e: [0, 0, 20, 10],
    };

    const triggerMarbles = 'fghij';
    const triggerValues = {
      f: (): void => {
        tableDataSource.source = source;
      },
      g: (): void => {
        tableDataSource.nextPage();
      },
      h: (): void => {
        tableDataSource.sort = { direction: SortDirection.desc, column: 'column1' };
      },
      i: (): void => {
        tableDataSource.sort = null;
      },
      j: (): void => {
        tableDataSource.limit = 10;
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.dataSource$, unsub).toBe(expectedMarbles, {
        a: cold('(z|)', { z: expectedValues.a }),
        b: cold('(z|)', { z: expectedValues.b }),
        c: cold('(z|)', { z: expectedValues.c }),
        d: cold('(z|)', { z: expectedValues.d }),
        e: cold('(z|)', { z: expectedValues.e }),
      });
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  // Rows
  it('should replace rows if pagination strategy is paginate or none', () => {
    const unsub = '----!';
    const expectedMarbles = 'ab-c';
    const expectedValues = {
      a: [1, 2, 3],
      b: [4, 5, 6],
      c: [7, 8, 9],
    };

    const triggerMarbles = 'defg';
    const triggerValues = {
      d: (): void => {
        data$.next([1, 2, 3]);
      },
      e: (): void => {
        data$.next([4, 5, 6]);
      },
      f: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.none;
      },
      g: (): void => {
        data$.next([7, 8, 9]);
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.rows$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should append rows if pagination strategy is scroll', () => {
    const unsub = '----!';
    const expectedMarbles = '-abc';
    const expectedValues = {
      a: [1, 2, 3],
      b: [1, 2, 3, 4, 5, 6],
      c: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    };

    const triggerMarbles = 'defg';
    const triggerValues = {
      d: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.scroll;
      },
      e: (): void => {
        data$.next([1, 2, 3]);
      },
      f: (): void => {
        data$.next([4, 5, 6]);
      },
      g: (): void => {
        data$.next([7, 8, 9]);
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.rows$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  // Empty
  it('should emit true on empty$ if rows$ array is an empty', () => {
    const unsub = '----!';
    const expectedMarbles = '-ab';
    const expectedValues = {
      a: false,
      b: true,
    };

    const triggerMarbles = '-cd';
    const triggerValues = {
      c: (): void => {
        data$.next([1, 2, 3]);
      },
      d: (): void => {
        data$.next([]);
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.empty$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  // Refresh
  it('should call dataSource.refresh and not jump to page 1 on refresh if pagination strategy is paginate', () => {
    const unsub = '--!';
    const expectedMarbles = 'a-';
    const expectedValues = {
      a: 2,
    };

    const triggerMarbles = 'b';
    const triggerValues = {
      b: (): void => {
        tableDataSource.refresh();
      },
    };

    testScheduler.run(({ expectObservable, cold, flush }: RunHelpers) => {
      expectObservable(tableDataSource.page$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
      flush();
      expect(dataSourceSpy.refresh).toHaveBeenCalled();
    });
  });

  it('should call dataSource.clearData and jump to page 1 on refresh if pagination strategy is scroll', () => {
    const unsub = '------!';
    const expectedMarbles = '(ba)ba';
    const expectedValues = {
      a: 1,
      b: 2,
    };

    const triggerMarbles = 'c---de';
    const triggerValues = {
      c: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.scroll;
      },
      d: (): void => {
        tableDataSource.scroll();
      },
      e: (): void => {
        tableDataSource.refresh();
      },
    };

    testScheduler.run(({ expectObservable, cold, flush }: RunHelpers) => {
      expectObservable(tableDataSource.page$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
      flush();
      expect(dataSourceSpy.clearData).toHaveBeenCalled();
    });
  });

  it('should clear rows$ accumulator on refresh if pagination strategy is scroll', () => {
    const unsub = '---!';
    const expectedMarbles = 'abc';
    const expectedValues = {
      a: [1, 2, 3],
      b: [1, 2, 3, 4, 5, 6],
      c: [1, 2, 3],
    };

    const triggerMarbles = 'def';
    const triggerValues = {
      d: (): void => {
        tableDataSource.paginationStrategy = PaginationStrategy.scroll;
        data$.next([1, 2, 3]);
      },
      e: (): void => {
        data$.next([4, 5, 6]);
      },
      f: (): void => {
        tableDataSource.refresh();
        data$.next([1, 2, 3]);
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(tableDataSource.rows$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  // Reset
  it('should call dataSource.reset and jump to page 1 on reset if current page is not 1', () => {
    const unsub = '-!';
    const expectedMarbles = '(ba)';
    const expectedValues = {
      a: 1,
      b: 2,
    };

    const triggerMarbles = 'b';
    const triggerValues = {
      b: (): void => {
        tableDataSource.reset();
      },
    };

    testScheduler.run(({ expectObservable, cold, flush }: RunHelpers) => {
      expectObservable(tableDataSource.page$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
      flush();
      expect(dataSourceSpy.reset).toHaveBeenCalled();
    });
  });

  it('should call dataSource.resetAndRefresh on reset if current page is 1', () => {
    const unsub = '-----!';
    const expectedMarbles = '(ba)-';
    const expectedValues = {
      a: 1,
      b: 2,
    };

    const triggerMarbles = 'c---d';
    const triggerValues = {
      c: (): void => {
        tableDataSource.previousPage();
      },
      d: (): void => {
        tableDataSource.reset();
      },
    };

    testScheduler.run(({ expectObservable, cold, flush }: RunHelpers) => {
      expectObservable(tableDataSource.page$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
      flush();
      expect(dataSourceSpy.resetAndRefresh).toHaveBeenCalled();
    });
  });
});
