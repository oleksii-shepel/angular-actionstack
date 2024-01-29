import { Lock } from "redux-sequential";
import { ActionQueue } from "./structures";
import { Action } from "./types";

// Define your higher-order function
export const createBufferize = (lock: Lock) => {
  const actionQueue = new ActionQueue();
  const bufferize = ({ dispatch, getState, isProcessing, actionStack, dependencies } : any) => (next: Function) => async (action: Action<any>) => {

    if (action instanceof Function) {
      return action(dispatch, getState, dependencies());
    }

    return next(action);
  };

  // Return the bufferize middleware
  return bufferize;
};

// Create a new lock
const lock = new Lock();

// Create the bufferize middleware with the lock
export const bufferize = createBufferize(lock);
