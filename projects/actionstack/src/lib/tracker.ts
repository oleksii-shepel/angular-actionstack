import { BehaviorSubject } from 'rxjs/internal/BehaviorSubject';
import { Observable } from 'rxjs/internal/Observable';

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
   * Sets the execution status to complete.
   * @param {Observable<any>} entry - The Observable to set the execution status for.
   * @returns {void} This method does not return a value.
   */
  setCompletion(entry: Observable<any>) {
    this.entries.get(entry)?.complete();
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
    for (const [key, value] of [...this.entries.entries()]) {
      if (value.closed) {
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
          next: handleCompletion,
          error: handleError,
          complete: handleCompletion, // Call handleCompletion on complete as well
        });
      });
    });
  }
}
