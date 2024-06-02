import { BehaviorSubject } from 'rxjs/internal/BehaviourSubject';

export enum OperationType {
  ACTION = "action",
  ASYNC_ACTION = "async action",
  EPIC = "epic",
  SAGA = "saga"
}

export interface Operation {
  operation: OperationType;
  instance: any;
  source?: any;
}

export const isOperation = (obj: any) => {
  return obj.operation !== undefined && obj.instance !== undefined;
};

export class ExecutionStack {
  private stack = new BehaviorSubject<Operation[]>([]);

  get length(): number {
    return this.stack.value.length;
  }

  push(item: Operation): void {
    this.stack.next([...this.stack.value, item]);
  }

  peek(): Operation | undefined {
    return this.stack.value[this.stack.value.length - 1];
  }


  pop(item: Operation): Operation | undefined {
    let index = this.stack.value.lastIndexOf(item);
    if(index > -1) {
      this.stack.next(this.stack.value.filter((_, i) => i !== index));
      return item;
    }
    return undefined;
  }

  clear() : void {
    this.stack.next([]);
  }

  toArray(): Operation[] {
    return [...this.stack.value];
  }

  findLast(condition: (element: Operation) => boolean): Operation | undefined {
    for (const element of this.stack.value.slice().reverse()) {
      if (condition(element)) {
        return element;
      }
    }
    return undefined;
  }

  async waitForEmpty(): Promise<Operation[]> {
    return await waitFor(this.stack, value => value.length === 0);
  }

  async waitForIdle(): Promise<Operation[]> {
    return await waitFor(this.stack, value => !value.some(item => item.operation === OperationType.ACTION));
  }
}

/**
 * Waits for a condition to be met in an observable stream.
 * @param {Observable<any>} obs - The observable stream to wait for.
 * @param {(value: any) => boolean} predicate - The predicate function to evaluate the values emitted by the observable stream.
 * @returns {Promise<boolean>} A promise that resolves to true when the predicate condition is met, or false if the observable completes without satisfying the predicate.
 */
export function waitFor<T>(obs: Observable<T>, predicate: (value: T) => boolean): Promise<T> {
  let subscription: Subscription | undefined;

  return new Promise<T>((resolve, reject) => {
    const checkInitialValue = (obs as BehaviorSubject<T>)?.value;
    if (checkInitialValue !== undefined && predicate(checkInitialValue)) {
      return resolve(checkInitialValue);
    }

    subscription = obs.subscribe({
      next: value => {
        if (predicate(value)) {
          if (subscription) {
            subscription.unsubscribe();
          }
          resolve(value);
        }
      },
      error: err => reject(err),
      complete: () => {
        reject("Method had completed before predicate condition was met");
      },
    });
  }).finally(() => {
    if (subscription && !subscription.closed) {
      subscription.unsubscribe();
    }
  });
}
