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

  it('emit execute$ every second, on refresh action (at 2500 ms) and then again after 1 second', () => {
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

  it('update refresh interval to 200ms halfway through a running interval', () => {
    const unsub = '1s - 499ms - 199ms - 199ms -!';
    const expectedMarbles = '1s a 499ms - 199ms a 199ms a';
    const expectedValues = {
      a: undefined,
    };

    const triggerMarbles = '1500ms b';
    const triggerValues = {
      b: (): void => {
        interval.refreshInterval = 0.2;
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(interval.execute$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('only emit execute$ on refresh action if interval is 0', () => {
    const unsub = '- 2s - 4s -!';
    const expectedMarbles = '- 2s a 4s a';
    const expectedValues = {
      a: undefined,
    };

    const triggerMarbles = 'b 2s c 4s c';
    const triggerValues = {
      b: (): void => {
        interval.refreshInterval = 0;
      },
      c: (): void => interval.refresh(),
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(interval.execute$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });
});
