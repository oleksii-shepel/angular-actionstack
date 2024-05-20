import { OperationType } from './stack';
import { Action, AsyncAction } from './types';

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
  const exclusive = ({ dispatch, getState, dependencies, lock, stack }: any) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {
    async function processAction(action: Action<any> | AsyncAction<any>) {
      if (typeof action === 'function') {
        // Process async actions (functions)
        stack.push({ operation: OperationType.ASYNC_ACTION, instance: action });
        try {
          await action(async (action: Action<any>) => {
            stack.push({ operation: OperationType.ACTION, instance: action });
            try {
              await next(action);
            } finally {
              stack.pop();
            }
          }, getState, dependencies());
        } finally {
          stack.pop();
        }
      } else {
        // Pass regular actions to the next middleware
        stack.push({ operation: OperationType.ACTION, instance: action });
        try {
          await next(action);
        } finally {
          stack.pop();
        }
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
  const concurrent = ({ dispatch, getState, dependencies, lock, stack }: any) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {
    async function processAction(action: Action<any> | AsyncAction<any>) {
      if (typeof action === 'function') {
        // Process async actions asynchronously and track them
        const asyncFunc = (async () => {
          stack.push({ operation: OperationType.ASYNC_ACTION, instance: action });
          try {
            await action(async (action: Action<any>) => {
              stack.push({ operation: OperationType.ACTION, instance: action });
              try {
                await next(action);
              } finally {
                stack.pop();
              }
            }, getState, dependencies());
          } finally {
            stack.pop();
          }
          // Remove the function from the array when it's done
          asyncActions = asyncActions.filter(func => func !== asyncFunc);
        })();
        // Add the function to the array
        asyncActions.push(asyncFunc);
      } else {
        // Pass regular actions to the next middleware
        stack.push({ operation: OperationType.ACTION, instance: action });
        try {
          await next(action);
        } finally {
          stack.pop();
        }
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

  const defaultStrategy = 'concurrent';

  // Create a method to select the strategy
  const selectStrategy = ({ dispatch, getState, dependencies, strategy, lock, stack }: any) => (next: Function) => async (action: Action<any>) => {
    let strategyFunc = strategies[strategy()];
    if (!strategyFunc) {
      console.warn(`Unknown strategy: ${strategy}, default is used: ${defaultStrategy}`);
      strategyFunc = strategies[defaultStrategy];
    }
    return strategyFunc({ dispatch, getState, dependencies, lock, stack })(next)(action);
  };

  selectStrategy.signature = 'i.p.5.j.7.0.2.1.8.b';
  return selectStrategy;
};

// Create the starter middleware
export const starter = createStarter();
