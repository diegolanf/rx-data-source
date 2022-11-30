import { TestBed } from '@angular/core/testing';
import { DataSource } from '@app/core/models/data-source.model';
import { RxState } from '@rx-angular/state';
import { RxActionFactory } from '@rx-angular/state/actions';
import { defer, delay, of, Subject, tap, throwError } from 'rxjs';
import { RunHelpers, TestScheduler } from 'rxjs/internal/testing/TestScheduler';

import { Interval } from './interval.model';
import SpyObj = jasmine.SpyObj;

describe('DataSource', () => {
  let dataSource: DataSource<number>;
  let intervalSpy: SpyObj<Interval>;
  let testScheduler: TestScheduler;

  const execute$ = new Subject<void>();

  const loadingObservablesTests = {
    source: of(1).pipe(delay(100)),
    unsub: '1150ms - !',

    /**
     * Trigger execute$ once after 50ms - before source completes - to interrupt it
     * and check that firstLoading$ continues emitting true, and again after 1s.
     */
    triggerMarbles: '- 49ms d 999ms d',
    triggerValues: {
      d: (): void => {
        execute$.next();
      },
    },
  };

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

  // Defining source and general behaviour tests
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

  it('connect source with a nested observable (i.e. Observable<Observable<T>>) and emit a value', () => {
    dataSource.connectSource(of(of(1)));
    const unsub = '-!';
    const expectedMarbles = 'a';
    const expectedValues = {
      a: 1,
    };

    testScheduler.run(({ expectObservable }: RunHelpers) => {
      expectObservable(dataSource.data$, unsub).toBe(expectedMarbles, expectedValues);
    });
  });

  it('keep listening to active source until it completes and emit a response for each different value', () => {
    const unsub = '- 999ms - 999ms - 999ms -!';
    const sourceMarbles = 'a 999ms a 999ms b 999ms c|';

    /**
     * Second emission is omitted as value repeats.
     */
    const expectedMarbles = 'a 999ms - 999ms b 999ms c';
    const values = { a: 1, b: 2, c: 3 };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      dataSource.source = cold(sourceMarbles, values);
      expectObservable(dataSource.data$, unsub).toBe(expectedMarbles, values);
    });
  });

  it('emit a response immediately from new source when updating it', () => {
    dataSource.source = of(1);
    const unsub = '- 999ms -!';
    const expectedMarbles = 'a 999ms b';
    const expectedValues = {
      a: 1,
      b: 2,
    };

    const triggerMarbles = '1s c';
    const triggerValues = {
      c: (): void => {
        dataSource.source = of(2);
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.data$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  // Loading observables tests
  it('emit data$ only once, after source is interrupted and first completes successfully', () => {
    dataSource.source = loadingObservablesTests.source;

    /**
     * Source is interrupted at 50ms due to new execute$ emission.
     * data$ emits only once since value from source does not change on its second successful emission.
     */
    const expectedMarbles = '- 49ms - 99ms c 899ms - 99ms -';
    const expectedValues = {
      c: 1,
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.data$, loadingObservablesTests.unsub).toBe(
        expectedMarbles,
        expectedValues
      );
      expectObservable(
        cold(loadingObservablesTests.triggerMarbles, loadingObservablesTests.triggerValues).pipe(
          tap((fn: () => void) => fn())
        )
      );
    });
  });

  it('toggle loading$ observable every time source observable is active', () => {
    dataSource.source = loadingObservablesTests.source;

    /**
     * Toggles at 50ms - i.e. "(ba)" - due to interruption from first execute$ emission.
     */
    const expectedMarbles = 'a 49ms (ba) 96ms b 899ms a 99ms b';
    const expectedValues = {
      a: true,
      b: false,
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.loading$, loadingObservablesTests.unsub).toBe(
        expectedMarbles,
        expectedValues
      );
      expectObservable(
        cold(loadingObservablesTests.triggerMarbles, loadingObservablesTests.triggerValues).pipe(
          tap((fn: () => void) => fn())
        )
      );
    });
  });

  it('toggle firstLoading$ observable while source observable is active, but only before data is retrieved for the first time', () => {
    dataSource.source = loadingObservablesTests.source;

    /**
     * Toggles at 50ms - i.e. "(ba)" - due to interruption from first execute$ emission.
     * No emission after data is retrieved for the first time.
     */
    const expectedMarbles = 'a 49ms (ba) 96ms b 899ms - 99ms -';
    const expectedValues = {
      a: true,
      b: false,
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.firstLoading$, loadingObservablesTests.unsub).toBe(
        expectedMarbles,
        expectedValues
      );
      expectObservable(
        cold(loadingObservablesTests.triggerMarbles, loadingObservablesTests.triggerValues).pipe(
          tap((fn: () => void) => fn())
        )
      );
    });
  });

  it('toggle afterFirstLoading$ observable while source observable is active, but only after data is retrieved for the first time', () => {
    dataSource.source = loadingObservablesTests.source;

    /**
     * Emits true only when loading after data is retrieved for the first time.
     */
    const expectedMarbles = 'b 49ms - 99ms - 899ms a 99ms b';
    const expectedValues = {
      a: true,
      b: false,
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.afterFirstLoading$, loadingObservablesTests.unsub).toBe(
        expectedMarbles,
        expectedValues
      );
      expectObservable(
        cold(loadingObservablesTests.triggerMarbles, loadingObservablesTests.triggerValues).pipe(
          tap((fn: () => void) => fn())
        )
      );
    });
  });

  // Error observable tests
  it('emit true on error$ observable if source throws an error', () => {
    dataSource.source = throwError(() => new Error());
    const unsub = '-!';
    const expectedMarbles = 'a';
    const expectedValues = {
      a: true,
    };

    testScheduler.run(({ expectObservable }: RunHelpers) => {
      expectObservable(dataSource.error$, unsub).toBe(expectedMarbles, expectedValues);
    });
  });

  it('emit false on error$ observable every time source completes without error', () => {
    dataSource.source = of(1);
    const unsub = '---!';
    const expectedMarbles = 'aba';
    const expectedValues = {
      a: false,
      b: true,
    };

    const triggerMarbles = '-cd';
    const triggerValues = {
      c: (): void => {
        dataSource.source = throwError(() => new Error());
      },
      d: (): void => {
        dataSource.source = of(1);
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.error$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  // Set refresh interval tests
  it('set interval.refreshInterval on set refreshInterval', () => {
    dataSource.refreshInterval = 2;
    expect(intervalSpy.refreshInterval).toBe(2);
  });

  // Clear data
  it('clear data$ observable on clearData action', () => {
    dataSource.source = of(1);
    const unsub = '--!';
    const expectedMarbles = 'ab';
    const expectedValues = {
      a: 1,
      b: null,
    };

    const triggerMarbles = '-c';
    const triggerValues = {
      c: (): void => {
        dataSource.clearData();
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.data$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  // Reset tests
  it('toggle initialState to true on reset action', () => {
    dataSource.source = of(1);
    const unsub = '--!';
    const expectedMarbles = 'ab';
    const expectedValues = {
      a: false,
      b: true,
    };

    const triggerMarbles = '-c';
    const triggerValues = {
      c: (): void => {
        dataSource.reset();
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.initialState$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('reset data$ to null on reset action', () => {
    dataSource.source = of(1);
    const unsub = '--!';
    const expectedMarbles = 'ab';
    const expectedValues = {
      a: 1,
      b: null,
    };

    const triggerMarbles = '-c';
    const triggerValues = {
      c: (): void => {
        dataSource.reset();
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.data$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('signal reset action through reset$ observable', () => {
    const unsub = '-!';
    const expectedMarbles = 'a';
    const expectedValues = {
      a: undefined,
    };

    const triggerMarbles = 'b';
    const triggerValues = {
      b: (): void => {
        dataSource.reset();
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.reset$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  // Refresh tests
  it('call interval.refresh on refresh action', () => {
    dataSource.refresh();
    expect(intervalSpy.refresh).toHaveBeenCalled();
  });

  it('call interval.refresh on resetAndRefresh action and signal it through resetAndRefresh$ observable', () => {
    const unsub = '-!';
    const expectedMarbles = 'a';
    const expectedValues = {
      a: undefined,
    };

    const triggerMarbles = 'b';
    const triggerValues = {
      b: (): void => {
        dataSource.resetAndRefresh();
      },
    };

    testScheduler.run(({ expectObservable, cold, flush }: RunHelpers) => {
      expectObservable(dataSource.resetAndRefresh$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
      flush();
      expect(intervalSpy.refresh).toHaveBeenCalled();
    });
  });
});
