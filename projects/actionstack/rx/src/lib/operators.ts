import { GroupSubscription, Observable, Observer, Subscriber, Subscription } from "./rx";


export interface OperatorFunction<T, U> {
  (source: Observable<T>): Observable<U>;
}


export function map<T, U>(transformFn: (value: T) => U): (source: Observable<T>) => Observable<U> {
  return function mapOperator(source: Observable<T>): Observable<U> {
    return new Observable(observer => {
      const subscription = source.subscribe({
        next: (value: T) => {
          try {
            const transformedValue = transformFn(value);
            observer.next(transformedValue);
          } catch (error: any) {
            observer.error(error);
          }
        },
        error: (error: any) => observer.error(error),
        complete: () => observer.complete()
      } as Subscriber<T>);

      return subscription;
    });
  };
}

export function filter<T>(predicate: (value: T) => boolean): OperatorFunction<T, T> {
  return function filterOperator(source: Observable<T>): Observable<T> {
    return new Observable(observer => {
      const subscription = source.subscribe({
        next(value: T) {
          try {
            if (predicate(value)) {
              observer.next(value);
            }
          } catch (error: any) {
            observer.error(error);
          }
        },
        error(error: any) {
          observer.error(error);
        },
        complete() {
          observer.complete();
        }
      } as Subscriber<T>);

      return subscription;
    });
  };
}

export function mergeMap<T, U>(transformFn: (value: T) => Observable<U>): OperatorFunction<T, U> {
  return function mergeMapOperator(source: Observable<T>): Observable<U> {
    return new Observable(observer => {
      const groupSubscription = new GroupSubscription(); // Use GroupSubscription
      let active = 0;

      const innerObserver = {
        next(innerValue: U) {
          observer.next(innerValue);
        },
        error(error: any) {
          observer.error(error);
        },
        complete() {
          if (--active === 0 && groupSubscription.isClosed()) {
            observer.complete();
          }
        }
      };

      const sourceSubscription = source.subscribe({
        next(value: T) {
          try {
            const innerObservable = transformFn(value);
            active++; // Increment active count before inner subscription
            groupSubscription.add(innerObservable.subscribe(innerObserver as Subscriber<U>)); // Use GroupSubscription
          } catch (error: any) {
            observer.error(error);
          }
        },
        error(error: any) {
          observer.error(error);
        },
        complete() {
          if (--active === 0 && groupSubscription.isClosed()) {
            observer.complete();
          }
        }
      } as any);

      return groupSubscription; // Return the GroupSubscription for cleanup
    });
  };
}

export function concatMap<T, U>(transformFn: (value: T) => Observable<U>): OperatorFunction<T, U> {
  return function concatMapOperator(source: Observable<T>): Observable<U> {
    return new Observable(observer => {
      const groupSubscription = new GroupSubscription();
      let active = 0; // Track active inner subscriptions

      const innerObserver = {
        next(innerValue: U) {
          observer.next(innerValue);
        },
        error(error: any) {
          observer.error(error);
        },
        complete() {
          if (--active === 0 && groupSubscription.isClosed()) {
            observer.complete();
          }
        }
      };

      const sourceSubscription = source.subscribe({
        next(value: T) {
          try {
            const innerObservable = transformFn(value);
            if (!innerObservable) {
              return;
            }
            active++; // Increment active count before subscribing
            groupSubscription.add(innerObservable.subscribe(innerObserver as Subscriber<U>));
          } catch (error: any) {
            observer.error(error);
          }
        },
        error(error: any) {
          observer.error(error);
        },
        complete() {
          if (--active === 0 && groupSubscription.isClosed()) {
            observer.complete();
          }
        }
      } as Subscriber<T>);

      return groupSubscription;
    });
  };
}

export function fromPromise<T>(promise: Promise<T>): Observable<T> {
  return new Observable(observer => {
    promise.then(
      value => {
        observer.next(value);
        observer.complete();
      },
      error => {
        observer.error(error);
      }
    );

    return new Subscription(() => {});
  });
}

export function fromArray<T>(array: T[]): Observable<T> {
  return new Observable(observer => {
    for (const value of array) {
      observer.next(value);
    }
    observer.complete();

    return new Subscription(() => {});
  });
}


export function of<T>(...args: T[]): Observable<T> {
  return new Observable(observer => {
    for (const value of args) {
      observer.next(value);
    }
    observer.complete();
    return new Subscription(() => {});
  });
}


export function scan<T, U>(accumulator: (acc: U, value: T) => U, seed?: U): OperatorFunction<T, U> {
  return function scanOperator(source: Observable<T>): Observable<U> {
    return new Observable(observer => {
      let hasSeed = arguments.length > 1;
      let acc: U;

      const subscription = source.subscribe({
        next(value: T) {
          if (!hasSeed) {
            hasSeed = true;
            acc = value as any; // Cast seed if not provided
            observer.next(acc);
            return;
          }
          acc = accumulator(acc, value);
          observer.next(acc);
        },
        error(error: any) {
          observer.error(error);
        },
        complete() {
          observer.complete();
        }
      } as Subscriber<T>);

      return subscription;
    });
  };
}

function tap<T>(
  nextOrObserver: Observer<T> | ((value: T) => void)
): OperatorFunction<T, T> {
  return function tapOperator(source: Observable<T>): Observable<T> {
    return new Observable(observer => {
      const tapObserver =
        typeof nextOrObserver === 'function'
          ? { next: nextOrObserver }
          : nextOrObserver;

      const sourceSubscription = source.subscribe({
        next(value: T) {
          tapObserver.next && tapObserver.next(value);
          observer.next(value);
        },
        error(error: any) {
          observer.error(error);
        },
        complete() {
          observer.complete();
        }
      } as Subscriber<T>);

      return sourceSubscription;
    });
  };
}

export function finalize<T>(callback: () => void): OperatorFunction<T, T> {
  return function finalizeOperator(source: Observable<T>): Observable<T> {
    return new Observable(observer => {
      const subscription = source.subscribe({
        next(value: T) {
          observer.next(value);
        },
        error(error: any) {
          observer.error(error);
        },
        complete() {
          observer.complete();
          try {
            callback();
          } catch (err) {
            console.error('Error in finalize callback:', err);
          }
        }
      } as Subscriber<T>);

      return new Subscription(() => {
        subscription.unsubscribe();
        try {
          callback();
        } catch (err) {
          console.error('Error in finalize callback on unsubscribe:', err);
        }
      });
    });
  };
}

export function catchError<T>(selector: (error: any, caught: Observable<T>) => Observable<T>): OperatorFunction<T, T> {
  return function catchErrorOperator(source: Observable<T>): Observable<T> {
    return new Observable(observer => {
      const subscription = source.subscribe({
        next(value: T) {
          observer.next(value);
        },
        error(error: any) {
          let result: Observable<T>;
          try {
            result = selector(error, source);
          } catch (err: any) {
            observer.error(err);
            return; // Exit early if error occurs within selector
          }
          if (!result) { // Check if result is null or undefined (potential error)
            observer.error(error);
          } else {
            result.subscribe(observer);
          }
        },
        complete() {
          observer.complete();
        }
      } as Subscriber<T>);

      return subscription;
    });
  };
}

export function ignoreElements<T>(): OperatorFunction<T, never> {
  return function ignoreElementsOperator(source: Observable<T>): Observable<never> {
    return new Observable(observer => {
      const subscription = source.subscribe({
        next() {}, // Ignore values
        error(error: any) {
          observer.error(error);
        },
        complete() {
          observer.complete();
        }
      } as any);

      return subscription;
    });
  };
}

export function distinctUntilChanged<T>(comparator?: (previous: T, current: T) => boolean): OperatorFunction<T, T> {
  return function distinctUntilChangedOperator(source: Observable<T>): Observable<T> {
    return new Observable(observer => {
      let hasValue = false;
      let lastValue: T | undefined;

      const subscription = source.subscribe({
        next(value: T) {
          const comparison = !hasValue || (comparator ? comparator(lastValue!, value) : value !== lastValue);
          if (comparison) {
            observer.next(value);
            hasValue = true;
            lastValue = value;
          }
        },
        error(error: any) {
          observer.error(error);
        },
        complete() {
          observer.complete();
        }
      } as Subscriber<T>);

      return subscription;
    });
  };
}

export function withLatestFrom<T, A>(...observables: Observable<A>[]): OperatorFunction<T, [T, ...A[]] | T> {
  return function withLatestFromOperator(source: Observable<T>): Observable<[T, ...A[]] | T> {
    return new Observable(observer => {
      const n = observables.length;
      const values = new Array(n);
      let hasValue = false;

      const subscriptions: Subscription[] = [];
      let completed = 0;

      for (let i = 0; i < n; i++) {
        const innerSub = observables[i].subscribe({
          next(value: A) {
            values[i] = value;
            hasValue = true;
          },
          error(error: any) {
            observer.error(error);
          },
          complete() {
            completed++;
            if (completed === n) {
              observer.complete();
            }
          }
        } as Subscriber<A>);
        subscriptions.push(innerSub);
      }

      const sourceSub = source.subscribe({
        next(value: T) {
          if (hasValue) {
            observer.next([value, ...values]);
          }
        },
        error(error: any) {
          observer.error(error);
        },
        complete() {
          observer.complete();
        }
      } as Subscriber<T>);

      return new Subscription(() => {
        subscriptions.forEach(sub => sub.unsubscribe());
        sourceSub.unsubscribe();
      });
    });
  };
}


export function replayLast<T>() {
  let lastValue: T | undefined;
  let hasValue = false;

  return function replayLastOperator(source: Observable<T>): Observable<T> {
    return new Observable(observer => {
      const subscription = source.subscribe({
        next(value: T) {
          lastValue = value;
          hasValue = true;
        },
        error(error: any) {
          observer.error(error);
        },
        complete() {
          observer.complete();
        }
      } as Subscriber<T>);

      return subscription;
    })
    .pipe(
      // Inner observable to emit the last value only if it exists
      filter(() => hasValue),
      map(() => lastValue!) // Cast lastValue to non-nullable type for clarity
    );
  };
}
