import { Action } from "redux-replica";

export class ActionStack {
  private stack: Action<any>[] = [];

  get length(): number {
    return this.stack.length;
  }

  push(action: Action<any>): void {
    this.stack.push(action);
  }

  peek(): Action<any> | undefined {
    return this.stack[this.stack.length - 1];
  }

  pop(): Action<any> | undefined {
    return this.stack.pop();
  }

  clear() : void {
    this.stack = [];
  }

  toArray(): Action<any>[] {
    return [...this.stack];
  }
}

export class ActionQueue {
  private inbox: ActionStack = new ActionStack();
  private outbox: ActionStack = new ActionStack();

  enqueue(action: Action<any>): void {
    this.inbox.push(action);
  }

  dequeue(): Action<any> | undefined {
    if (this.outbox.length === 0) {
      while (this.inbox.length > 0) {
        this.outbox.push(this.inbox.pop() as Action<any>);
      }
    }
    return this.outbox.pop();
  }

  peek(): Action<any> | undefined {
    if (this.outbox.length === 0) {
      while (this.inbox.length > 0) {
        this.outbox.push(this.inbox.pop() as Action<any>);
      }
    }
    return this.outbox.peek();
  }

  toArray(): Action<any>[] {
    const reversedInbox = this.inbox.toArray().reverse();
    return [...this.outbox.toArray(), ...reversedInbox];
  }
}
