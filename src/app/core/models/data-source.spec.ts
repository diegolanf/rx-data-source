import { TestBed } from '@angular/core/testing';
import { DataSource } from '@app/core/models/data-source.model';
import { defer, delay, of, Subject, tap, throwError } from 'rxjs';
import { RunHelpers, TestScheduler } from 'rxjs/internal/testing/TestScheduler';

import { Interval } from './interval.model';
import SpyObj = jasmine.SpyObj;

describe('DataSource', () => {
  let dataSource: DataSource<number>;
  let intervalSpy: SpyObj<Interval>;
  let testScheduler: TestScheduler;

  const execute$ = new Subject<void>();

  beforeEach(() => {
    intervalSpy = jasmine.createSpyObj('Interval', ['refresh'], {
      execute$: execute$,
    });

    TestBed.configureTestingModule({
      providers: [DataSource, { provide: Interval, useValue: intervalSpy }],
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
  it('should emit data$ when source is defined and after every interval.execute$', () => {
    let emit = 1;
    const unsub = '- 999ms - 999ms -!';
    const expectedMarbles = 'a 999ms b 999ms c';
    const expectedValues = {
      a: 1,
      b: 2,
      c: 3,
    };

    const triggerMarbles = 'd 999ms e 999ms e';
    const triggerValues = {
      d: (): void => {
        dataSource.source = defer(() => of(emit));
      },
      e: (): void => {
        emit++;
        execute$.next();
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.data$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should connect source with a nested observable (i.e. Observable<Observable<T>>) and emit a value for every observable emission', () => {
    const unsub = '---!';
    const expectedMarbles = 'abc';
    const expectedValues = {
      a: 1,
      b: 2,
      c: 3,
    };

    const observableMarbles = 'def';
    const observableValues = {
      d: of(1),
      e: of(2),
      f: of(3),
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.data$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(
        cold('z', {
          z: (): void => {
            dataSource.connectSource(cold(observableMarbles, observableValues));
          },
        }).pipe(tap((fn: () => void) => fn()))
      );
    });
  });

  it('should not emit consecutively repeated values from source on data$ observable', () => {
    const unsub = '- 999ms - 999ms - 999ms -!';
    const sourceMarbles = 'a 999ms b 999ms b 999ms c|';
    const expectedMarbles = 'a 999ms b 999ms - 999ms c';
    const values = { a: 1, b: 2, c: 3 };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      dataSource.source = cold(sourceMarbles, values);
      expectObservable(dataSource.data$, unsub).toBe(expectedMarbles, values);
    });
  });

  it('should keep listening to active source until it completes and emit a response for each different value', () => {
    const unsub = '- 999ms - 999ms - 999ms -!';
    const sourceMarbles = 'a 999ms b 999ms c 999ms d|';
    const expectedMarbles = 'a 999ms b 999ms c 999ms d';
    const values = { a: 1, b: 2, c: 3, d: 4 };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      dataSource.source = cold(sourceMarbles, values);
      expectObservable(dataSource.data$, unsub).toBe(expectedMarbles, values);
    });
  });

  it('should emit data$ only after source completes successfully if it is interrupted by an execute$ emission', () => {
    const unsub = '- 49ms - 99ms -!';
    const expectedMarbles = '- 49ms - 99ms a';
    const expectedValues = {
      a: 1,
    };

    const triggerMarbles = 'b 49ms c';
    const triggerValues = {
      b: (): void => {
        dataSource.source = of(1).pipe(delay(100));
      },
      c: (): void => {
        execute$.next();
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.data$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should emit a response immediately from new source when updating it', () => {
    const unsub = '- 999ms -!';
    const expectedMarbles = 'a 999ms b';
    const expectedValues = {
      a: 1,
      b: 2,
    };

    const triggerMarbles = 'c 999ms d';
    const triggerValues = {
      c: (): void => {
        dataSource.source = of(1);
      },
      d: (): void => {
        dataSource.source = of(2);
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.data$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  // Loading observables tests
  it('should toggle loading$ observable every time source observable is active', () => {
    const unsub = '- 3s !';
    const expectedMarbles = '(ba) 96ms b 899ms a 99ms b 899ms a 99ms b 899ms a';
    const expectedValues = {
      a: true,
      b: false,
    };

    const triggerMarbles = 'c 999ms d 999ms d 999ms d';
    const triggerValues = {
      c: (): void => {
        dataSource.source = of(1).pipe(delay(100));
      },
      d: (): void => {
        execute$.next();
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.loading$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should toggle firstLoading$ observable while source observable is active, but only before data is retrieved for the first time', () => {
    const unsub = '2500ms - !';
    /**
     * Toggles at 50ms - i.e. "(ba)" - due to interruption from first execute$ emission.
     * No emission after data is retrieved for the first time.
     */
    const expectedMarbles = '(ba) 46ms (ba) 96ms b 899ms - 999ms -';
    const expectedValues = {
      a: true,
      b: false,
    };

    const triggerMarbles = 'c 49ms d 999ms d 999ms d';
    const triggerValues = {
      c: (): void => {
        dataSource.source = of(1).pipe(delay(100));
      },
      d: (): void => {
        execute$.next();
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.firstLoading$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should toggle afterFirstLoading$ observable while source observable is active, but only after data is retrieved for the first time', () => {
    const unsub = '2500ms - !';
    const expectedMarbles = 'b 49ms - 999ms a 99ms b 899ms a 99ms b';
    const expectedValues = {
      a: true,
      b: false,
    };

    const triggerMarbles = 'c 49ms d 999ms d 999ms d';
    const triggerValues = {
      c: (): void => {
        dataSource.source = of(1).pipe(delay(100));
      },
      d: (): void => {
        execute$.next();
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.afterFirstLoading$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  // Error observable tests
  it('should emit true on hasError$ observable if source throws an error', () => {
    const unsub = '-!';
    const expectedMarbles = '(ab)';
    const expectedValues = {
      a: false,
      b: true,
    };

    const triggerMarbles = 'c';
    const triggerValues = {
      c: (): void => {
        dataSource.source = throwError(() => new Error());
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.hasError$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should emit false on hasError$ observable every time source completes without error', () => {
    const unsub = '---!';
    const expectedMarbles = 'aba';
    const expectedValues = {
      a: false,
      b: true,
    };

    const triggerMarbles = 'cdc';
    const triggerValues = {
      c: (): void => {
        dataSource.source = of(1);
      },
      d: (): void => {
        dataSource.source = throwError(() => new Error());
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.hasError$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  // Set refresh interval tests
  it('should set interval.refreshInterval on set refreshInterval', () => {
    dataSource.refreshInterval = 2;
    expect(intervalSpy.refreshInterval).toBe(2);
  });

  // Clear data
  it('should clear data$ observable on clearData action', () => {
    const unsub = '---!';
    const expectedMarbles = 'ab-';
    const expectedValues = {
      a: 1,
      b: null,
    };

    const triggerMarbles = 'cdd';
    const triggerValues = {
      c: (): void => {
        dataSource.source = of(1);
      },
      d: (): void => {
        dataSource.clearData();
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.data$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  // Reset tests
  it('should toggle initialState to true on reset action', () => {
    const unsub = '-----!';
    const expectedMarbles = '(ab)a';
    const expectedValues = {
      a: true,
      b: false,
    };

    const triggerMarbles = 'c---d';
    const triggerValues = {
      c: (): void => {
        dataSource.source = of(1);
      },
      d: (): void => {
        dataSource.reset();
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.initialState$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should reset data$ to null on reset action', () => {
    const unsub = '--!';
    const expectedMarbles = 'ab';
    const expectedValues = {
      a: 1,
      b: null,
    };

    const triggerMarbles = 'cd';
    const triggerValues = {
      c: (): void => {
        dataSource.source = of(1);
      },
      d: (): void => {
        dataSource.reset();
      },
    };

    testScheduler.run(({ expectObservable, cold }: RunHelpers) => {
      expectObservable(dataSource.data$, unsub).toBe(expectedMarbles, expectedValues);
      expectObservable(cold(triggerMarbles, triggerValues).pipe(tap((fn: () => void) => fn())));
    });
  });

  it('should signal reset action through reset$ observable', () => {
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
  it('should call interval.refresh on refresh action', () => {
    dataSource.refresh();
    expect(intervalSpy.refresh).toHaveBeenCalled();
  });

  it('should call interval.refresh on resetAndRefresh action and signal it through resetAndRefresh$ observable', () => {
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
