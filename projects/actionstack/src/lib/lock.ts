
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

export class ReadWriteLock {
  private readers: number;
  private writer: boolean;
  private readQueue: Array<() => void>;
  private writeQueue: Array<() => void>;
  private currentWriter: any;
  private currentReaderCount: Map<any, number>;

  constructor() {
    this.readers = 0;
    this.writer = false;
    this.readQueue = [];
    this.writeQueue = [];
    this.currentWriter = null;
    this.currentReaderCount = new Map();
  }

  async readLock(owner: any): Promise<void> {
    if (this.writer && this.currentWriter !== owner) {
      await new Promise<void>(resolve => this.readQueue.push(resolve));
    } else {
      this.readers++;
      this.currentReaderCount.set(owner, (this.currentReaderCount.get(owner) || 0) + 1);
    }
  }

  readUnlock(owner: any): void {
    const count = this.currentReaderCount.get(owner);
    if (count === undefined) throw new Error("Read lock not held by this owner");
    if (count > 1) {
      this.currentReaderCount.set(owner, count - 1);
    } else {
      this.currentReaderCount.delete(owner);
      this.readers--;
      if (this.readers === 0 && this.writeQueue.length > 0) {
        const writer = this.writeQueue.shift();
        this.writer = true;
        this.currentWriter = writer!.owner;
        writer!.callback();
      }
    }
  }

  async writeLock(owner: any): Promise<void> {
    if (this.writer && this.currentWriter !== owner || this.readers > 0) {
      await new Promise<void>(resolve => this.writeQueue.push({ callback: resolve, owner }));
    } else {
      this.writer = true;
      this.currentWriter = owner;
    }
  }

  writeUnlock(owner: any): void {
    if (this.currentWriter !== owner) throw new Error("Write lock not held by this owner");
    this.writer = false;
    this.currentWriter = null;
    if (this.writeQueue.length > 0) {
      const nextWriter = this.writeQueue.shift();
      this.writer = true;
      this.currentWriter = nextWriter!.owner;
      nextWriter!.callback();
    } else if (this.readQueue.length > 0) {
      while (this.readQueue.length > 0) {
        const nextReader = this.readQueue.shift();
        this.readers++;
        this.currentReaderCount.set(nextReader!.owner, (this.currentReaderCount.get(nextReader!.owner) || 0) + 1);
        nextReader!.callback();
      }
    }
  }
}

