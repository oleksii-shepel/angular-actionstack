import { Observable } from "rxjs/internal/Observable";
import { Subscription } from 'rxjs/internal/Subscription';

import { Action, SideEffect, isObservable } from "./types";

export { createEffect as effect };

/**
 * Creates a higher-order function (HOF) for defining and managing side effects in Actionstack applications.
 *
 * @param {string | string[]} actionType - This can be either a string representing a single action type
 *                                          or an array of strings representing multiple action types.
 * @param {Function} effectFn  - This function defines the actual side effect logic.
 *                               It takes three arguments:
 *                                   * `action$` (Observable<Action<any>>): The action object that triggered the effect.
 *                                   * `state$` (Observable<any>): The current state of the Actionstack store.
 *                                   * `dependencies` (Record<string, any>): An object containing any additional dependencies required by the effect function.
 * @returns {Function}         - A function that can be used to register the side effect.
 *
 * This function helps manage side effects by creating an HOF that simplifies defining and registering them
 * based on action types dispatched in a Actionstack application.
 */

function createEffect(
  actionType: string[] | string,
  effectFn: (...args: any[]) => (actionType: any) => SideEffect
) {
  return (...args: any[]) => (action$: Observable<Action<any>>, state$?: Observable<any>, dependencies?: Record<string, any>) => {
    return new Observable<Action<any>> ((observer) => {
      let innerSubscription: Subscription;
      try {
        const result = effectFn(...args)(actionType)(action$, state$!, dependencies!) as Observable<Action<any>>;
        if (result === null || result === undefined) {
          console.warn(`The effect must return an observable. It currently does not return anything.`);
          return;
        }
        if (isObservable(result)) {
          innerSubscription = result.subscribe({
            next(resultAction) {
              if (actionType === resultAction?.type) {
                console.warn(`The effect for action type "${actionType}" may result in an infinite loop as it returns an observable with action of the same type.`);
                return;
              }
              observer.next(resultAction);
            },
            error(err) {
              console.warn(`Error in effect: ${err.message}`);
              observer.complete();
            }
          });
        }
      } catch (error: any) {
        console.warn(`Error in effect: ${error.message}`);
        observer.complete();
      }

      // Unsubscribe when the effect is done
      return () => {
        if (innerSubscription) {
          innerSubscription.unsubscribe();
        }
      };
    });
  }
}
