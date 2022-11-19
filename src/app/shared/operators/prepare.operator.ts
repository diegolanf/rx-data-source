import { defer, Observable } from 'rxjs';

/**
 * Executes callback function and returns observable
 *
 * @param callback - Callback function.
 */
export const prepare =
  <T>(callback: () => void) =>
  (source$: Observable<T>): Observable<T> =>
    defer(() => {
      callback();
      return source$;
    });
