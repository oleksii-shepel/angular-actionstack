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
