import { Action } from "./types";

export class Stack<T = Action<any>> {
  private stack: T[] = [];

  get length(): number {
    return this.stack.length;
  }

  push(action: T): void {
    this.stack.push(action);
  }

  peek(): T | undefined {
    return this.stack[this.stack.length - 1];
  }

  pop(): T | undefined {
    return this.stack.pop();
  }

  clear() : void {
    this.stack = [];
  }

  toArray(): T[] {
    return [...this.stack];
  }
}

export class Queue<T = Action<any>> {
  private inbox: Stack<T> = new Stack();
  private outbox: Stack<T> = new Stack();

  get length(): number {
    return this.inbox.length + this.outbox.length;
  }

  enqueue(action: T): void {
    this.inbox.push(action);
  }

  dequeue(): T | undefined {
    if (this.outbox.length === 0) {
      while (this.inbox.length > 0) {
        this.outbox.push(this.inbox.pop() as T);
      }
    }
    return this.outbox.pop();
  }

  peek(): T | undefined {
    if (this.outbox.length === 0) {
      while (this.inbox.length > 0) {
        this.outbox.push(this.inbox.pop() as T);
      }
    }
    return this.outbox.peek();
  }

  toArray(): T[] {
    while (this.inbox.length > 0) {
      this.outbox.push(this.inbox.pop() as T);
    }
    return this.outbox.toArray();
  }
}
