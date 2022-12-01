import { TestBed } from '@angular/core/testing';
import { DataSource } from '@app/core/models/data-source.model';
import { PaginationStrategy, SortDirection } from '@app/core/models/table-config.model';
import { RxState } from '@rx-angular/state';
import { RxActionFactory } from '@rx-angular/state/actions';
import { Subject } from 'rxjs';

import { TABLE_DATA_SOURCE_CONFIG, TableDataSource } from './table-data-source.model';
import SpyObj = jasmine.SpyObj;

interface TestTableData {
  value: number;
}

describe('TableDataSource', () => {
  let dataSourceSpy: SpyObj<DataSource<TestTableData[]>>;
  let tableDataSource: TableDataSource<TestTableData>;
  // let testScheduler: TestScheduler;
  // const source: (params: HttpParams) => Observable<TestTableData[]> = (params: HttpParams) => {
  //   const skip = +(params.get('skip') ?? 0);
  //   const take = +(params.get('take') ?? 1);
  //   return of([{ value: skip }, { value: skip + take }]);
  // };

  const data$ = new Subject<TestTableData[]>();

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
    // testScheduler = new TestScheduler((actual: unknown, expected: unknown) => {
    //   expect(actual).toEqual(expected);
    // });
  });

  it('should create an instance', () => {
    expect(tableDataSource).toBeTruthy();
  });

  it('should call connectSource from dataSource on initialisation', () => {
    expect(dataSourceSpy.connectSource).toHaveBeenCalled();
  });
});
