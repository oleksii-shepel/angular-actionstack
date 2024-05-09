import { BehaviorSubject } from "rxjs/internal/BehaviorSubject";
import { Observable } from "rxjs/internal/Observable";
import { Subscription } from 'rxjs/internal/Subscription';
import { Observer, OperatorFunction, isObservable } from "./types";

/**
 * A utility class for tracking the execution status of Observables.
 */
export class Tracker {
  /**
   * Execution timeout in ms.
   */
  timeout = 30000;
  /**
   * Map to store the relationship between Observables and their corresponding BehaviorSubjects.
   * @type {Map<TrackableObservable<any>, BehaviorSubject<boolean>>}
   * @private
   */
  private entries = new Map<TrackableObservable<any>, BehaviorSubject<boolean>>();

  /**
   * Returns the execution status of the provided Observable.
   * @param {Observable<any>} entry - The Observable to check the execution status for.
   * @returns {boolean} The execution status of the provided Observable. Returns `true` if executed, `false` otherwise.
   */
  getStatus(entry: TrackableObservable<any>) {
    return this.entries.get(entry)?.value === true;
  }

  /**
   * Sets the execution status of the provided Observable.
   * @param {Observable<any>} entry - The Observable to set the execution status for.
   * @param {boolean} value - The execution status to set.
   * @returns {void} This method does not return a value.
   */
  setStatus(entry: TrackableObservable<any>, value: boolean) {
    this.entries.get(entry)?.next(value);
  }

  /**
   * Tracks the execution status of the provided Observable.
   * @param {Observable<any>} observable - The Observable to track.
   * @returns {void} This method does not return a value.
   */
  track(observable: TrackableObservable<any>): void {
    if (!this.entries.has(observable)) {
      const subject = new BehaviorSubject<boolean>(false);
      this.entries.set(observable, subject);
    }
  }

  /**
   * Removes a tracked observable and unsubscribes from it.
   * @param observable The observable to remove.
   */
  remove(observable: TrackableObservable<any>) {
    const subject = this.entries.get(observable);
    if (subject) {
      this.entries.delete(observable);
      subject.complete(); // Complete the subject to trigger unsubscription
    }
  }
  /**
   * Resets the execution status of all tracked Observables to false.
   */
  reset() {
    for (const [key, value] of [...this.entries.entries()]) {
      if (key.isCompleted) {
        this.entries.delete(key); // Remove the entry if its value is true
      } else {
        value.next(false); // Reset the subject to false
      }
    }
  }

  /**
   * Asynchronously checks if all tracked Observables have been executed within a specified timeout period.
   * @returns {Promise<void>} A Promise that resolves when all tracked Observables have been executed within the timeout period, or rejects if the timeout is reached.
   */
  get allExecuted(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (![...this.entries.values()].length) {
        // No subjects, resolve immediately
        resolve();
        return;
      }

      const timeoutId = setTimeout(() => reject('Timeout reached'), this.timeout);
      let numPending = [...this.entries.values()].length; // Track pending subscriptions

      const handleCompletion = () => {
        numPending--;
        if (numPending === 0) {
          clearTimeout(timeoutId);
          resolve();
        }
      };

      const handleError = (error: any) => {
        clearTimeout(timeoutId);
        reject(error);
      };

      [...this.entries.values()].forEach(subject => {
        subject.subscribe({
          next: () => handleCompletion(),
          error: handleError,
          complete: handleCompletion, // Call handleCompletion on complete as well
        });
      });
    });
  }
}

/**
 * Represents an observable sequence with the ability to track completion state.
 * @template T The type of elements in the sequence.
 */
export class TrackableObservable<T> extends Observable<T> {
  /** Indicates whether the observable sequence has completed. */
  isCompleted: boolean = false;
  /** Indicates whether the observable has produced a value. */
  isExecuted: boolean = false;
  /** Indicates how many times the observable has produced a value. */
  emissionNumber = 0;
  /** Ancestor observable of this observable in the pipe. */
  descendant?: TrackableObservable<any>;

  /**
   * Creates a new TrackableObservable.
   * @param {function(observer: Observer<T>): () => void} subscribe The function that is called when the Observable is initially subscribed to. This function should be defined to handle the delivery of values to Observers.
   */
  constructor(subscribeOrObservable?: Observable<T> | ((subscriber: Observer<T>) => (() => void) | void), private tracker?: Tracker) {
    super(isObservable(subscribeOrObservable) ? (observer => {
      const subscription = subscribeOrObservable.subscribe({
        next: (value) => { observer.next(value); this.isExecuted = true; this.emissionNumber++; },
        error: (err) => { this.isCompleted = true; observer.error(err); },
        complete: () => { this.isCompleted = true; observer.complete(); }
      });
      return () => subscription.unsubscribe();
    }) : subscribeOrObservable);
  }

  /**
   * Subscribes to the sequence with an observer and returns a subscription.
   * @param {Observer<T>} observer An observer to be notified of emitted values, errors, or completion.
   * @return {Subscription} The subscription representing the subscription of the observer to the observable sequence.
   */
  override subscribe(observerOrNext?: Partial<Observer<T>> | ((value: T) => void) | null, error?: (error: any) => void, complete?: () => void): Subscription {
    const observer: Partial<Observer<T>> = {};

    if (observerOrNext === null) {
      observerOrNext = {}; // Assign an empty observer object
    }

    if (typeof observerOrNext === 'function') {
      observer.next = observerOrNext;
    } else {
      Object.assign(observer, observerOrNext);
    }

    const originalNext = observer.next?.bind(observer);
    observer.next = (value) => {
      if(originalNext) {
        originalNext(value);
        this.isExecuted = true;
        this.emissionNumber++;
      }
    };

    // Initialize error and complete callbacks if not provided
    observer.error = observer.error || error;
    observer.complete = observer.complete || complete;

    const subscription = super.subscribe(observerOrNext);
    const originalComplete = subscription.unsubscribe.bind(subscription);
    subscription.unsubscribe = () => {
      this.isCompleted = true;
      originalComplete();
    };

    (subscription as any).source = this;
    return subscription;
  }

  /**
   * Overrides the pipe method of Observable to create a new TrackableObservable
   * with the specified operators applied.
   * @param {OperatorFunction<any, any>[]} operators - An array of operators to apply.
   * @returns {TrackableObservable<any>} A new TrackableObservable with the specified operators applied.
   */
  override pipe(...operators: OperatorFunction<any, any>[]): TrackableObservable<any> {
    if (operators.length === 0) {
      return this;
    }
    return operators.reduce((prev, fn) => { const obs = new TrackableObservable(fn(prev), this.tracker); prev.descendant = obs; return obs; }, this as any);
  }
}
