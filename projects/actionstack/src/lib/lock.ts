
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
    return new Promise((resolve, reject) => {
      if (!this.isLocked) {
        this.isLocked = true;
        resolve(); // Lock acquired, resolve the promise
      } else {
        this.queue.push(() => resolve()); // Add resolve to queue
      }
    });
  }

  /**
   * Releases the lock, allowing the next waiting promise in the queue to acquire it.
   */
  release() {
    this.isLocked = false;
    // Process the waiting requests (if any)
    if (this.queue.length > 0) {
      const nextResolve = this.queue.shift()!;
      nextResolve(); // Resolve the first waiting promise
    };
  }
}

class FairnessNode {
  constructor(public readonly owner: any, private _callback: () => void, public readonly isWriter: boolean = false) {}

  public call() {
    this._callback();
  }
}

export class ReadWriteLock {
  private queue: FairnessNode[] = [];
  private currentWriter: any = null;
  private readers: number = 0;
  private currentReaderCount: Map<any, number> = new Map();
  private writer: boolean = false;

  readLock(owner: any): Promise<void> {
    return new Promise<void>((resolve) => {
      const node = new FairnessNode(owner, () => resolve());
      this.queue.push(node);
      this.tryGrantAccess();
    });
  }

  writeLock(owner: any): Promise<void> {
    return new Promise<void>((resolve) => {
      const node = new FairnessNode(owner, () => resolve(), true);
      this.queue.push(node);
      this.tryGrantAccess();
    });
  }

  private tryGrantAccess() {
    while (this.queue.length > 0) {
      const next = this.queue[0];
      if (next.isWriter) {
        if (this.readers === 0 && !this.writer) {
          // Grant write lock
          this.writer = true;
          this.currentWriter = next.owner;
          next.call();
          this.queue.shift();
        } else {
          break;
        }
      } else {
        if (!this.writer || next.owner === this.currentWriter) {
          // Grant read lock
          this.readers++;
          this.currentReaderCount.set(next.owner, (this.currentReaderCount.get(next.owner) || 0) + 1);
          next.call();
          this.queue.shift();
        } else {
          break;
        }
      }
    }
  }

  readUnlock(owner: any): void {
    const count = this.currentReaderCount.get(owner);
    if (!count) {
      throw new Error(`Read lock not held by this owner: ${owner}`);
    }
    if (count > 1) {
      this.currentReaderCount.set(owner, count - 1);
    } else {
      this.currentReaderCount.delete(owner);
      this.readers--;
      this.tryGrantAccess();
    }
  }

  writeUnlock(owner: any): void {
    if (this.currentWriter !== owner) {
      throw new Error(`Write lock not held by this owner: ${owner}`);
    }
    this.writer = false;
    this.currentWriter = null;
    this.tryGrantAccess();
  }
}
