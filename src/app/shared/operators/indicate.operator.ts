import { RxState } from '@rx-angular/state';
import { defer, finalize, Observable } from 'rxjs';

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

/**
 * Sets loading state to true while observable is active.
 *
 * @param state: RxState containing a loading state
 */
export const indicate =
  <StateType extends { loading: boolean }, ResponseType>(state: RxState<StateType>) =>
  (source$: Observable<ResponseType>): Observable<ResponseType> =>
    source$.pipe(
      prepare(() => state.set('loading', () => true)),
      finalize(() => state.set('loading', () => false))
    );
