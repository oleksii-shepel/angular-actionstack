import { systemActions } from './actions';
import { ActionQueue } from "./collections";
import { salt } from './hash';
import { Lock } from "./lock";
import { Action } from "./types";

export const createPerformanceLogger = () => {
  let actionGroup: { action: Action<any>, label: string, duration: number, date: Date }[] = [];
  let asyncLock = new Lock();
  const actionQueue = new ActionQueue();

  const measurePerformance = ({ isProcessing, actionStack }: any) => (next: Function) => async (action: Action<any>) => {
    async function processAction(action: Action<any>) {
      const startTime = performance.now(); // Capture the start time

      actionGroup.push({ action: action, label: `${action.type}`, duration: 0, date: new Date()});

      // If it's a regular action, pass it to the next middleware
      await next(action);
      // await firstValueFrom(isProcessing.pipe(filter(value => value === false)));

      const endTime = performance.now(); // Capture the end time
      const duration = Math.round((endTime - startTime) * 100000) / 100000;

      const actionDuration = actionGroup.find(ad => ad.action === action);
      if (actionDuration) {
        actionDuration.duration = duration;
      }

      if(actionStack.length === 1) {
        if(actionGroup.length > 0) {
          const totalDuration = actionGroup.reduce((total, ad) => total + ad.duration, 0);
          const uniqueId = (action.type in systemActions)
            ? `[⚙️ ${salt(5).split('').join('.')}]`
            : `[🤹 ${salt(5).split('').join('.')}]`;

          console.groupCollapsed(
            `%caction %c${actionGroup[0].label}%c @ ${actionGroup[0].date.toISOString()} (duration: ${totalDuration.toFixed(5)} ms)\n${uniqueId}`,
            'color: gray; font-weight: lighter;', // styles for 'action'
            'color: black; font-weight: bold;', // styles for action label
            'color: gray; font-weight: lighter;' // styles for the rest of the string
          );
          actionGroup.forEach(ad => console.log(`%caction ${ad.label}%c @ ${ad.date.toISOString()} (${ad.duration.toFixed(5)} ms)\n${uniqueId}`, 'color: gray; font-weight: bold;', 'text-align: right;'));
          console.groupEnd();

          actionGroup = [];
        }
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

  measurePerformance.signature = '2.m.z.d.u.x.w.l.v.e';
  return measurePerformance;
};

// Create the performance middleware with the lock
export const measure = createPerformanceLogger();
