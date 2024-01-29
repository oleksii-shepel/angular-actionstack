import { Lock } from "redux-sequential";
import { filter, firstValueFrom, take } from "rxjs";
import { ActionQueue } from "./structures";
import { Action } from "./types";

// Define your higher-order function
export const createBufferize = (lock: Lock) => {
  const actionQueue = new ActionQueue();
  const bufferize = ({ dispatch, getState, isProcessing, actionStack } : any) => (next: Function) => async (action: Action<any>) => {

    if(isProcessing) {
      // If it's a child action, process it immediately
      next(action);
    } else {
      actionQueue.enqueue(action);

      // If it's a parent action, acquire the lock
      await lock.acquire();

      action = actionQueue.dequeue()!;

      try {
        // Wait until isProcessing is false
        await firstValueFrom((isProcessing).pipe(
          filter((value) => value === false),
          take(1)
        ));

        // Process the parent action
        next(action);
      } finally {
        // Release the lock
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
