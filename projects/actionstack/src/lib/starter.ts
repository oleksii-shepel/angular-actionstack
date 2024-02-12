import { ActionQueue } from "./collections";
import { Lock } from "./lock";
import { Action, AsyncAction } from "./types";

export const createStarter = () => {
  const actionQueue = new ActionQueue();
  let asyncLock = new Lock();
  let asyncActions: Promise<any>[] = [];

  const exclusive = ({ dispatch, getState, dependencies, isProcessing, actionStack }: any) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {
    async function processAction(action: Action<any> | AsyncAction<any>) {

      if (typeof action === 'function') {
        // If it's an async action (a function), process it
        return await action(dispatch, getState, dependencies());
      } else {
        if(!actionStack.length) {
          actionStack.push(action);
          isProcessing.next(true);
        }
        // If it's a regular action, pass it to the next middleware
        return await next(action);
      }
    }

    // If there's an action being processed, enqueue the new action and return
    if (asyncLock.isLocked && actionStack.length) {
      actionQueue.enqueue(action as any);
      return;
    }

    try {
      // Lock the asyncLock and process the action
      await asyncLock.acquire();

      await processAction(action);

      // Process all enqueued actions
      while (actionQueue.length > 0) {
        const nextAction = actionQueue.dequeue()!;
        await processAction(nextAction);
      }
    } finally {
      // Release the lock
      if (asyncLock.isLocked) {
        asyncLock.release();
      }
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
        if(!actionStack.length) {
          actionStack.push(action);
          isProcessing.next(true);
        }
        // If it's a regular action, pass it to the next middleware
        await next(action);
      }
    }

    // If there's an action being processed, enqueue the new action and return
    if (asyncLock.isLocked && actionStack.length) {
      actionQueue.enqueue(action as any);
      return;
    }

    try {
      // Lock the asyncLock and process the action
      await asyncLock.acquire();

      await processAction(action);

      // Process all enqueued actions
      while (actionQueue.length > 0) {
        const nextAction = actionQueue.dequeue()!;
        await processAction(nextAction);
      }
    } finally {
      // Release the lock
      if (asyncLock.isLocked) {
        asyncLock.release();
      }
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

  selectStrategy.internal = true;
  return selectStrategy;
};

// Create the bufferize middleware
export const starter = createStarter();
