import { Lock } from "./lock";
import { Action } from "./types";

export const createPerformanceLogger = () => {
  let actionDurations: { action: Action<any>, label: string, duration: number, date: Date }[] = [];
  let lock = new Lock();



  const measurePerformance = ({ dispatch, getState, dependencies, isProcessing, actionStack }: any) => (next: Function) => async (action: Action<any>) => {
    await lock.acquire();
    try {

      const startTime = performance.now();

      actionDurations.push({ action, label: `${action.type}`, duration: 0, date: new Date()});

      const result = await next(action);
      const endTime = performance.now();
      const duration = Math.round((endTime - startTime) * 100000) / 100000;

      if(actionDurations.length > 0) {
        actionDurations.find(ad => ad.action === action)!.duration = duration;
      }

      // Log the durations in order when all actions have been dispatched
      if (actionStack.length === 0) {
        if(actionDurations.length > 0) {
          const parent = actionDurations[0];
          console.groupCollapsed(
            `%caction %c${parent.label}%c @ ${parent.date.toISOString()} (duration: ${parent.duration.toFixed(5)} ms)`,
            'color: gray; font-weight: lighter;', // styles for 'action'
            'color: black; font-weight: bold;', // styles for action label
            'color: gray; font-weight: lighter;' // styles for the rest of the string
          );
          actionDurations.forEach(ad => console.log(`%caction ${ad.label} @ ${ad.date.toISOString()} (${ad.duration.toFixed(5)} ms)`, 'color: gray; font-weight: bold;'));
          console.groupEnd();
        }
        actionDurations = [];
      }

      return result;
    } finally {
      lock.release();
    }
  }

  return measurePerformance;
};

// Create the performance middleware with the lock
export const measure = createPerformanceLogger();
