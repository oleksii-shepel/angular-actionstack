import { ActionQueue } from "./collections";
import { Lock } from "./lock";
import { Action, AsyncAction } from "./types";

export const createBufferize = () => {
  const actionQueue = new ActionQueue();
  let isAsync = false;
  let asyncLock = new Lock();
  let syncLock = new Lock();

  const exclusive = ({ dispatch, getState, dependencies, isProcessing, actionStack }: any) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {
    if (typeof action === 'function') {
      // If it's an async action (a function), process it
      await asyncLock.acquire();
      isAsync = true;

      try {
        return await action(dispatch, getState, dependencies);
      } finally {
        if (isAsync && asyncLock.isLocked) {
          asyncLock.release();
        }
        isAsync = false;
      }
    } else {
      if(!isAsync && asyncLock.isLocked) {
        await asyncLock.acquire();
      }
      await syncLock.acquire();
      try {
        if(!actionStack.length) {
          actionStack.push(action);
          isProcessing.next(true);
        }
        const result = await next(action);
        return result;

      } finally {
        syncLock.release();
        if (!isAsync && asyncLock.isLocked) {
          asyncLock.release();
        }
      }
    }
  };

  const concurrent = ({ dispatch, getState, dependencies, isProcessing, actionStack } : any) => (next: Function) => async (action: Action<any>) => {
    async function processAction(currentAction: Action<any> | AsyncAction<any>) {
      if (currentAction instanceof Function) {
        // If it's an async action (a function), process it
        await currentAction(dispatch, getState, dependencies());
      } else {
        if(!actionStack.length) {
          actionStack.push(action);
          isProcessing.next(true);
        }
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
