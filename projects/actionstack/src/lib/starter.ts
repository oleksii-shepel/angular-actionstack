import { filter, firstValueFrom } from "rxjs";
import { Queue } from "./collections";
import { Lock } from "./lock";
import { Action, AsyncAction } from "./types";

/**
 * Function to create the starter middleware factory.
 * This factory function returns a middleware creator that takes strategy information as arguments and returns the actual middleware function.
 *
 * @returns Function - The middleware creator function.
 */
export const createStarter = () => {
  const actionQueue = new Queue();
  let asyncActions: Promise<any>[] = [];
  let lock = new Lock();

  /**
   * Middleware function for handling actions exclusively.
   *
   * This middleware ensures only one action is processed at a time and queues new actions until the current one finishes.
   *
   * @param args - Arguments provided by the middleware pipeline.
   *   * dispatch - Function to dispatch actions.
   *   * getState - Function to get the current state.
   *   * dependencies - Function to get dependencies.
   *   * isProcessing - Observable indicating if an action is currently being processed.
   *   * actionStack - Array representing the current stack of actions.
   * @param next - Function to call the next middleware in the chain.
   * @returns Function - The actual middleware function that handles actions.
   */
  const exclusive = ({ dispatch, getState, dependencies, isProcessing, actionStack }: any) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {
    async function processAction(action: Action<any> | AsyncAction<any>) {

      if (typeof action === 'function') {
        // Process async actions (functions)
        return await action(dispatch, getState, dependencies());
      } else {
        // Pass regular actions to the next middleware
        return await next(action);
      }
    }

    if(typeof action !== 'function' && !actionStack.length) {
      actionStack.push(action);
      isProcessing.next(true);
    }

    // Queue new actions if processing or another action is in the stack
    if (actionStack.length > 0 && actionStack.peek() !== action) {
      actionQueue.enqueue(action as any);
      await firstValueFrom(isProcessing.pipe(filter(value => value === false)));
      actionQueue.dequeue();
    }

    await lock.acquire()
    try {
      await processAction(action);
    } finally {
      lock.release();
    }
  };

  /**
   * Middleware function for handling actions concurrently.
   *
   * This middleware allows multiple async actions to be processed simultaneously.
   *
   * @param args - Arguments provided by the middleware pipeline (same as exclusive).
   * @param next - Function to call the next middleware in the chain.
   * @returns Function - The actual middleware function that handles actions.
   */
  const concurrent = ({ dispatch, getState, dependencies, isProcessing, actionStack }: any) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {
    async function processAction(action: Action<any> | AsyncAction<any>) {

      if (typeof action === 'function') {
        // Process async actions asynchronously and track them
        const asyncFunc = (async () => {
          await action(dispatch, getState, dependencies());
          // Remove the function from the array when it's done
          asyncActions = asyncActions.filter(func => func !== asyncFunc);
        })();
        // Add the function to the array
        asyncActions.push(asyncFunc);
      } else {
        // Pass regular actions to the next middleware
        await next(action);
      }
    }

    if(typeof action !== 'function' && !actionStack.length) {
      actionStack.push(action);
      isProcessing.next(true);
    }

    // Queue new actions if processing or another action is in the stack
    if (actionStack.length > 0 && actionStack.peek() !== action) {
      actionQueue.enqueue(action as any);
      await firstValueFrom(isProcessing.pipe(filter(value => value === false)));
      actionQueue.dequeue();
    }

    await lock.acquire()
    try {
      await processAction(action);
    } finally {
      lock.release();
    }
  };

  // Map strategy names to functions
  const strategies: Record<string, any> = {
    'exclusive': exclusive,
    'concurrent': concurrent
  };

  // Create a method to select the strategy
  const selectStrategy = ({ dispatch, getState, dependencies, isProcessing, actionStack, strategy }: any) => (next: Function) => async (action: Action<any>) => {
    const strategyFunc = strategies[strategy()];
    if (!strategyFunc) {
      throw new Error(`Unknown strategy: ${strategy}`);
    }
    return strategyFunc({ dispatch, getState, dependencies, isProcessing, actionStack })(next)(action);
  };

  selectStrategy.signature = 'i.p.5.j.7.0.2.1.8.b';
  return selectStrategy;
};

// Create the bufferize middleware
export const starter = createStarter();
