import { TestBed } from '@angular/core/testing';
import { RxState } from '@rx-angular/state';
import { RxActionFactory } from '@rx-angular/state/actions';
import { tap } from 'rxjs';
import { RunHelpers, TestScheduler } from 'rxjs/internal/testing/TestScheduler';

import { Interval, INTERVAL_CONFIG } from './interval.model';

describe('Interval', () => {
  let interval: Interval;
  let testScheduler: TestScheduler;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        Interval,
        RxActionFactory,
        RxState,
        {
          provide: INTERVAL_CONFIG,
          useValue: { refreshInterval: 1 },
        },
      ],
    });
    interval = TestBed.inject(Interval);
    testScheduler = new TestScheduler((actual: unknown, expected: unknown) => {
      expect(actual).toEqual(expected);
    });
  });

  it('should be created', () => {
    expect(interval).toBeTruthy();
  });

  it('emit execute$ every second', () => {
    const unsub = '1s - 999ms - 999ms -!';
    const expectedMarbles = '1s a 999ms a 999ms a';
    const expectedValues = {
      a: undefined,
    };

    testScheduler.run(({ expectObservable }: RunHelpers) => {
      expectObservable(interval.execute$, unsub).toBe(expectedMarbles, expectedValues);
    });
  });

  it('emit execute$ on refresh and then again after 1 second', () => {
    const unsub = '1s - 999ms - 499ms - 999ms -!';
    const expectedMarbles = '1s a 999ms a 499ms a 999ms a';
    const expectedValues = {
      a: undefined,
    };

    const triggerMarbles = '2500ms b';
    const triggerValues = {
      b: (): void => interval.refresh(),
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(interval.execute$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });
});
