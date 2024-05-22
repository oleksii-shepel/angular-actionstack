import { BehaviorSubject } from 'rxjs/internal/BehaviorSubject';
import { Observable } from 'rxjs/internal/Observable';
import { Subscription } from 'rxjs/internal/Subscription';

import { ExecutionStack, OperationType } from './stack';
import { Action, isAction } from './types';


export const EMPTY = new Observable<never>((subscriber) => {
  subscriber.complete();
});

/**
 * Projects each source value to a Promise which is merged in the output Observable
 * in a serialized fashion waiting for each one to complete before merging the next.
 *
 * @template TIn The type of the elements in the source observable sequence.
 * @template TOut The type of elements in the projected promise sequence.
 * @param {(value: TIn) => Promise<TOut>} projector A function that, when applied to an item emitted by the source Observable, returns a Promise.
 * @returns {OperatorFunction<TIn, TOut>} An operator function that sequences the promises
 * generated by applying the project function to each item emitted by the source Observable.
 */
export function concatMap<T, R>(projector: (value: T) => Promise<R>) {
  return (source: Observable<T>) => new Observable<R>(subscriber => {
    let isProcessing = false;
    let queue: T[] = [];

    const next = () => {
      if (queue.length > 0 && !isProcessing) {
        isProcessing = true;
        const value = queue.shift()!;
        projector(value)
          .then(result => {
            subscriber.next(result as any);
            isProcessing = false;
            if (queue.length > 0) {
              next();
            }
          })
          .catch(error => {
            subscriber.error(error);
            isProcessing = false;
          });
      }
    };

    const subscription = source.subscribe({
      next: (value: T) => {
        queue.push(value);
        next();
      },
      error: (err: Error) => subscriber.error(err),
      complete: () => {
        if (!queue.length && !isProcessing) {
          subscriber.complete();
        }
      },
    });

    return () => {
      subscription.unsubscribe();
    };
  });
}

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
        let effect = {operation: OperationType.EFFECT, instance: source}
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
      let effect = {operation: OperationType.EFFECT, instance: source};
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
 * Waits for a condition to be met in an observable stream.
 * @param {Observable<any>} obs - The observable stream to wait for.
 * @param {(value: any) => boolean} predicate - The predicate function to evaluate the values emitted by the observable stream.
 * @returns {Promise<boolean>} A promise that resolves to true when the predicate condition is met, or false if the observable completes without satisfying the predicate.
 */
export function waitFor<T>(obs: Observable<T>, predicate: (value: T) => boolean): Promise<T> {
  let subscription: Subscription | undefined;

  return new Promise<T>((resolve, reject) => {
    const checkInitialValue = (obs as BehaviorSubject<T>)?.value;
    if (checkInitialValue !== undefined && predicate(checkInitialValue)) {
      return resolve(checkInitialValue);
    }

    subscription = obs.subscribe({
      next: value => {
        if (predicate(value)) {
          if (subscription) {
            subscription.unsubscribe();
          }
          resolve(value);
        }
      },
      error: err => reject(err),
      complete: () => {
        reject("Method had completed before predicate condition was met");
      },
    });
  }).finally(() => {
    if (subscription && !subscription.closed) {
      subscription.unsubscribe();
    }
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

