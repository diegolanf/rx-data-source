import { TestBed } from '@angular/core/testing';
import { DataSource } from '@app/core/models/data-source.model';
import { RxState } from '@rx-angular/state';
import { RxActionFactory } from '@rx-angular/state/actions';
import { defer, delay, of, Subject, tap } from 'rxjs';
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

  it('toggle loading$, firstLoading$ and afterFirstLoading$ observables while source observable is active', () => {
    dataSource.source = defer(() => of(1).pipe(delay(100)));
    const unsub = '- 49ms - 99ms - 899ms - 99ms - !';

    // Toggles immediately (aba) due to initial execute$ emission
    const expectedLoadingMarbles = 'a 49ms (ba) 96ms b 899ms a 99ms b';

    // No emission after data is retrieved for the first time
    const expectedFirstLoadingMarbles = 'a 49ms (ba) 96ms b 899ms - 99ms -';

    // Emits true only when loading after data is retrieved for the first time
    const expectedAfterFirstLoadingMarbles = 'b 49ms - 99ms - 899ms a 99ms b';

    const expectedValues = {
      a: true,
      b: false,
    };

    // Trigger execute$ once after 50ms - before source completes - to interrupt it and check that firstLoading continues emitting true, and again after 1s
    const triggerMarbles = '- 49ms c 999ms c';
    const triggerValues = {
      c: (): void => {
        execute$.next();
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.loading$, unsub).toBe(expectedLoadingMarbles, expectedValues);
      expectObservable(dataSource.firstLoading$, unsub).toBe(
        expectedFirstLoadingMarbles,
        expectedValues
      );
      expectObservable(dataSource.afterFirstLoading$, unsub).toBe(
        expectedAfterFirstLoadingMarbles,
        expectedValues
      );
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('call interval.refresh on refresh', () => {
    dataSource.refresh();
    expect(intervalSpy.refresh).toHaveBeenCalled();
  });
});
