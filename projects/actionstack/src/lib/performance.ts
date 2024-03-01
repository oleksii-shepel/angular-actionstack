import { ActionQueue } from "./collections";
import { Lock } from "./lock";
import { Action } from "./types";

export const createPerformanceLogger = () => {
  let actionGroup: { action: Action<any>, label: string, duration: number, date: Date }[] = [];
  let asyncLock = new Lock();
  const actionQueue = new ActionQueue();

  const measurePerformance = ({ actionStack }: any) => (next: Function) => async (action: Action<any>) => {
    async function processAction(action: Action<any>) {
      const startTime = performance.now(); // Capture the start time

      actionGroup.push({ action: action, label: `${action.type}`, duration: 0, date: new Date()});

      // If it's a regular action, pass it to the next middleware
      const result = await next(action);

      const endTime = performance.now(); // Capture the end time
      const duration = Math.round((endTime - startTime) * 100000) / 100000;

      const actionDuration = actionGroup.find(ad => ad.action === action);
      if (actionDuration) {
        actionDuration.duration = duration;
      }

      if(actionStack.length === 1) {
        if(actionGroup.length > 0) {
          const totalDuration = actionGroup.reduce((total, ad) => total + ad.duration, 0);
          const source = action as any;

          console.groupCollapsed(
            `%caction %c${actionGroup[0].label}%c @ ${actionGroup[0].date.toISOString()} (duration: ${totalDuration.toFixed(5)} ms)\n${source.suffix}`,
            'color: gray; font-weight: lighter;', // styles for 'action'
            'color: black; font-weight: bold;', // styles for action label
            'color: gray; font-weight: lighter;' // styles for the rest of the string
          );
          actionGroup.forEach(ad => console.log(`%caction ${ad.label}%c @ ${ad.date.toISOString()} (${ad.duration.toFixed(5)} ms)\n${source.suffix}`, 'color: gray; font-weight: bold;', 'text-align: right;'));
          console.groupEnd();

          actionGroup = [];
        }
        return result;
      }
    }

    // If there's an action being processed, enqueue the new action and return
    if (asyncLock.isLocked && actionStack.length) {
      actionQueue.enqueue(action as any);
      return;
    }

    try {
      // Lock the asyncLock and process the action
      await asyncLock.acquire();

      await processAction(action);

      // Process all enqueued actions
      while (actionQueue.length > 0) {
        const nextAction = actionQueue.dequeue()!;
        await processAction(nextAction);
      }
    } finally {
      // Release the lock
      if (asyncLock.isLocked) {
        asyncLock.release();
      }
    }
  };

  measurePerformance.internal = true;
  return measurePerformance;
};

// Create the performance middleware with the lock
export const measure = createPerformanceLogger();
