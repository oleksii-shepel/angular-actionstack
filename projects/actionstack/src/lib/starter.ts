import { filter, firstValueFrom } from "rxjs";
import { ActionQueue } from "./collections";
import { Lock } from "./lock";
import { Action, AsyncAction } from "./types";

export const createStarter = () => {
  const actionQueue = new ActionQueue();
  let asyncActions: Promise<any>[] = [];
  let lock = new Lock();

  const exclusive = ({ dispatch, getState, dependencies, isProcessing, actionStack }: any) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {
    async function processAction(action: Action<any> | AsyncAction<any>) {

      if (typeof action === 'function') {
        // If it's an async action (a function), process it
        return await action(dispatch, getState, dependencies());
      } else {
        // If it's a regular action, pass it to the next middleware
        return await next(action);
      }
    }

    if(typeof action !== 'function' && !actionStack.length) {
      actionStack.push(action);
      isProcessing.next(true);
    }

    // If there's an action being processed, enqueue the new action and return
    if (actionStack.length > 0 && actionStack.peek() !== action) {
      actionQueue.enqueue(action as any);
      await firstValueFrom(isProcessing.pipe(filter(value => value === false)));
      actionQueue.dequeue();
    }

    await lock.acquire()
    try {
      await processAction(action);
    } finally {
      lock.release();
    }
  };

  const concurrent = ({ dispatch, getState, dependencies, isProcessing, actionStack }: any) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {
    async function processAction(action: Action<any> | AsyncAction<any>) {

      if (typeof action === 'function') {
        // If it's an async action (a function), process it asynchronously
        const asyncFunc = (async () => {
          await action(dispatch, getState, dependencies());
          // Remove the function from the array when it's done
          asyncActions = asyncActions.filter(func => func !== asyncFunc);
        })();
        // Add the function to the array
        asyncActions.push(asyncFunc);
      } else {
        // If it's a regular action, pass it to the next middleware
        await next(action);
      }
    }

    if(typeof action !== 'function' && !actionStack.length) {
      actionStack.push(action);
      isProcessing.next(true);
    }

    // If there's an action being processed, enqueue the new action and return
    if (actionStack.length > 0 && actionStack.peek() !== action) {
      actionQueue.enqueue(action as any);
      await firstValueFrom(isProcessing.pipe(filter(value => value === false)));
      actionQueue.dequeue();
    }

    await lock.acquire()
    try {
      await processAction(action);
    } finally {
      lock.release();
    }
  };

  // Map strategy names to functions
  const strategies: Record<string, any> = {
    'exclusive': exclusive,
    'concurrent': concurrent
  };

  // Create a method to select the strategy
  const selectStrategy = ({ dispatch, getState, dependencies, isProcessing, actionStack, strategy }: any) => (next: Function) => async (action: Action<any>) => {
    const strategyFunc = strategies[strategy()];
    if (!strategyFunc) {
      throw new Error(`Unknown strategy: ${strategy}`);
    }
    return strategyFunc({ dispatch, getState, dependencies, isProcessing, actionStack })(next)(action);
  };

  selectStrategy.signature = 'i.p.5.j.7.0.2.1.8.b';
  return selectStrategy;
};

// Create the bufferize middleware
export const starter = createStarter();
