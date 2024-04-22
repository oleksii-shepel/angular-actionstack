import { OperatorFunction } from "./operators";

/**
 * A Subscription represents the ongoing execution of an Observable
 * and the possibility to cancel such execution.
 */
export class Subscription {
  constructor(public unsubscribe: () => void) {}
}


export class GroupSubscription {
  private subscriptions: Subscription[] = [];
  private closed: boolean = false;

  add(subscription: Subscription) {
    if (!this.closed) {
      this.subscriptions.push(subscription);
    } else {
      subscription.unsubscribe(); // Unsubscribe immediately if closed
    }
  }

  unsubscribe() {
    if (!this.closed) {
      this.closed = true;
      this.subscriptions.forEach(subscription => subscription.unsubscribe());
    }
  }

  // Optional: Check if this group is closed
  isClosed(): boolean {
    return this.closed;
  }
}
/**
 * A Subscriber is both an Observer and a Subscription. It wraps a given
 * Observer and enforces the Observable contract `(next)*(error|complete)?`
 * by cancelling the execution whenever error or complete occurs.
 */
export class Subscriber<T> extends Subscription {
  constructor(private observer: Observer<T>) {
    super(() => {});
  }

  next(x: T) {
    this.observer.next(x);
  }

  error(e: Error) {
    this.observer.error(e);
    this.unsubscribe();
  }

  complete() {
    this.observer.complete();
    this.unsubscribe();
  }
}

/**
 * An Observer defines functions to handle emissions from an Observable.
 */
export interface Observer<T> {
  next(value: T): void;
  error(error: Error): void;
  complete(): void;
}

/**
 * An Observable is an invokable collection of values pushed to an Observer.
 */
export class Observable<T> {
  constructor(public subscribe: (subscriber: Subscriber<T>) => Subscription) {}

  /**
   * Observable create is the only contract-abiding way of creating Observables.
   */
  static create<T>(subscribe: (subscriber: Subscriber<T>) => Subscription): Observable<T> {
    return new Observable(function internalSubscribe(observer: Observer<T>) {
      const subscriber = new Subscriber<T>(observer); // Use typed Subscriber
      const subscription = subscribe(subscriber);
      return subscription;
    });
  }

  pipe<U>(...operators: OperatorFunction<T, U>[]): Observable<U> {
    let source = this as any;
    for (const operator of operators) {
      source = operator(source);
    }
    return source;
  }
}

/**
 * A Subject is both an Observable and an Observer.
 * It is the only concept in RxJS that maintains a list of Observers.
 */
export class Subject<T> extends Observable<T> {
  private observers: Observer<T>[] = [];

  constructor() {
    super(observer => {
      this.observers.push(observer);
      return new Subscription(() => {
        const index = this.observers.indexOf(observer);
        if (index >= 0) this.observers.splice(index, 1);
      });
    });
  }

  next(x: T) {
    this.observers.forEach((observer) => observer.next(x));
  }

  error(e: Error) {
    this.observers.forEach((observer) => observer.error(e));
  }

  complete() {
    this.observers.forEach((observer) => observer.complete());
  }
}


