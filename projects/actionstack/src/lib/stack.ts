import { BehaviorSubject } from 'rxjs';

import { waitFor } from './operators';

export enum OperationType {
  ACTION = "action",
  ASYNC_ACTION = "async action",
  EFFECT = "effect",
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


  pop(item: T): T | undefined {
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

  toArray(): T[] {
    return [...this.stack.value];
  }

  async waitForEmpty(): Promise<T[]> {
    return await waitFor(this.stack, value => value.length === 0);
  }
}
