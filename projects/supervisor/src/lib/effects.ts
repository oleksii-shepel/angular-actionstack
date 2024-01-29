import { Observable, OperatorFunction, concatMap, filter, from, ignoreElements, merge, mergeMap, toArray, withLatestFrom } from 'rxjs';
import { Action, SideEffect, isAction } from "./types";


export function createEffect(
  actionType: string, // The action type to listen for
  effectFn: (action: Action<any>, state: any, dependencies: Record<string, any>) => Observable<Action<any>> // The function that performs the side effect and returns an action observable
): SideEffect {
  return (action$: Observable<Action<any>>, state$: Observable<any>, dependencies: Record<string, any>) =>
    action$.pipe(
      filter((action) => action.type === actionType), // Filter the actions by the given type
      withLatestFrom(state$), // Combine the action with the latest state
      concatMap(([action, state]) => {
        // Call the effect function and switch to the result
        const result$ = effectFn(action, state, dependencies);
        // Check if the result is equal to the action
        return result$.pipe(
          filter((result) => result !== action), // Filter out the result if it is equal to the action
          ignoreElements() // Ignore the elements if the result is empty
        );
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


export function combine(...effects: SideEffect[]): SideEffect {
  const merger: SideEffect = (...args) => merge(...effects.map((effect) => {
    const output$ = effect(...args);
    if (!output$) throw new TypeError(`combine: one of the provided effects "${effect.name || '<anonymous>'}" does not return a stream. Double check you're not missing a return statement!`);
    return output$;
  }));

  try {
    Object.defineProperty(merger, 'name', { value: `combine(${effects.map((effect) => effect.name || '<anonymous>').join(', ')})` });
  } catch (e) {}

  return merger;
}


export function runSideEffectsSequentially(sideEffects: SideEffect[]) {
  return ([action$, state$]: [Observable<Action<any>>, Observable<any>]) =>
    action$.pipe(
      withLatestFrom(state$),
      concatMap(([action, state]) =>
        from(sideEffects).pipe(
          concatMap((sideEffect: SideEffect) => sideEffect(action$, state$, {}))
        )
      ),
      toArray()
    );
}


export function runSideEffectsInParallel(sideEffects: SideEffect[]) {
  return ([action$, state$]: [Observable<Action<any>>, Observable<any>]) =>
    action$.pipe(
      withLatestFrom(state$),
      concatMap(([action, state]) =>
        from(sideEffects).pipe(
          mergeMap((sideEffect: SideEffect) => sideEffect(action$, state$, {}))
        )
      ),
      toArray()
    );
}




