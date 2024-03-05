import { EMPTY, Observable, OperatorFunction, concatMap, filter, from, isObservable, mergeMap, of, toArray, withLatestFrom } from 'rxjs';
import { Action, SideEffect, isAction } from "./types";


export function createEffect(
  actionType: string,
  effectFn: (action: Action<any>, state: any, dependencies: Record<string, any>) => Action<any> | Observable<Action<any>>
): SideEffect {
  return (action$: Observable<Action<any>>, state$: Observable<any>, dependencies: Record<string, any>) =>
    action$.pipe(
      filter((action) => action.type === actionType),
      withLatestFrom(state$),
      concatMap(([action, state]) => {
        try {
          const result = effectFn(action, state, dependencies);
          if (result === null || result === undefined) {
            throw new Error(`The effect for action type "${actionType}" must return an action or an observable. It currently does not return anything.`);
          }
          if (isObservable(result)) {
            return result.pipe(
              concatMap((resultAction) => {
                if (action.type === resultAction.type) {
                  throw new Error(`The effect for action type "${actionType}" may result in an infinite loop as it returns an action of the same type.`);
                }
                return of(resultAction);
              })
            );
          }
          if (result.type === action.type) {
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


export function ofType(...types: [string, ...string[]]): OperatorFunction<Action<any>, Action<any>> {
  return filter((action): action is Action<any> => {
    if (isAction(action)) {
      return types.includes(action.type);
    }
    return false;
  });
}


export function runSideEffectsSequentially(sideEffects: IterableIterator<[SideEffect, any]>) {
  return ([action$, state$]: [Observable<Action<any>>, Observable<any>]) =>
    action$.pipe(
      withLatestFrom(state$),
      concatMap(([action, state]) =>
        from(sideEffects).pipe(
          concatMap(([sideEffect, dependencies]) => sideEffect(action$, state$, dependencies))
        )
      ),
      toArray()
    );
}


export function runSideEffectsInParallel(sideEffects: IterableIterator<[SideEffect, any]>) {
  return ([action$, state$]: [Observable<Action<any>>, Observable<any>]) =>
    action$.pipe(
      withLatestFrom(state$),
      mergeMap(([action, state]) =>
        from(sideEffects).pipe(
          mergeMap(([sideEffect, dependencies]) => sideEffect(action$, state$, dependencies))
        )
      ),
      toArray()
    );
}
