import { Observable, OperatorFunction, concat, concatMap, filter, from, ignoreElements, isObservable, merge, mergeMap, of, toArray, withLatestFrom } from 'rxjs';
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
        if(result === null || result === undefined) {
          throw new Error("Effect has to return an action or an observable. Instead it does not return anything.");
        }
        else if (!isObservable(result)) {
          if (result === action) {
            return of(result).pipe(ignoreElements());
          } else {
            return of(result);
        }
        } else {
          return result;
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


export function combine(strategy: 'exclusive' | 'concurrent', ...effects: SideEffect[]): SideEffect {
  const merger: SideEffect = (...args) => {
    const observables = effects.map((effect) => {
      const output$ = effect(...args);
      if (!output$) throw new TypeError(`combine: one of the provided effects "${effect.name || '<anonymous>'}" does not return a stream. Double check you're not missing a return statement!`);
      return output$;
    });

    return strategy === 'concurrent' ? merge(...observables): concat(...observables);
  };

  try {
    Object.defineProperty(merger, 'name', { value: `combine(${effects.map((effect) => effect.name || '<anonymous>').join(', ')})` });
  } catch (e) {}

  return merger;
}



export function runSideEffectsSequentially(sideEffects: SideEffect[], dependencies: Record<string, any>) {
  return ([action$, state$]: [Observable<Action<any>>, Observable<any>]) =>
    action$.pipe(
      withLatestFrom(state$),
      concatMap(([action, state]) =>
        from(sideEffects).pipe(
          concatMap((sideEffect: SideEffect) => sideEffect(action$, state$, dependencies))
        )
      ),
      toArray()
    );
}


export function runSideEffectsInParallel(sideEffects: SideEffect[], dependencies: Record<string, any>) {
  return ([action$, state$]: [Observable<Action<any>>, Observable<any>]) =>
    action$.pipe(
      withLatestFrom(state$),
      mergeMap(([action, state]) =>
        from(sideEffects).pipe(
          mergeMap((sideEffect: SideEffect) => sideEffect(action$, state$, dependencies))
        )
      ),
      toArray()
    );
}




