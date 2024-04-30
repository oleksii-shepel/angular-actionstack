import { BehaviorSubject, Observable } from 'rxjs';

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
   * @type {Map<Observable<any>, BehaviorSubject<boolean>>}
   * @private
   */
  private entries = new Map<Observable<any>, BehaviorSubject<boolean>>();

  /**
   * Returns the execution status of the provided Observable.
   * @param {Observable<any>} entry - The Observable to check the execution status for.
   * @returns {boolean} The execution status of the provided Observable. Returns `true` if executed, `false` otherwise.
   */
  getStatus(entry: Observable<any>) {
    return this.entries.get(entry)?.value === true;
  }

  /**
   * Sets the execution status of the provided Observable.
   * @param {Observable<any>} entry - The Observable to set the execution status for.
   * @param {boolean} value - The execution status to set.
   * @returns {void} This method does not return a value.
   */
  setStatus(entry: Observable<any>, value: boolean) {
    this.entries.get(entry)?.next(value);
  }

  /**
   * Tracks the execution status of the provided Observable.
   * @param {Observable<any>} observable - The Observable to track.
   * @returns {void} This method does not return a value.
   */
  track(observable: Observable<any>): void {
    if (!this.entries.has(observable)) {
      const subject = new BehaviorSubject<boolean>(false);
      this.entries.set(observable, subject);
    }
  }

  /**
   * Removes a tracked observable and unsubscribes from it.
   * @param observable The observable to remove.
   */
  remove(observable: Observable<any>) {
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
      const timeoutId = setTimeout(() => reject('Timeout reached'), this.timeout);
      Promise.race([
        Promise.all([...this.entries.values()].map(subject => new Promise<void>(innerResolve => subject.subscribe(value => value && innerResolve())))),
        new Promise((innerResolve, innerReject) => {
          setTimeout(() => innerReject('Timeout reached'), this.timeout);
        })
      ])
        .then(() => {
          clearTimeout(timeoutId);
          resolve();
        })
        .catch(() => {
          clearTimeout(timeoutId);
          reject('Error occurred'); // Or handle specific errors differently
        });
    });
  }
}
