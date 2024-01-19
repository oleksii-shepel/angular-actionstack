import { Action, isAction } from 'redux-replica';
import { EMPTY, Observable, OperatorFunction, concatMap, filter, from, ignoreElements, merge, mergeMap, of, tap, toArray, withLatestFrom } from 'rxjs';
import { EnhancedStore, SideEffect } from './types';


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

export function dispatchAction(store: EnhancedStore, actionStack: ActionStack): OperatorFunction<Action<any>, void> {
  return (source: Observable<Action<any>>) =>
    source.pipe(
      concatMap((action: Action<any>) => {
        // Call the reducer for the action
        store.pipeline.reducer(store.currentState.value, action);

        // Execute side effects and get an Observable of child actions
        let action$ = of(action);
        let state$ = of(store.currentState.value);

        return runSideEffectsSequentially(store.pipeline.effects)([action$, state$]).pipe(
          concatMap((childActions: Action<any>[]) => {
            // Push child actions to the stack
            if (childActions.length > 0) {
              return from(childActions).pipe(
                tap((nextAction: Action<any>) => store.dispatch(nextAction))
              );
            }

            return EMPTY;
          })
        );
      }),
      ignoreElements() // Ignore all elements and only pass along termination notification
    );
}



///////////////////////////////////////////////////////////////////////
//
//
///////////////////////////////////////////////////////////////////////

export class ActionStack {
  private stack: Action<any>[][] = [];

  get length(): number {
    return this.stack.length;
  }

  push(actions: Action<any>[]): void {
    if (!this.stack.length || Object.isSealed(this.stack[this.stack.length - 1])) {
      this.stack.push([]);
    }
    this.stack[this.stack.length - 1] = [...this.stack[this.stack.length - 1], ...actions];
  }

  seal(): void {
    Object.seal(this.stack[this.stack.length - 1]);
  }

  pop(): Action<any>[] | undefined {
    return this.stack.pop();
  }
}
