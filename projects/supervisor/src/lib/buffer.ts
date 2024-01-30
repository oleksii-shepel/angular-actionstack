import { Lock } from "redux-sequential";
import { ActionQueue } from "./collections";
import { Action, AsyncAction } from "./types";

export const createBufferize = (lock: Lock) => {
  const actionQueue = new ActionQueue();
  const thunk = ({dispatch, getState, dependencies, isProcessing, actionStack }: any) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {

    if (action instanceof Function) {
      return action(dispatch, getState, dependencies());
    }

    actionStack.push(action);
    return next(action);
  };

  const pooledthunk = ({dispatch, getState, dependencies, isProcessing, actionStack }: any) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {

    if (action instanceof Function) {
      await lock.acquire();
      try {
        return action(dispatch, getState, dependencies());
      } finally {
        lock.release();
      }
    }

    actionStack.push(action);
    return next(action);
  };

  const exclusive = ({ dispatch, getState, dependencies, isProcessing, actionStack } : any) => (next: Function) => async (action: Action<any>) => {

    if(isProcessing.value && actionStack.length || action instanceof Function && !actionStack.length) {
      // child action or async action
      return pooledthunk({ dispatch, getState, dependencies, isProcessing, actionStack })(next)(action);
    } else {
      actionQueue.enqueue(action);
      await lock.acquire();

      try {
        action = actionQueue.dequeue()!;
        actionStack.push(action);
        return next(action);
      } finally {
        lock.release();
      }
    }
  };

  const sequential = ({ dispatch, getState, dependencies, isProcessing, actionStack } : any) => (next: Function) => async (action: Action<any>) => {

    if(isProcessing.value && actionStack.length || action instanceof Function && !actionStack.length) {
      // child action or async action
      return thunk({ dispatch, getState, dependencies, isProcessing, actionStack })(next)(action);
    } else {
      actionQueue.enqueue(action);
      await lock.acquire();

      try {
        action = actionQueue.dequeue()!;
        actionStack.push(action);
        return next(action);
      } finally {
        lock.release();
      }
    }
  };

  const concurrent = ({ dispatch, getState, dependencies, isProcessing, actionStack } : any) => (next: Function) => async (action: Action<any>) => {
    actionStack.push(action);
    return thunk({ dispatch, getState, dependencies, isProcessing, actionStack })(next)(action);
  };


  // Map strategy names to functions
  const strategies: Record<string, any> = {
    'exclusive': exclusive,
    'sequential': sequential,
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
