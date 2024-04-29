import { CustomBehaviorSubject, IObservable } from "./observable";

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
   * @type {Map<Observable<any>, CustomBehaviorSubject<boolean>>}
   * @private
   */
  private entries = new Map<IObservable<any>, CustomBehaviorSubject<boolean>>();

  /**
   * Returns the execution status of the provided Observable.
   * @param {Observable<any>} entry - The Observable to check the execution status for.
   * @returns {boolean} The execution status of the provided Observable. Returns `true` if executed, `false` otherwise.
   */
  getStatus(entry: IObservable<any>) {
    return this.entries.get(entry)?.value === true;
  }

  /**
   * Sets the execution status of the provided Observable.
   * @param {Observable<any>} entry - The Observable to set the execution status for.
   * @param {boolean} value - The execution status to set.
   * @returns {void} This method does not return a value.
   */
  setStatus(entry: IObservable<any>, value: boolean) {
    this.entries.get(entry)?.next(value);
  }

  /**
   * Tracks the execution status of the provided Observable.
   * @param {Observable<any>} observable - The Observable to track.
   * @returns {void} This method does not return a value.
   */
  track(observable: IObservable<any>): void {
    if (!this.entries.has(observable)) {
      const subject = new CustomBehaviorSubject<boolean>(false);
      this.entries.set(observable, subject);
    }
  }

  /**
   * Removes a tracked observable and unsubscribes from it.
   * @param observable The observable to remove.
   */
  remove(observable: IObservable<any>) {
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
   * @returns {Promise<void>} A Promise that resolves when all tracked Observables have been executed within the timeout period, or rejects if the timeout is reached.
   */
  get allExecuted(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeoutPromise = new Promise((innerResolve, innerReject) => {
        setTimeout(() => innerReject('Timeout reached'), this.timeout);
      });

      Promise.race([
        Promise.all(this.entries.map(subject => new Promise(innerResolve => subject.subscribe(innerResolve)))),
        timeoutPromise
      ])
        .then(() => resolve())
        .catch((error) => reject(error));
    });
  }
}
