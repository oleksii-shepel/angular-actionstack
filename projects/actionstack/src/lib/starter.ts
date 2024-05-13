import { Action, AsyncAction } from "./types";

/**
 * Function to create the starter middleware factory.
 * This factory function returns a middleware creator that takes strategy information as arguments and returns the actual middleware function.
 *
 * @returns Function - The middleware creator function.
 */
export const createStarter = () => {
  let asyncActions: Promise<any>[] = [];

  /**
   * Middleware function for handling actions exclusively.
   *
   * This middleware ensures only one action is processed at a time and queues new actions until the current one finishes.
   *
   * @param args - Arguments provided by the middleware pipeline.
   *   * dispatch - Function to dispatch actions.
   *   * getState - Function to get the current state.
   *   * dependencies - Function to get dependencies.
   * @param next - Function to call the next middleware in the chain.
   * @returns Function - The actual middleware function that handles actions.
   */
  const exclusive = ({ dispatch, getState, dependencies, lock }: any) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {
    async function processAction(action: Action<any> | AsyncAction<any>) {
      if (typeof action === 'function') {
        // Process async actions (functions)
        await action(async (action: Action<any>) => {
          await next(action);
        }, getState, dependencies());
      } else {
        // Pass regular actions to the next middleware
        await next(action);
      }
    }

    await lock.acquire();
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
  const concurrent = ({ dispatch, getState, dependencies, lock }: any) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {
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

    await lock.acquire();
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
  const selectStrategy = ({ dispatch, getState, dependencies, strategy, lock }: any) => (next: Function) => async (action: Action<any>) => {
    const strategyFunc = strategies[strategy()];
    if (!strategyFunc) {
      throw new Error(`Unknown strategy: ${strategy}`);
    }
    return strategyFunc({ dispatch, getState, dependencies, lock })(next)(action);
  };

  selectStrategy.signature = 'i.p.5.j.7.0.2.1.8.b';
  return selectStrategy;
};

// Create the bufferize middleware
export const starter = createStarter();
