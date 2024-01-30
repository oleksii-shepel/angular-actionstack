import { Lock } from "redux-sequential";
import { ActionQueue } from "./collections";
import { Action, AsyncAction } from "./types";

// Define your higher-order function
export const createBufferize = (lock: Lock) => {
  const actionQueue = new ActionQueue();
  const thunk = ({dispatch, getState, dependencies, isProcessing, actionStack }: any) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {

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

  const bufferize = ({ dispatch, getState, dependencies, isProcessing, actionStack } : any) => (next: Function) => async (action: Action<any>) => {

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

  // Return the bufferize middleware
  return bufferize;
};

// Create a new lock
const lock = new Lock();

// Create the bufferize middleware with the lock
export const bufferize = createBufferize(lock);
