import { Action, action, Epic, isAction } from '@actioncrew/actionstack';
import { Subject } from 'rxjs/internal/Subject';
import { BehaviorSubject } from 'rxjs/internal/BehaviorSubject';
import { Observable } from 'rxjs/internal/Observable';
import { Subscription } from 'rxjs/internal/Subscription';

import { ExecutionStack, OperationType } from './stack';

/**
 * Concatenates multiple source Observables sequentially.
 *
 * @template T The type of the elements in the source Observables.
 * @param {...Observable<T>[]} sources The source Observables to concatenate.
 * @returns {Observable<T>} An Observable that emits values from the source Observables in order as they are concatenated.
 */
export function concat<T>(stack: ExecutionStack, ...sources: Observable<T>[]): Observable<T> {
  return new Observable<T>(subscriber => {
    let index = 0;
    let subscription: Subscription | null = null;

    const next = () => {
      if (subscriber.closed) {
        return;
      }

      if (index < sources.length) {
        const source = sources[index++];
        let effect = {operation: OperationType.EPIC, instance: source}
        stack.push(effect);
        subscription = source.subscribe({
          next: value => subscriber.next(Object.assign({}, value, {source: effect})),
          error: error => {
            subscriber.error(error);
            stack.pop(effect);
          },
          complete: () => {
            subscription = null;
            stack.pop(effect);
            next();
          }
        });
      } else {
        subscriber.complete();
      }
    };

    next();

    return () => {
      // Unsubscribe if a source Observable is currently being subscribed to
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  });
}

/**
 * Combines multiple source Observables into one Observable that emits all the values from each of the source Observables.
 *
 * @template T The type of the elements in the source Observables.
 * @param {...Observable<T>[]} sources The source Observables to merge.
 * @returns {Observable<T>} An Observable that emits all the values from the source Observables.
 */
export function merge<T>(stack: ExecutionStack, ...sources: Observable<T>[]): Observable<T> {
  return new Observable<T>(subscriber => {
    let completedCount = 0;
    let subscriptions: Subscription[] = [];

    const completeIfAllCompleted = () => {
      if (++completedCount === sources.length) {
        subscriber.complete();
      }
    };

    sources.forEach(source => {
      let effect = {operation: OperationType.EPIC, instance: source};
      stack.push(effect);
      const subscription = source.subscribe({
        next: value => subscriber.next(Object.assign({}, value, {source: effect})),
        error: error => {
          // Unsubscribe from all source Observables when an error occurs
          if (subscriptions.length) {
            subscriptions.forEach(subscription => subscription.unsubscribe());
            subscriptions = [];
          }
          subscriber.error(error);
          stack.pop(effect);
        },
        complete: () => { stack.pop(effect); completeIfAllCompleted(); }
      });

      subscriptions.push(subscription);
    });

    return () => {
      // Unsubscribe from all source Observables when the resulting Observable is unsubscribed
      if (subscriptions.length) {
        subscriptions.forEach(subscription => subscription.unsubscribe());
        subscriptions = [];
      }
    };
  });
}

/**
 * Creates an RxJS operator function that filters actions based on their type.
 *
 * @param {...string} types - A variable number of strings representing the action types to filter by.
 * @returns {OperatorFunction<Action<any>, Action<any>>} - An RxJS operator function that filters actions.
 */
export function ofType(types: string | string[]): (source: Observable<Action<any>>) => Observable<Action<any>> {
  return (source: Observable<Action<any>>) => {
    return new Observable<Action<any>>(observer => {
      const subscription = source.subscribe({
        next: (action) => {
          if (isAction(action)) {
            if (typeof types === 'string') {
              if (types === action.type) {
                observer.next(action);
              }
            } else {
              if (types.includes(action.type)) {
                observer.next(action);
              }
            }
          }
        },
        error: (err) => observer.error(err),
        complete: () => observer.complete()
      });

      return () => {
        subscription.unsubscribe();
      };
    });
  };
}

export const createEpicsMiddleware = () => {
  let activeEpics: Epic[] = [];
  let currentAction = new Subject<Action<any>>();
  let currentState = new Subject<any>();
  let subscriptions: Subscription[] = [];

  return ({ dispatch, getState, dependencies, strategy, stack }: any) => (next: any) => async (action: any) => {
    // Proceed to the next action
    const result = await next(action);

    if (action.type === 'ADD_EPICS' || action.type === 'REMOVE_EPICS') {
      if (action.type === 'ADD_EPICS') {
        action.payload.epics.forEach((epic: Epic) => {
          if (!activeEpics.includes(epic)) {
            activeEpics.push(epic);
          }
        });
      } else if (action.type === 'REMOVE_EPICS') {
        action.payload.epics.forEach((epic: Epic) => {
          const epicIndex = activeEpics.indexOf(epic);
          if (epicIndex !== -1) {
            activeEpics.splice(epicIndex, 1);
          }
        });
      }

      // Unsubscribe from the previous subscription if it exists
      if (subscriptions.length) {
        subscriptions[0].unsubscribe();
        subscriptions.shift(); // Remove the unsubscribed element from the array
      }

      let subscription: Subscription;
      // Create a new subscription
      subscription = currentAction.pipe(
        () => (strategy === "concurrent" ? merge : concat)(stack, ...activeEpics.map(sideEffect => sideEffect(currentAction, currentState, dependencies())))
      ).subscribe({
        next: (childAction: any) => {
          if (isAction(childAction)) {
            dispatch(childAction);
          }
        },
        error: (err: any) => {
          console.warn("Error in epic:", err);
          if(subscription) {
            subscription.unsubscribe()
            subscriptions = subscriptions.filter(item => item === subscription);
          }
        },
        complete: () => {
          if(subscription) {
            subscription.unsubscribe()
            subscriptions = subscriptions.filter(item => item === subscription);
          }
        }
      });

      subscriptions.push(subscription);
    }

    currentAction.next(action);
    currentState.next(getState());

    return result;
  };
};

export const epics = createEpicsMiddleware();

export const addEpics = action("ADD_EPICS", (...epics: Epic[]) => ({ epics }));
export const removeEpics = action("REMOVE_EPICS", (...epics: Epic[]) => ({ epics }));
