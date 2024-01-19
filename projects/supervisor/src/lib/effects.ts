import { Action, isAction } from 'redux-replica';
import { EMPTY, Observable, OperatorFunction, concatMap, filter, finalize, from, ignoreElements, merge, mergeMap, of, tap, toArray, withLatestFrom } from 'rxjs';
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

  actionStack.clear();

  return (source: Observable<Action<any>>) =>
    source.pipe(
      concatMap((action: Action<any>) => {
        // Push the parent action to the stack
        actionStack.push(action);

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
                tap((action) => actionStack.push(action)),
                tap((nextAction: Action<any>) => store.dispatch(nextAction)),
                finalize(() => {
                  // Pop the child action from the stack once it has been dispatched
                  actionStack.pop();
                })
              );
            }

            return EMPTY;
          }),
          finalize(() => {
            // Pop the parent action from the stack once all its child actions have been processed
            actionStack.pop();
          })
        );
      }),
      ignoreElements() // Ignore all elements and only pass along termination notification
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
}
