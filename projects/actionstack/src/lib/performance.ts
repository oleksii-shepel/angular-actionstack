import { salt } from './hash';
import { isSystemActionType } from './store';
import { Action } from "./types";

export const createPerformanceLogger = () => {
  let actionGroup: { action: Action<any>, label: string, duration: number, date: Date }[] = [];

  const perfmon = () => (next: Function) => async (action: Action<any>) => {
    async function processAction(action: Action<any>) {
      const startTime = performance.now(); // Capture the start time

      actionGroup.push({ action: action, label: `${action.type}`, duration: 0, date: new Date()});
      await next(action);

      const endTime = performance.now(); // Capture the end time
      const duration = Math.round((endTime - startTime) * 100000) / 100000;

      const actionDuration = actionGroup.find(ad => ad.action === action);
      if (actionDuration) {
        actionDuration.duration = duration;
      }

      if(actionGroup.length > 0) {
        const totalDuration = actionGroup.reduce((total, ad) => total + ad.duration, 0);
        const uniqueId = (isSystemActionType(action.type))
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

    await processAction(action);
  };

  perfmon.signature = '2.m.z.d.u.x.w.l.v.e';
  return perfmon;
};

// Create the performance middleware with the lock
export const perfmon = createPerformanceLogger();
