import { Observable } from 'rxjs/internal/Observable';
import { Subscription } from 'rxjs/internal/Subscription';

import { Action, Epic, isObservable } from './types';

export { createEffect as epic };

/**
 * Creates a higher-order function (HOF) for defining and managing side epics in Actionstack applications.
 *
 * @param {string | string[]} actionType - This can be either a string representing a single action type
 *                                          or an array of strings representing multiple action types.
 * @param {Function} epicFn  - This function defines the actual side epic logic.
 *                               It takes three arguments:
 *                                   * `action$` (Observable<Action<any>>): The action object that triggered the epic.
 *                                   * `state$` (Observable<any>): The current state of the Actionstack store.
 *                                   * `dependencies` (Record<string, any>): An object containing any additional dependencies required by the epic function.
 * @returns {Function}         - A function that can be used to register the side epic.
 *
 * This function helps manage side epics by creating an HOF that simplifies defining and registering them
 * based on action types dispatched in a Actionstack application.
 */

function createEffect(
  actionType: string[] | string,
  epicFn: (actionType: any) => Epic
) {
  return (action$: Observable<Action<any>>, state$?: Observable<any>, dependencies?: Record<string, any>) => {
    return new Observable<Action<any>> ((observer) => {
      let innerSubscription: Subscription;
      try {
        const result = epicFn(actionType)(action$, state$!, dependencies!) as Observable<Action<any>>;
        if (result === null || result === undefined) {
          console.warn(`The epic must return an observable. It currently does not return anything.`);
          return;
        }
        if (isObservable(result)) {
          innerSubscription = result.subscribe({
            next(resultAction) {
              if (actionType === resultAction?.type) {
                console.warn(`The epic for action type "${actionType}" may result in an infinite loop as it returns an observable with action of the same type.`);
                return;
              }
              observer.next(resultAction);
            },
            error(err) {
              console.warn(`Error in epic: ${err.message}`);
              observer.complete();
            }
          });
        }
      } catch (error: any) {
        console.warn(`Error in epic: ${error.message}`);
        observer.complete();
      }

      // Unsubscribe when the epic is done
      return () => {
        if (innerSubscription) {
          innerSubscription.unsubscribe();
        }
      };
    });
  }
}
