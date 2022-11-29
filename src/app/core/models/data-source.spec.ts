import { TestBed } from '@angular/core/testing';
import { DataSource } from '@app/core/models/data-source.model';
import { RxState } from '@rx-angular/state';
import { RxActionFactory } from '@rx-angular/state/actions';
import { defer, of, Subject, tap } from 'rxjs';
import { RunHelpers, TestScheduler } from 'rxjs/internal/testing/TestScheduler';

import { Interval } from './interval.model';
import SpyObj = jasmine.SpyObj;

describe('DataSource', () => {
  const execute$ = new Subject<void>();
  let dataSource: DataSource<number>;
  let intervalSpy: SpyObj<Interval>;
  let testScheduler: TestScheduler;

  beforeEach(() => {
    intervalSpy = jasmine.createSpyObj('Interval', ['refresh'], {
      execute$: execute$,
    });

    TestBed.configureTestingModule({
      providers: [
        DataSource,
        { provide: Interval, useValue: intervalSpy },
        RxActionFactory,
        RxState,
      ],
    });
    dataSource = TestBed.inject(DataSource);
    testScheduler = new TestScheduler((actual: unknown, expected: unknown) => {
      expect(actual).toEqual(expected);
    });
  });

  it('should be created', () => {
    expect(dataSource).toBeTruthy();
  });

  it('emit data$ when source is defined and after every interval.execute$', () => {
    let emit = 1;
    dataSource.source = defer(() => of(emit));
    const unsub = '- 999ms - 999ms -!';
    const expectedMarbles = 'a 999ms b 999ms c';
    const expectedValues = {
      a: 1,
      b: 2,
      c: 3,
    };

    const triggerMarbles = '1s d 999ms d';
    const triggerValues = {
      d: (): void => {
        emit++;
        execute$.next();
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.data$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('call interval.refresh on refresh', () => {
    dataSource.refresh();
    expect(intervalSpy.refresh).toHaveBeenCalled();
  });
});
