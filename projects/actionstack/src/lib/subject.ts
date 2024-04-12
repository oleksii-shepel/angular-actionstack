import { Observable, Subscription, shareReplay } from 'rxjs';

/**
 * Function to convert a custom `CustomAsyncSubject` instance into a standard RxJS `Observable`.
 *
 * This function creates a new `Observable` that subscribes to the provided `CustomAsyncSubject` and replays the latest emitted value.
 *
 * @param customAsyncSubject - The `CustomAsyncSubject` instance to convert.
 * @returns Observable<T> - The resulting RxJS `Observable`.
 */
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
  }).pipe(shareReplay(1));
}

/**
 * Interface defining the signature for asynchronous observers.
 *
 * This interface specifies the callback functions for handling next values, errors, and completion events asynchronously.
 */
export type AsyncObserver<T> = {
  next: (value: T) => Promise<void>;
  error?: (error: any) => Promise<void>;
  complete?: () => Promise<void>;
};

/**
 * Class representing an asynchronous observable.
 *
 * This class provides functionalities for managing asynchronous observers and notifying them about emitted values.
 */
export class AsyncObservable<T> {
  private observers: AsyncObserver<T>[] = [];

  constructor() {}

  /**
   * Subscribes an asynchronous observer to this `AsyncObservable`.
   *
   * @param observer - The observer to subscribe.
   * @returns Subscription - An object representing the subscription.
   */
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

  /**
   * Asynchronously notifies all subscribed observers about a new value.
   *
   * This method uses `Promise.allSettled` to wait for all observer's `next` callbacks to resolve (or reject). It also logs and throws an error if some `next` callbacks fail.
   *
   * @param value - The value to notify the observers with.
   * @returns Promise<void[]> - A promise resolving to an empty array on successful notification (of successful observers).
   */
  async notify(value: T): Promise<void[]> {
    const results = await Promise.allSettled(this.observers.map(observer => observer.next(value)));

    // Count failed selectors
    const failedSelectors = (results as PromiseRejectedResult[]).filter(result => result.status === 'rejected').map(result => result.reason).slice(0, 5);

    // Log information about failed selectors
    if (failedSelectors.length > 0) {
      let receivedErrors = failedSelectors.join('\n');
      throw new Error(`${failedSelectors.length} selectors failed during state propagation.\n${receivedErrors}`);
    }

    // Resolve with an empty array to indicate successful completion (of those that succeeded)
    return [];
  }
}

/**
 * Class representing a custom asynchronous subject.
 *
 * This class inherits from `AsyncObservable` and provides additional functionalities for handling a single value and converting itself to a standard RxJS `Observable`.
 */
export class CustomAsyncSubject<T> extends AsyncObservable<T> {
  private _value!: T;
  private _observable!: Observable<T>;

  constructor() {
    super();
  }

  /**
   * Converts this `CustomAsyncSubject` to a standard RxJS `Observable`.
   *
   * This method creates an `Observable` on demand that subscribes to this subject and replays the latest emitted value (if any).
   * @returns Observable<T> - The resulting RxJS `Observable`.
   */
  asObservable() {
    this._observable = this._observable ?? toObservable<T>(this);
    return this._observable;
  }

  /**
   * Overrides the `subscribe` method from `AsyncObservable` to ensure type safety.
   *
   * This method subscribes an asynchronous observer to this subject. It casts the provided observer to the full `AsyncObserver<T>` type before subscribing.
   *
   * @param observer - The observer to subscribe.
   * @returns Subscription - An object representing the subscription.
   */
  override subscribe(observer: Partial<AsyncObserver<T>>): Subscription {
    // Convert the unsubscribe function to a Subscription object
    return super.subscribe(observer as AsyncObserver<T>);
  }

   /**
   * Asynchronously sets the internal value and notifies all subscribed observers.
   *
   * This method takes a new value (`value` of type `T`) and performs the following actions:
   *   * Updates the internal `_value` property.
   *   * Calls the `notify` method from `AsyncObservable` to asynchronously notify all subscribed observers about the new value.
   *
   * @param value - The new value to set and notify observers about.
   * @returns Promise<void> - A promise that resolves when all observers have been notified (or rejected if any observer's `next` callback fails).
   */
  async next(value: T): Promise<void> {
    this._value = value;
    await this.notify(value);
  }

  /**
   * Getter method to access the currently held value.
   *
   * @returns T - The current value stored in the subject.
   */
  get value(): T {
    return this._value;
  }
}
