import { Observable, OperatorFunction, concatMap, filter, from, ignoreElements, isObservable, mergeMap, of, toArray, withLatestFrom } from 'rxjs';
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
        const result = effectFn(action, state, dependencies);
        if (result === null || result === undefined) {
          throw new Error("Effect has to return an action or an observable. Instead it does not return anything.");
        }
        if (isObservable(result)) {
          return result.pipe(
            concatMap((resultAction) => {
              return resultAction === action ? of(resultAction).pipe(ignoreElements()) : of(resultAction);
            })
          );
        }
        return result === action ? of(result).pipe(ignoreElements()) : of(result);
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




