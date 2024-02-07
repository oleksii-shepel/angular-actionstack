import { ActionQueue } from "./collections";
import { Lock } from "./lock";
import { Action, AsyncAction } from "./types";

export const createBufferize = () => {
  const actionQueue = new ActionQueue();
  let asyncLock = new Lock();

  const exclusive = ({ dispatch, getState, dependencies, isProcessing, actionStack }: any) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {
    async function processAction(action: Action<any> | AsyncAction<any>) {
      if(!actionStack.length) {
        actionStack.push(action);
        isProcessing.next(true);
      }

      if (typeof action === 'function') {
        // If it's an async action (a function), process it
        return await action(dispatch, getState, dependencies);
      } else {
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

  const concurrent = ({ dispatch, getState, dependencies, isProcessing, actionStack } : any) => (next: Function) => async (action: Action<any>) => {
    async function processAction(action: Action<any> | AsyncAction<any>) {
      if(!actionStack.length) {
        actionStack.push(action);
        isProcessing.next(true);
      }

      if (typeof action === 'function') {
        // If it's an async action (a function), process it
        return await action(dispatch, getState, dependencies);
      } else {
        // If it's a regular action, pass it to the next middleware
        return await next(action);
      }
    }

    return await processAction(action);
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

  // Return the bufferize middleware
  return selectStrategy;
};

// Create the bufferize middleware
export const bufferize = createBufferize();
