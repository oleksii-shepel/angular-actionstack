import { Observable, Subscription } from 'rxjs';

export function toObservable<T>(customAsyncSubject: CustomAsyncSubject<T>): Observable<T> {
  return new Observable<T>((subscriber) => {
    const subscription = customAsyncSubject.subscribe({
      next: async (value) => {
        subscriber.next(value);
      },
      error: async (error) => {
        subscriber.error(error);
      },
      complete: async () => {
        subscriber.complete();
      }
    });

    return () => subscription.unsubscribe();
  });
}

export type AsyncObserver<T> = {
  next: (value: T) => Promise<void>;
  error?: (error: any) => Promise<void>;
  complete?: () => Promise<void>;
};

export class AsyncObservable<T> {
  private observers: AsyncObserver<T>[] = [];

  constructor() {}

  subscribe(observer: AsyncObserver<T>): Subscription {
    this.observers.push(observer);
    return {
      unsubscribe: () => {
        const index = this.observers.indexOf(observer);
        if (index >= 0) {
          this.observers.splice(index, 1);
        }
      }
    } as Subscription;
  }

  async notify(value: T): Promise<void[]> {
    const results = await Promise.allSettled(this.observers.map(observer => observer.next(value)));

    // Count failed selectors
    const failedSelectorsCount = results.filter(result => result.status === 'rejected').length;

    // Log information about failed selectors
    if (failedSelectorsCount > 0) {
      throw new Error(`${failedSelectorsCount} selectors failed during state propagation.`);
    }

    // Resolve with an empty array to indicate successful completion (of those that succeeded)
    return [];
  }
}

export class CustomAsyncSubject<T> extends AsyncObservable<T> {
  private _value!: T;

  constructor(initialValue: T) {
    super();
    this._value = initialValue;
  }

  override subscribe(observer: Partial<AsyncObserver<T>>): Subscription {
    // Convert the unsubscribe function to a Subscription object
    return super.subscribe(observer as AsyncObserver<T>);
  }

  async next(value: T): Promise<void> {
    this._value = value;
    await this.notify(value);
  }

  get value(): T {
    return this._value;
  }
}
