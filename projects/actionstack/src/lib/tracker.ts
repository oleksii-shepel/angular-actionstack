import { CustomBehaviorSubject, CustomObservable, OperatorFunction, Subscribable } from "./observable";

/**
 * A utility class for tracking the execution status of Observables.
 */
export class Tracker {
  /**
   * Map to store the relationship between Observables and their corresponding BehaviorSubjects.
   * @type {Map<Observable<any>, CustomBehaviorSubject<boolean>>}
   * @private
   */
  private entries = new Map<Subscribable<any>, CustomBehaviorSubject<boolean>>();

  /**
   * Returns the execution status of the provided Observable.
   * @param {Observable<any>} entry - The Observable to check the execution status for.
   * @returns {boolean} The execution status of the provided Observable. Returns `true` if executed, `false` otherwise.
   */
  getStatus(entry: Subscribable<any>) {
    return this.entries.get(entry)?.value === true;
  }

  /**
   * Sets the execution status of the provided Observable.
   * @param {Observable<any>} entry - The Observable to set the execution status for.
   * @param {boolean} value - The execution status to set.
   * @returns {void} This method does not return a value.
   */
  setStatus(entry: Subscribable<any>, value: boolean) {
    this.entries.get(entry)?.next(value);
  }

  /**
   * Tracks the execution status of the provided Observable.
   * @param {Observable<any>} observable - The Observable to track.
   * @returns {void} This method does not return a value.
   */
  track(observable: Subscribable<any>): void {
    if (!this.entries.has(observable)) {
      const subject = new CustomBehaviorSubject<boolean>(false);
      this.entries.set(observable, subject);
    }
  }

  /**
   * Removes a tracked observable and unsubscribes from it.
   * @param observable The observable to remove.
   */
  remove(observable: Subscribable<any>) {
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
    for (const value of this.entries.values()) {
      value.next(false); // Reset all subjects to false
    }
  }

  /**
   * Asynchronously checks if all tracked Observables have been executed within a specified timeout period.
   * @param {number} [timeoutMs=30000] - The timeout period in milliseconds. Defaults to 30000 milliseconds (30 seconds).
   * @returns {Promise<void>} A Promise that resolves when all tracked Observables have been executed within the timeout period, or rejects if the timeout is reached.
   */
  checkAllExecuted(timeoutMs = 30000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const allExecutedPromise = new Promise<void>((innerResolve, innerReject) => {
        const entries = Array.from(this.entries.values());
        const areAllExecuted = entries.every(executed => executed.value === true);
        if (areAllExecuted) {
          innerResolve();
        } else {
          innerReject('Not all entries are executed');
        }
      });

      const timeoutPromise = new Promise((innerResolve, innerReject) => {
        setTimeout(() => innerReject('Timeout reached'), timeoutMs);
      });

      Promise.race([allExecutedPromise, timeoutPromise])
        .then(() => resolve())
        .catch((error) => reject(error));
    });
  }
}

/**
 * Creates an observable that mirrors the source observable with an additional
 * side effect function `onExecuted` executed after each emitted value.
 * @param {Observable} source The source observable to mirror.
 * @param {Function} onExecuted The function to execute after each value is emitted.
 * @returns {Observable} The new observable with the side effect.
 */
export function withStatusTracking(onExecuted = () => {}): OperatorFunction<any, any> {
  return source => new CustomObservable<any>(observer => {
    const subscription = source.subscribe({
      async next(value) {
        await observer.next(value);
        onExecuted();
      },
      error(err) {
        observer.error(err);
      },
      complete() {
        observer.complete();
      }
    });

    // Unsubscribe on unsubscribe
    return () => subscription.unsubscribe();
  });
}

