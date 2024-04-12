import { Action } from "./types";

/**
 * Implements a Stack data structure using an array to store elements.
 *
 * @template T - The type of elements to be stored in the stack. Defaults to `Action<any>` for Actionstack actions.
 */
export class Stack<T = Action<any>> {
  /**
   * Internal array to store the stack elements.
   * Private to prevent direct modification from outside the class.
   */
  private stack: T[] = [];

  /**
   * Getter for the stack length (number of elements).
   *
   * @returns {number} - The current length of the stack.
   */
  get length(): number {
    return this.stack.length;
  }

  /**
   * Pushes an element onto the top of the stack.
   *
   * @param {T} action - The element to be pushed onto the stack.
   */
  push(action: T): void {
    this.stack.push(action);
  }

  /**
   * Returns the element at the top of the stack without removing it.
   *
   * @returns {T | undefined} - The element at the top of the stack or undefined if the stack is empty.
   */
  peek(): T | undefined {
    return this.stack[this.stack.length - 1];
  }

  /**
   * Removes and returns the element at the top of the stack.
   *
   * @returns {T | undefined} - The element that was removed from the top of the stack or undefined if the stack is empty.
   */
  pop(): T | undefined {
    return this.stack.pop();
  }

  /**
   * Removes all elements from the stack.
   */
  clear(): void {
    this.stack = [];
  }

  /**
   * Creates and returns a new array containing a copy of all elements in the stack.
   *
   * @returns {T[]} - A new array containing a copy of the stack elements.
   */
  toArray(): T[] {
    return [...this.stack];
  }
}

/**
 * Implements a Queue data structure using two internal stacks.
 *
 * @template T - The type of elements to be stored in the queue. Defaults to `Action<any>` for Actionstack actions.
 */
export class Queue<T = Action<any>> {
  /**
   * Internal stack used to enqueue (add) elements to the queue.
   */
  private inbox: Stack<T> = new Stack();

  /**
   * Internal stack used to dequeue (remove) elements from the queue.
   */
  private outbox: Stack<T> = new Stack();

  /**
   * Getter for the queue length (total elements in both stacks).
   *
   * @returns {number} - The total number of elements in the queue.
   */
  get length(): number {
    return this.inbox.length + this.outbox.length;
  }

  /**
   * Enqueues (adds) an element to the back of the queue.
   *
   * @param {T} action - The element to be enqueued.
   */
  enqueue(action: T): void {
    this.inbox.push(action);
  }

  /**
   * Dequeues (removes) and returns the element at the front of the queue.
   *
   * If the outbox is empty, it fills the outbox by transferring elements from the inbox (rebalancing).
   *
   * @returns {T | undefined} - The element that was dequeued or undefined if the queue is empty.
   */
  dequeue(): T | undefined {
    if (this.outbox.length === 0) {
      // Refill outbox from inbox if empty
      while (this.inbox.length > 0) {
        this.outbox.push(this.inbox.pop() as T);
      }
    }
    return this.outbox.pop();
  }

  /**
   * Returns the element at the front of the queue without removing it.
   *
   * Similar to dequeue, it refills the outbox if empty.
   *
   * @returns {T | undefined} - The element at the front of the queue or undefined if the queue is empty.
   */
  peek(): T | undefined {
    if (this.outbox.length === 0) {
      while (this.inbox.length > 0) {
        this.outbox.push(this.inbox.pop() as T);
      }
    }
    return this.outbox.peek();
  }

  /**
   * Creates and returns a new array containing a copy of all elements in the queue.
   *
   * It ensures the outbox is filled before creating the copy.
   *
   * @returns {T[]} - A new array containing a copy of the queue elements.
   */
  toArray(): T[] {
    while (this.inbox.length > 0) {
      this.outbox.push(this.inbox.pop() as T);
    }
    return this.outbox.toArray();
  }
}
