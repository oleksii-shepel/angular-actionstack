import { Observable, Subscriber } from "./rx";


export interface OperatorFunction<T> {
  (source: Observable<T>): Observable<T>;
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

export function filter<T>(predicate: (value: T) => boolean): OperatorFunction<T> {
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
