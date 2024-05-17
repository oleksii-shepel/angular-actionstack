import { Subscription } from 'rxjs/internal/Subscription';
import { Subject } from 'rxjs/internal/Subject';
import { Action, SideEffect, action, concat, isAction, merge } from "@actioncrew/actionstack";

const sideEffectsMiddleware = () => {
  let activeSideEffects: SideEffect[] = [];
  let currentAction = new Subject<Action<any>>();
  let currentState = new Subject<any>();
  let resolvePromise: Function | undefined = undefined;
  let rejectPromise: Function | undefined = undefined;
  let promise: Promise<any> | undefined = undefined;
  let subscription: Subscription | undefined = undefined;

  return ({ dispatch, getState, dependencies, strategy }: any) => (next: any) => async (action: any) => {
    // Proceed to the next action
    const result = await next(action);

    if (action.type === 'ADD_EFFECTS' || action.type === 'REMOVE_EFFECTS') {
      if (action.type === 'ADD_EFFECTS') {
        action.payload.effects.forEach((effect: SideEffect) => {
          if (!activeSideEffects.includes(effect)) {
            activeSideEffects.push(effect);
          }
        });
      } else if (action.type === 'REMOVE_EFFECTS') {
        action.payload.effects.forEach((effect: SideEffect) => {
          const effectIndex = activeSideEffects.indexOf(effect);
          if (effectIndex !== -1) {
            activeSideEffects.splice(effectIndex, 1);
          }
        });
      }

      // Unsubscribe from the previous subscription if it exists
      if (subscription) {
        subscription.unsubscribe();
      }

      // Create a new subscription
      subscription = currentAction.pipe(
        () => (strategy === "concurrent" ? merge : concat)(...activeSideEffects.map(sideEffect => sideEffect(currentAction, currentState, dependencies())))
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
    if (action.type !== 'ADD_EFFECTS' && action.type !== 'REMOVE_EFFECTS' && promise) {
      await new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });
    }

    return result;
  };
};

export const sideEffects = sideEffectsMiddleware();

export const addEffects = action("ADD_EFFECTS", (...effects: SideEffect[]) => ({ effects }));
export const removeEffects = action("REMOVE_EFFECTS", (...effects: SideEffect[]) => ({ effects }));

