import { Observable, isObservable, of } from 'rxjs';
import { concatMap, filter, ignoreElements, withLatestFrom } from 'rxjs/operators';
import { Action, SideEffect } from './types';

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
