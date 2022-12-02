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
  const _source: (params: HttpParams) => Observable<number[]> = (params: HttpParams) => {
    const skip = +(params.get('skip') ?? 0);
    const take = +(params.get('take') ?? 1);
    return of([skip, skip + take]);
  };

  const data$ = new Subject<number[]>();

  beforeEach(() => {
    dataSourceSpy = jasmine.createSpyObj(
      'DataSource',
      ['clearData', 'connectSource', 'refresh', 'reset'],
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
});
