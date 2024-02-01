import { ActionQueue } from "./collections";
import { Lock } from "./lock";
import { Action, AsyncAction } from "./types";

export const createBufferize = () => {
  const actionQueue = new ActionQueue();
  const dispatchLock = new Lock();
  const childLockQueue: Lock[] = [];

  const exclusive = ({ dispatch, getState, dependencies, isProcessing, actionStack }: any) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {
    if (isProcessing.value && actionStack.length) {
        // If it's a synchronous action, process it in sequence without acquiring the lock
        actionStack.push(action);
        childLockQueue.push(new Lock());
        await processAction(action as any, childLockQueue[childLockQueue.length - 1]);
    } else {
      // Regular action or the first action in the sequence
      childLockQueue.splice(0, childLockQueue.length);

      actionStack.push(action);
      childLockQueue.push(new Lock());
      actionQueue.enqueue(action as any);

      if (!isProcessing.value) {
        // Acquire the lock only if not already processing
        await dispatchLock.acquire();

        try {
          // Process actions in sequence
          while (actionQueue.length > 0) {
            const currentAction = actionQueue.dequeue()!;
            await processAction(currentAction, childLockQueue[childLockQueue.length - 1]);
          }
        } finally {
          // Release the lock only if not processing anymore
          dispatchLock.release();
        }
      }
    }

    async function processAction(currentAction: Action<any> | AsyncAction<any>, lock: Lock) {
      await lock.acquire();
      try {
        if (currentAction instanceof Function) {
        // If it's an async action (a function), process it within the same lock
          actionStack.push(currentAction);
          childLockQueue.push(new Lock());
          await currentAction(dispatch, getState, dependencies());
        } else {
          // If it's a synchronous action, process it in sequence without acquiring the lock
          await next(currentAction);
        }
      } finally {
        lock.release();
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

// Create the bufferize middleware
export const bufferize = createBufferize();
