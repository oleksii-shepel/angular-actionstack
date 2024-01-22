import { Action, isAction } from 'redux-replica';
import { Observable, OperatorFunction, concatMap, filter, from, merge, mergeMap, toArray, withLatestFrom } from 'rxjs';
import { SideEffect } from './types';


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
    Object.defineProperty(merger, 'name', { value: `combine(${effects.map((epic) => epic.name || '<anonymous>').join(', ')})` });
  } catch (e) {}

  return merger;
}


export function runSideEffectsSequentially(sideEffects: SideEffect[]) {
  return ([action$, state$]: [Observable<Action<any>>, Observable<any>]) =>
    action$.pipe(
      withLatestFrom(state$),
      concatMap(([action, state]) =>
        from(sideEffects).pipe(
          concatMap((sideEffect: SideEffect) => sideEffect(action$, state$))
        )
      ),
      toArray()
    );
}


export function runSideEffectsInParallel(sideEffects: SideEffect[]) {
  return ([action$, state$]: [Observable<Action<any>>, Observable<any>]) =>
    action$.pipe(
      withLatestFrom(state$),
      mergeMap(([action, state]) =>
        from(sideEffects).pipe(
          mergeMap((sideEffect: SideEffect) => sideEffect(action$, state$))
        )
      ),
      toArray()
    );
}




export class ActionStack {
  private stack: Action<any>[] = [];

  get length(): number {
    return this.stack.length;
  }

  push(action: Action<any>): void {
    this.stack.push(action);
  }

  pop(): Action<any> | undefined {
    return this.stack.pop();
  }

  clear() : void {
    this.stack = [];
  }

  get actions() {
    return this.stack;
  }
}
