import { Action, action, concat, Epic, isAction, merge } from '@actioncrew/actionstack';
import { Subject } from 'rxjs/internal/Subject';
import { Subscription } from 'rxjs/internal/Subscription';

const epicsMiddleware = () => {
  let activeEpics: Epic[] = [];
  let currentAction = new Subject<Action<any>>();
  let currentState = new Subject<any>();
  let resolvePromise: Function | undefined = undefined;
  let rejectPromise: Function | undefined = undefined;
  let promise: Promise<any> | undefined = undefined;
  let subscription: Subscription | undefined = undefined;

  return ({ dispatch, getState, dependencies, strategy }: any) => (next: any) => async (action: any) => {
    // Proceed to the next action
    const result = await next(action);

    if (action.type === 'ADD_EPICS' || action.type === 'REMOVE_EPICS') {
      if (action.type === 'ADD_EPICS') {
        action.payload.effects.forEach((effect: Epic) => {
          if (!activeEpics.includes(effect)) {
            activeEpics.push(effect);
          }
        });
      } else if (action.type === 'REMOVE_EPICS') {
        action.payload.effects.forEach((effect: Epic) => {
          const effectIndex = activeEpics.indexOf(effect);
          if (effectIndex !== -1) {
            activeEpics.splice(effectIndex, 1);
          }
        });
      }

      // Unsubscribe from the previous subscription if it exists
      if (subscription) {
        subscription.unsubscribe();
      }

      // Create a new subscription
      subscription = currentAction.pipe(
        () => (strategy === "concurrent" ? merge : concat)(...activeEpics.map(sideEffect => sideEffect(currentAction, currentState, dependencies())))
      ).subscribe({
        next: (childAction: any) => {
          if (isAction(childAction)) {
            dispatch(childAction);
          }
        },
        error: (err: any) => {
          if (rejectPromise) {
            rejectPromise(err);
          }
        },
        complete: () => {
          // Check if all side effects have completed
          if (subscription && subscription.closed) {
            if (resolvePromise) {
              resolvePromise();
            }
          }
        },
      });

      resolvePromise && resolvePromise();
    }

    currentAction.next(action);
    currentState.next(getState());

    // If current action is not of type ADD_EFFECT or REMOVE_EFFECT, await promise
    if (action.type !== 'ADD_EPICS' && action.type !== 'REMOVE_EPICS' && promise) {
      await new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });
    }

    return result;
  };
};

export const epics = epicsMiddleware();

export const addEffects = action("ADD_EPICS", (...effects: Epic[]) => ({ effects }));
export const removeEffects = action("REMOVE_EPICS", (...effects: Epic[]) => ({ effects }));

