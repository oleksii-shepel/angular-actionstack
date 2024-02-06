export class Lock {
  public isLocked: boolean = false;
  private queue: Array<() => void> = [];

  constructor() {}

  public async acquire(): Promise<void> {
    // Return a promise that resolves immediately if not locked,
    // otherwise, add to the queue to be resolved later.
    return new Promise((resolve) => {
      if (!this.isLocked) {
        this.isLocked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

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
