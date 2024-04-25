import { Observer, Unsubscribable } from "rxjs";

export interface Subscribable<T> {
  subscribe(observer: Partial<Observer<T>> | ((value: T) => void)
  ): Unsubscribable;
}
// Custom implementation of Observable
export type Subscriber<T> = Unsubscribable & Observer<T>;
export class CustomObservable<T> implements Subscribable<T>{
  private observers: Observer<T>[] = [];

  constructor(private _subscribe?: (subscriber: Observer<T>) => void) {}

  subscribe(observer?: Partial<Observer<T>> | ((value: T) => void)): Unsubscribable {
    const fullObserver = CustomObservable.createObserver(observer);
    this.observers.push(fullObserver);

    if (this._subscribe) {
      this._subscribe(fullObserver);
    }

    return new CustomSubscription(() => {
      const index = this.observers.indexOf(fullObserver);
      if (index !== -1) {
        this.observers.splice(index, 1);
      }
    });
  }

  next(value: T): void {
    this.observers.forEach(observer => observer.next(value));
  }

  pipe(...operators: ((source: Subscribable<T>) => Subscribable<T>)[]): Subscribable<T> {
    let result: CustomObservable<T> | Subscribable<T> = this;
    for (const operator of operators) {
      result = operator(result);
    }
    return result instanceof CustomObservable ? result : this;
  }

  static createObserver<T>(observer?: Partial<Observer<T>> | ((value: T) => void)): Observer<T> {
    if (typeof observer === 'function') {
      return {
        next: observer,
        error: () => {},
        complete: () => {}
      };
    } else if (observer) {
      return {
        next: observer.next || (() => {}),
        error: observer.error || (() => {}),
        complete: observer.complete || (() => {})
      };
    } else {
      return {
        next: () => {},
        error: () => {},
        complete: () => {}
      };
    }
  }
}

export class CustomSubscription implements Unsubscribable {
  closed: boolean = false;
  private subscriptions: Unsubscribable[] = [];

  constructor(private unsubscribeAction?: () => void) {}

  unsubscribe(): void {
    if (!this.closed && this.unsubscribeAction) {
      this.unsubscribeAction();
      this.closed = true;
    }
    this.subscriptions.forEach(subscription => subscription.unsubscribe());
  }

  add(subscription: Unsubscribable): void {
    this.subscriptions.push(subscription);
  }

  remove(subscription: Unsubscribable): void {
    const index = this.subscriptions.indexOf(subscription);
    if (index !== -1) {
      this.subscriptions.splice(index, 1);
    }
  }
}
// Custom implementation of Subject
export class CustomSubject<T> extends CustomObservable<T> {
  override next(value: T): void {
    super.next(value);
  }

  asObservable(): CustomObservable<T> {
    return this;
  }
}

// Custom implementation of BehaviorSubject
export class CustomBehaviorSubject<T> extends CustomSubject<T> {
  private _value: T;

  constructor(initialValue: T) {
    super();
    this._value = initialValue;
  }

  get value(): T {
    return this._value;
  }

  override next(value: T): void {
    this._value = value;
    super.next(value);
  }
}
