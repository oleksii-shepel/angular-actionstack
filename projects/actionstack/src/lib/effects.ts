import { EMPTY, Observable, OperatorFunction, concatMap, filter, isObservable, map, of, withLatestFrom } from 'rxjs';
import { Action, SideEffect, isAction } from "./types";

export { createEffect as effect };

/**
 * Creates a higher-order function (HOF) for defining and managing side effects in Actionstack applications.
 *
 * @param {string | string[]} actionType - This can be either a string representing a single action type
 *                                          or an array of strings representing multiple action types.
 * @param {Function} effectFn  - This function defines the actual side effect logic.
 *                               It takes three arguments:
 *                                   * `action` (Action<any>): The action object that triggered the effect.
 *                                   * `state` (any): The current state of the Actionstack store.
 *                                   * `dependencies` (Record<string, any>): An object containing any additional dependencies required by the effect function.
 * @returns {Function}         - A function that can be used to register the side effect.
 *
 * This function helps manage side effects by creating an HOF that simplifies defining and registering them
 * based on action types dispatched in a Actionstack application.
 */
function createEffect(
  actionType: string | string[],
  effectFn: (action: Action<any>, state: any, dependencies: Record<string, any>) => Action<any> | Observable<Action<any>>
): () => SideEffect {
  function effectCreator(action$: Observable<Action<any>>, state$: Observable<any>, dependencies: Record<string, any>) {
    return action$.pipe(
      ofType(actionType),
      withLatestFrom(state$),
      concatMap(([action, state]) => {
        try {
          const result = effectFn(action, state, dependencies);
          if (result === null || result === undefined) {
            throw new Error(`The effect for action type "${actionType}" must return an action or an observable. It currently does not return anything.`);
          }
          if (isObservable(result)) {
            return result.pipe(
              map((resultAction) => {
                if (action.type === resultAction?.type) {
                  throw new Error(`The effect for action type "${actionType}" may result in an infinite loop as it returns an action of the same type.`);
                }
                return resultAction;
              })
            );
          }
          if (result?.type === action.type) {
            throw new Error(`The effect for action type "${actionType}" returns an action of the same type, this can lead to an infinite loop.`);
          }
          return of(result);
        }
        catch (error: any) {
          console.warn(`Error in effect: ${error.message}`);
          return EMPTY;
        }
      })
    );
  }

  effectCreator.toString = () => `${actionType}`;
  effectCreator.trigger = actionType;
  effectCreator.match = (action: any) => isAction(action) && action.type === actionType;

  return () => effectCreator;
}

/**
 * Creates an RxJS operator function that filters actions based on their type.
 *
 * @param {...string} types - A variable number of strings representing the action types to filter by.
 * @returns {OperatorFunction<Action<any>, Action<any>>} - An RxJS operator function that filters actions.
 */
export function ofType(types: string | string[]): OperatorFunction<Action<any>, Action<any>> {
  return filter((action): action is Action<any> => {
    if (isAction(action)) {
      return typeof types === 'string' ? types === action.type : types.includes(action.type);
    }
    return false;
  });
}
