import { ExecutionStack, Lock } from '@actioncrew/actionstack';

import { OperationType } from './stack';
import { Action, AsyncAction } from './types';

/**
 * Configuration object for the middleware.
 *
 * @typedef {Object} MiddlewareConfig
 * @property {Function} dispatch - Function to dispatch actions.
 * @property {Function} getState - Function to get the current state.
 * @property {Function} dependencies - Function to get dependencies.
 * @property {Lock} lock - Lock instance to manage action processing concurrency.
 * @property {ExecutionStack} stack - Stack instance to track action execution.
 */
interface MiddlewareConfig {
  dispatch: Function;
  getState: Function;
  dependencies: Function;
  lock: Lock;
  stack: ExecutionStack;
}

/**
 * Function to create the starter middleware factory.
 * This factory function returns a middleware creator that takes strategy information as arguments and returns the actual middleware function.
 *
 * @returns Function - The middleware creator function.
 */
export const createStarter = () => {
  let asyncActions: Promise<any>[] = [];

  /**
   * Class responsible for handling actions within the middleware.
   */
  class ActionHandler {
    private stack: ExecutionStack;
    private getState: Function;
    private dependencies: Function;

    /**
     * Creates an instance of ActionHandler.
     *
     * @param {MiddlewareConfig} config - The configuration object for the middleware.
     */
    constructor(config: MiddlewareConfig) {
      this.stack = config.stack;
      this.getState = config.getState;
      this.dependencies = config.dependencies;
    }

    /**
     * Handles the given action, processing it either synchronously or asynchronously.
     *
     * @param {Action<any> | AsyncAction<any>} action - The action to be processed.
     * @param {Function} next - The next middleware function in the chain.
     * @param {Lock} lockInstance - The lock instance to manage concurrency for this action.
     * @returns {Promise<void> | void} - A promise if the action is asynchronous, otherwise void.
     */
    async handleAction(action: Action<any> | AsyncAction<any>, next: Function, lockInstance: any) {

      await lockInstance.acquire();

      const op = {
        operation: typeof action === 'function' ? OperationType.ASYNC_ACTION : OperationType.ACTION,
        instance: action as AsyncAction<any>,
        source: typeof action === 'function' ? undefined : action.source
      };
      this.stack.push(op);

      try {
        if (typeof action === 'function') {
          let innerLock = new Lock();
          // Process async actions asynchronously and track them
          const asyncFunc = (async () => {
            await action(
              async (syncAction: Action<any>) => {
                  await this.handleAction(syncAction, next, innerLock);
              },
              this.getState,
              this.dependencies()
            );
          })();
          return asyncFunc;
        } else {
          // Process regular synchronous actions
          await next(action);
        }
      } finally {
        this.stack.pop(op);
        lockInstance.release();
      }
    }
  }

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
  const exclusive = (config: MiddlewareConfig) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {
    const handler = new ActionHandler(config);
    const lockInstance = config.lock;
    await handler.handleAction(action, next, lockInstance);
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
  const concurrent = (config: MiddlewareConfig) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {
    let asyncActions: Promise<void>[] = [];
    const handler = new ActionHandler(config);
    const lockInstance = config.lock;

    const asyncFunc = handler.handleAction(action, next, lockInstance);
    if (asyncFunc) {
      asyncActions.push(asyncFunc);
      asyncFunc.finally(() => {
        asyncActions = asyncActions.filter(func => func !== asyncFunc);
      });
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
