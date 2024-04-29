/**
 * Represents an object that can be subscribed to for receiving notifications.
 * @typeParam T - The type of the elements that will be received.
 */
export interface Observer<T> {
  next: (value: T) => void;
  error: (err: any) => void;
  complete: () => void;
}

/**
 * Represents an object that has an unsubscribe method to release resources.
 */
export interface Unsubscribable {
  unsubscribe(): void;
}

/**
 * Alias for the ISubscription interface.
 * @type {ISubscription}
 */
export type ISubscription = Unsubscribable;

/**
 * Represents a function that takes a source `IObservable<T>` and returns a new `IObservable<R>`.
 * @typeParam T - The type of the elements that will be received.
 * @typeParam R - The type of the elements that will be emitted.
 */
export interface OperatorFunction<T, R>{
  (source: IObservable<T>): IObservable<R>;
};

/**
 * Represents an object that can be subscribed to for receiving notifications.
 * @typeParam T - The type of the elements that will be received.
 */
export interface Subscribable<T> {
  subscribe(observerOrNext: Partial<Observer<T>> | ((value: T) => void) | void): ISubscription;
}

/**
 * Interface representing an object that can be piped through a series of operators.
 */
export interface Pipeable<T, R> {
  pipe<T, R>(...operators: OperatorFunction<T, R>[]): IObservable<R>;
}

/**
 * Represents an observable object that can be subscribed to and piped through a series of operators.
 * @type {T} - The type of the elements that will be observed.
 */
export interface IObservable<T> extends Subscribable<T> {
  pipe<R>(...operators: OperatorFunction<T, R>[]): IObservable<R>;
}

/**
 * Represents an object that can be both subscribed to and can act as an observer.
 * @typeParam T - The type of the elements that will be received.
 */
export type Subscriber<T> = ISubscription & Observer<T>;

/**
 * Checks if an object is subscribable.
 * @param obj - The object to check.
 * @returns `true` if the object is subscribable, otherwise `false`.
 */
export function isObservable(obj: any): obj is IObservable<unknown> {
  // The !! is to ensure that this publicly exposed function returns
  // `false` if something like `null` or `0` is passed.
  return !!obj && (typeof obj?.subscribe === 'function');
}

/**
 * Custom implementation of Observable.
 * @typeParam T - The type of the elements that will be received.
 */
export class CustomObservable<T> implements IObservable<T> {
  /**
   * Array to hold the observers.
   */
  protected observers: Observer<T>[] = [];

  /**
   * Creates an instance of CustomObservable.
   * @param _subscribe - A function that receives an observer and can initiate subscription logic.
   */
  constructor(private _subscribe?: (subscriber: Observer<T>) => void) {}

  /**
   * Subscribes to the observable sequence.
   * @param observer - A partial observer or a callback function to receive `next` notifications.
   * @returns An `ISubscription` object representing the subscription.
   */
  subscribe(observer?: Partial<Observer<T>> | ((value: T) => void)): ISubscription {
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

  /**
   * Sends a value to all subscribed observers.
   * @param value - The value to send to the observers.
   */
  next(value: T): void {
    this.observers.forEach(observer => observer.next(value));
  }

  /**
   * Pipes the source CustomObservable through a series of operators.
   * @param operators - Functions that take a source CustomObservable and return a new CustomObservable.
   * @returns A CustomObservable that is the result of the operations applied in sequence.
   */
  pipe<R>(...operators: OperatorFunction<T, R>[]): IObservable<R> {
    let result: CustomObservable<T> = this;
    for (const operator of operators) {
      result = operator(result) as any;
    }
    return (result instanceof CustomObservable ? result : this) as any;
  }

  /**
   * Notifies all subscribed observers of the completion of the observable sequence.
   */
  complete() {
    this.observers.forEach(observer => observer.complete());
  }

  /**
   * Creates an observer object.
   * @param observer - A partial observer or a callback function to handle `next` notifications.
   * @returns An observer object with the specified handlers.
   */
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

/**
 * Represents a subscription that can be closed to release resources.
 */
export class CustomSubscription implements ISubscription {
  /**
   * Indicates whether the subscription is closed.
   */
  closed: boolean = false;

  /**
   * Array to hold the child subscriptions.
   */
  private subscriptions: ISubscription[] = [];

  /**
   * Creates an instance of CustomSubscription.
   * @param unsubscribeAction - A function to invoke when unsubscribing.
   */
  constructor(private unsubscribeAction?: () => void) {}

  /**
   * Closes the subscription and releases resources.
   */
  unsubscribe(): void {
    if (!this.closed && this.unsubscribeAction) {
      this.unsubscribeAction();
      this.closed = true;
    }
    this.subscriptions.forEach(subscription => subscription.unsubscribe());
  }

  /**
   * Adds a child subscription to the current subscription.
   * @param subscription - The subscription to add.
   */
  add(subscription: ISubscription): void {
    this.subscriptions.push(subscription);
  }

  /**
   * Removes a child subscription from the current subscription.
   * @param subscription - The subscription to remove.
   */
  remove(subscription: ISubscription): void {
    const index = this.subscriptions.indexOf(subscription);
    if (index !== -1) {
      this.subscriptions.splice(index, 1);
    }
  }

  /**
   * Represents an empty subscription that is already closed.
   */
  public static EMPTY = (() => {
    const empty = new CustomSubscription();
    empty.closed = true;
    return empty;
  })()
}

/**
 * Custom implementation of Subject.
 * @typeParam T - The type of the elements that will be received.
 */
export class CustomSubject<T> extends CustomObservable<T> {
  /**
   * Stores the current value of the subject.
   */
  protected _value: T | undefined;

  /**
   * Creates an instance of CustomSubject.
   * @param initialValue - The initial value of the subject.
   */
  constructor(initialValue?: T) {
    super();
    this._value = initialValue;
  }

  /**
   * Sends a value to all subscribed observers and updates the current value.
   * @param value - The value to send to the observers.
   */
  override next(value: T): void {
    super.next(value);
    this._value = value; // Update the current value
  }

  /**
   * Returns the current value of the subject.
   */
  get value(): T | undefined {
    return this._value; // Expose the current value
  }

  /**
   * Returns the subject as an Observable.
   * @returns An Observable that represents the subject.
   */
  asObservable(): CustomObservable<T> {
    return this;
  }

  /**
   * Notifies all subscribed observers of the completion of the observable sequence and clears the current value.
   */
  override complete() {
    super.complete();
    this._value = undefined; // Clear the value on completion
  }
}

/**
 * Custom implementation of BehaviorSubject.
 * @typeParam T - The type of the elements that will be received.
 */
export class CustomBehaviorSubject<T> extends CustomSubject<T> {

  /**
   * Creates an instance of CustomBehaviorSubject.
   * @param initialValue - The initial value of the subject.
   */
  constructor(initialValue: T) {
    super();
    this._value = initialValue;
  }

  /**
   * Returns the current value of the subject.
   */
  override get value(): T | undefined {
    return this._value;
  }

  /**
   * Sends a value to all subscribed observers and updates the current value.
   * @param value - The value to send to the observers.
   */
  override next(value: T): void {
    this._value = value;
    super.next(value);
  }
}
