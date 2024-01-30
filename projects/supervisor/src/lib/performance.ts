import { Lock } from "./lock";
import { Action } from "./types";

export const createPerformance = (lock: Lock) => {
  const performance = (store: any) => (next: Function) => async (action: Action<any>) => {
    const actionLabel = `action-processing-duration-${action.type.toLowerCase()}`;
    await lock.acquire();

    console.time(actionLabel);
    try {
      return next(action);
    } finally {
      console.timeEnd(actionLabel);
      await lock.release();
    }
  }

  return performance;
};

// Create a new lock
const lock = new Lock();

// Create the performance middleware with the lock
export const performance = createPerformance(lock);
