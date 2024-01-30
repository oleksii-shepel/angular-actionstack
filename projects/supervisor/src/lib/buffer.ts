import { Lock } from "redux-sequential";
import { ActionQueue } from "./collections";
import { Action, AsyncAction } from "./types";

export const createBufferize = (lock: Lock) => {
  const actionQueue = new ActionQueue();

  const exclusive = ({ dispatch, getState, dependencies, isProcessing, actionStack }: any) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {
    if (isProcessing.value && actionStack.length) {
      // Child action or async action
      if (action instanceof Function) {
        // If it's an async action (a function), enqueue it without acquiring the lock
        actionQueue.enqueue(action as any);
      } else {
        // If it's a synchronous action, process it in sequence without acquiring the lock
        actionStack.push(action);
        await next(action);
      }
    } else {
      // Regular action or the first action in the sequence
      actionStack.push(action);
      actionQueue.enqueue(action as any);

      if (!isProcessing.value) {
        // Acquire the lock only if not already processing
        await lock.acquire();

        try {
          // Process actions in sequence
          while (actionQueue.length > 0) {
            const currentAction = actionQueue.dequeue()!;
            await processAction(currentAction);
          }
        } finally {
          // Release the lock only if not processing anymore
          lock.release();
        }
      }
    }

    async function processAction(currentAction: Action<any> | AsyncAction<any>) {
      if (currentAction instanceof Function) {
        // If it's an async action (a function), process it within the same lock
        actionStack.push(currentAction);
        await currentAction(dispatch, getState, dependencies());
      } else {
        // If it's a synchronous action, process it in sequence without acquiring the lock
        await next(currentAction);
      }
    }
  };

  const concurrent = ({ dispatch, getState, dependencies, isProcessing, actionStack } : any) => (next: Function) => async (action: Action<any>) => {
    actionStack.push(action);
    return await processAction(action);

    async function processAction(currentAction: Action<any> | AsyncAction<any>) {
      if (currentAction instanceof Function) {
        // If it's an async action (a function), process it within the same lock
        actionStack.push(currentAction);
        await currentAction(dispatch, getState, dependencies());
      } else {
        // If it's a synchronous action, process it in sequence without acquiring the lock
        await next(currentAction);
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

  // Return the bufferize middleware
  return selectStrategy;
};

// Create a new lock
const lock = new Lock();

// Create the bufferize middleware with the lock
export const bufferize = createBufferize(lock);
