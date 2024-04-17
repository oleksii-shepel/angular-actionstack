import { Observable } from "rxjs";

/**
 * Implements a lock using promises to ensure mutual exclusion.
 */
export class Lock {
  /**
   * Flag indicating whether the lock is currently acquired by someone.
   */
  public isLocked: boolean = false;

  /**
   * Internal queue to store waiting promises when the lock is acquired.
   */
  private queue: Array<() => void> = [];

  /**
   * Constructor (no arguments needed for initialization).
   */
  constructor() {}

  /**
   * Asynchronously acquires the lock.
   *
   * @returns {Promise<void>}  - A promise that resolves immediately if the lock is not acquired,
   *                             or resolves later when the lock becomes available for the caller.
   */
  public async acquire(): Promise<void> {
    // Return a promise that resolves immediately if not locked
    return new Promise((resolve) => {
      if (!this.isLocked) {
        this.isLocked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  /**
   * Releases the lock, allowing the next waiting promise in the queue to acquire it.
   */
  public release(): void {
    const nextResolve = this.queue.shift();
    if (nextResolve) {
      // Unlock the next promise in the queue
      nextResolve();
    } else {
      // If the queue is empty, set isLocked to false
      this.isLocked = false;
    }
  }
}

export function sequential<T, R>(project: (value: T, index: number) => Promise<R>): (source: Observable<T>) => Observable<R> {
  let lock = new Lock();

  return (source: Observable<T>) => new Observable<R>(observer => {

    let index = 0;
    const subscription = source.subscribe({
      next(value: any) {
        lock.acquire()
          .then(() => { observer.next(value); return value;})
          .then((value) => project(value, index++))
          .finally(() => lock.release());
      },
      error(err) { observer.error(err); lock.release(); },
      complete() { observer.complete(); lock.release(); }
    });

    return () => {
      subscription.unsubscribe();
    };
  });
}
