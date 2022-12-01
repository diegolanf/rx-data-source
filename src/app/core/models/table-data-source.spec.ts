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
    dataSourceSpy = jasmine.createSpyObj('DataSource', ['connectSource', 'refresh', 'reset'], {
      data$: data$,
    });

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
              column: 'value',
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

  // Pagination parameters
  it('should return pagination parameters from provided configuration', () => {
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

  it('should update pagination parameters when changing current page', () => {
    const unsub = '---!';
    const expectedMarbles = 'abc';
    const expectedValues = {
      a: { skip: 30, take: 30 },
      b: { skip: 60, take: 30 },
      c: { skip: 300, take: 30 },
    };

    const triggerMarbles = '-de';
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
});
