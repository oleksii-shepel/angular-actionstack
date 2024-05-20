import { BehaviorSubject } from 'rxjs';

import { waitFor } from './operators';

export enum OperationType {
  ACTION = "action",
  ASYNC_ACTION = "async action",
  EFFECT = "effect"
}

export interface Operation {
  operation: OperationType;
  instance: any;
}

export class ExecutionStack<T = Operation> {
  private stack = new BehaviorSubject<T[]>([]);

  get length(): number {
    return this.stack.value.length;
  }

  push(item: T): void {
    this.stack.next([...this.stack.value, item]);
  }

  peek(): T | undefined {
    return this.stack.value[this.stack.value.length - 1];
  }

  filter(predicate: (item: T) => boolean) {
    const filtered = this.stack.value.filter(predicate);
    this.stack.next(filtered);
    return filtered;
  }

  pop(): T | undefined {
    const value = this.peek();
    this.stack.next(this.stack.value.slice(0, -1));
    return value;
  }

  clear() : void {
    this.stack.next([]);
  }

  toArray(): T[] {
    return [...this.stack.value];
  }

  async waitForEmpty(): Promise<T[]> {
    return await waitFor(this.stack, value => value.length === 0);
  }
}
