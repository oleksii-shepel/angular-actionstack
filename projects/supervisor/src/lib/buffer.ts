import { Lock } from "redux-sequential";
import { ActionQueue } from "./collections";
import { Action, AsyncAction } from "./types";

// Define your higher-order function
export const createBufferize = (lock: Lock) => {
  const actionQueue = new ActionQueue();
  const thunk = ({dispatch, getState, dependencies, isProcessing, actionStack }: any) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {
    if (action instanceof Function) {
      return action(dispatch, getState, dependencies());
    }

    actionStack.push(action);
    return next(action);
  };

  const bufferize = ({ dispatch, getState, dependencies, isProcessing, actionStack } : any) => (next: Function) => async (action: Action<any>) => {
    return thunk({ dispatch, getState, dependencies, isProcessing, actionStack })(next)(action);
  };

  // Return the bufferize middleware
  return bufferize;
};

// Create a new lock
const lock = new Lock();

// Create the bufferize middleware with the lock
export const bufferize = createBufferize(lock);
