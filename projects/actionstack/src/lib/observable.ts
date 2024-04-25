
export interface Observer<T> {
  next: (value: T) => void;
  error: (err: any) => void;
  complete: () => void;
}

export interface Unsubscribable {
  unsubscribe(): void;
}

export interface OperatorFunction<T, R>{
  (source: Subscribable<T>): Subscribable<R>;
};

export interface Subscribable<T> {
  subscribe(observerOrNext: Partial<Observer<T>> | ((value: T) => void) | void): Unsubscribable;
}

export type Subscriber<T> = Unsubscribable & Observer<T>;

export function isObservable(obj: any): obj is Subscribable<unknown> {
  // The !! is to ensure that this publicly exposed function returns
  // `false` if something like `null` or `0` is passed.
  return !!obj && (typeof obj?.subscribe === 'function');
}

// Custom implementation of Observable
export class CustomObservable<T> implements Subscribable<T>{
  protected observers: Observer<T>[] = [];

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

  pipe(...operators: ((source: CustomObservable<T>) => CustomObservable<T>)[]): CustomObservable<T> {
    let result: CustomObservable<T> = this;
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

  public static EMPTY = (() => {
    const empty = new CustomSubscription();
    empty.closed = true;
    return empty;
  })()
}
// Custom implementation of Subject
export class CustomSubject<T> extends CustomObservable<T> {
  override next(value: T): void {
    super.next(value);
  }

  asObservable(): CustomObservable<T> {
    return this;
  }

  complete() {
    this.observers.forEach(observer => observer.complete());
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
