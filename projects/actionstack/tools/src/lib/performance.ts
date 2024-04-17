import { Action, isSystemActionType, salt } from '@actioncrew/actionstack';

/**
 * Creates a middleware function for logging action performance data.
 *
 * @returns {Function} - The middleware function to be added to the Actionstack middleware chain.
 */
export const createPerformanceMonitor = () => {
  let actionGroup: { action: Action<any>, label: string, duration: number, date: Date }[] = [];

  const perfmon = () => (next: Function) => async (action: Action<any>): Promise<any> => {
    async function processAction(action: Action<any>) {
      const startTime = performance.now(); // Capture the start time

      // Push action details to the group with label and initial duration
      actionGroup.push({ action: action, label: `${action.type}`, duration: 0, date: new Date()});
      await next(action); // Dispatch the action using the next middleware

      const endTime = performance.now(); // Capture the end time
      const duration = Math.round((endTime - startTime) * 100000) / 100000;

      // Find the corresponding action in the group and update its duration
      const actionDuration = actionGroup.find(ad => ad.action === action);
      if (actionDuration) {
        actionDuration.duration = duration;
      }

      if(actionGroup.length > 0) {
        const totalDuration = actionGroup.reduce((total, ad) => total + ad.duration, 0);
        // Generate a unique identifier based on system action type or a random string
        const uniqueId = (isSystemActionType(action.type))
          ? `[⚙️ ${salt(5).split('').join('.')}]`
          : `[🤹 ${salt(5).split('').join('.')}]`;

        console.groupCollapsed(
          `%caction %c${actionGroup[0].label}%c @ ${actionGroup[0].date.toISOString()} (duration: ${totalDuration.toFixed(5)} ms)\n${uniqueId}`,
          'color: gray; font-weight: lighter;', // styles for 'action'
          'color: black; font-weight: bold;',   // styles for action label
          'color: gray; font-weight: lighter;'  // styles for the rest of the string
        );
        actionGroup.forEach(ad => console.log(`%caction ${ad.label}%c @ ${ad.date.toISOString()} (${ad.duration.toFixed(5)} ms)\n${uniqueId}`, 'color: gray; font-weight: bold;', 'text-align: right;'));
        console.groupEnd();

        actionGroup = [];  // Reset the action group for the next batch
      }
    }

    return await processAction(action);
  };

  perfmon.signature = '2.m.z.d.u.x.w.l.v.e';
  return perfmon;
};

// Create a pre-configured instance of the performance middleware
export const perfmon = createPerformanceMonitor();
