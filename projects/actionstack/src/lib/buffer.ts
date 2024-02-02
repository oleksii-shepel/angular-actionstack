import { take, filter } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { ActionQueue } from "./collections";
import { Lock } from "./lock";
import { Action, AsyncAction } from "./types";

export const createBufferize = () => {
  const actionQueue = new ActionQueue();
  let dispatchLock = new Lock();
  let asyncLock = new Lock();

  const exclusive = ({ dispatch, getState, dependencies, isProcessing, actionStack }: any) => (next: Function) => async (action: Action<any> | AsyncAction<any>) => {
    async function processAction(currentAction: Action<any> | AsyncAction<any>) {
      if (currentAction instanceof Function) {
        // If it's an async action (a function), process it
        await asyncLock.acquire();
        try {
          await currentAction(dispatch, getState, dependencies());
        } finally {
          asyncLock.release();
        }
      } else {
        if(!actionStack.length) {
          actionStack.push(currentAction);
        }

        await next(currentAction);
      }
    }

    if(!actionQueue.length && !actionStack.length || actionStack.peek() !== action) {
      actionQueue.enqueue(action as any);
    } else {
      await processAction(action);
    }

    while(actionQueue.length > 0) {
      if (isProcessing.value) {
        await firstValueFrom(isProcessing.pipe(filter((value: boolean) => value === false), take(1)));
        isProcessing.next(true);
      } else {
        isProcessing.next(false);
      }

      let currentAction = actionQueue.dequeue()!;
      await processAction(currentAction);
    }
  };



  const concurrent = ({ dispatch, getState, dependencies, isProcessing, actionStack } : any) => (next: Function) => async (action: Action<any>) => {
    async function processAction(currentAction: Action<any> | AsyncAction<any>) {
      if (currentAction instanceof Function) {
        // If it's an async action (a function), process it
        await currentAction(dispatch, getState, dependencies());
      } else {
        // If it's a synchronous action, process it
        actionStack.push(action);
        await next(currentAction);
      }
    }

    return await processAction(action);
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

  // Return the bufferize middleware
  return selectStrategy;
};

// Create the bufferize middleware
export const bufferize = createBufferize();
