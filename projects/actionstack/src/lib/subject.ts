import { Observable, Subject, Subscription, multicast } from 'rxjs';

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

export class CustomAsyncSubject<T> extends AsyncObservable<T> {
  private _value!: T;
  // property to store the multicast observable
  private multicastObservable: ConnectableObservable<T>;
  
  constructor(initialValue: T) {
    super();
    this._value = initialValue;
  }
  
  // method to create the multicast observable
  private createMulticastObservable(): ConnectableObservable<T> {
    // use the multicast operator to create a multicast observable
    // pass a subject or a subject factory function as an argument
    return this.pipe(
      multicast(new Subject())
    ) as ConnectableObservable<T>;
  }

  // method to access the multicast observable
  asObservable(): Observable<T> {
    // check if the multicast observable exists
    if (!this.multicastObservable) {
      // create the multicast observable if not
      this.multicastObservable = this.createMulticastObservable();
      // call the connect method to start the source observable
      this.multicastObservable.connect();
    }
    // return the multicast observable as a regular observable
    return this.multicastObservable as Observable<T>;
  }

  // modify the subscribe method to use the multicast observable
  override subscribe(observer: Partial<AsyncObserver<T>>): Subscription {
    // use the asObservable method to get the multicast observable
    const observable = this.asObservable();
    // subscribe to the multicast observable with the observer
    return observable.subscribe(observer as AsyncObserver<T>);
  }

  async next(value: T): Promise<void> {
    this._value = value;
    await this.notify(value);
  }

  get value(): T {
    return this._value;
  }
}
