import { Action, action, concat, Epic, isAction, merge } from '@actioncrew/actionstack';
import { Subscription } from 'rxjs';
import { Subject } from 'rxjs/internal/Subject';

export const createEpicsMiddleware = () => {
  let activeEpics: Epic[] = [];
  let currentAction = new Subject<Action<any>>();
  let currentState = new Subject<any>();

  return ({ dispatch, getState, dependencies, strategy, stack }: any) => (next: any) => async (action: any) => {
    // Proceed to the next action
    const result = await next(action);

    if (action.type === 'ADD_EPICS' || action.type === 'REMOVE_EPICS') {
      if (action.type === 'ADD_EPICS') {
        action.payload.epics.forEach((epic: Epic) => {
          if (!activeEpics.includes(epic)) {
            activeEpics.push(epic);
          }
        });
      } else if (action.type === 'REMOVE_EPICS') {
        action.payload.epics.forEach((epic: Epic) => {
          const epicIndex = activeEpics.indexOf(epic);
          if (epicIndex !== -1) {
            activeEpics.splice(epicIndex, 1);
          }
        });
      }

      // Unsubscribe from the previous subscription if it exists
      if (currentAction.observers.length) {
        currentAction.complete(); // Complete previous subscription
      }

      // Create a new subscription
      const subscription: Subscription = currentAction.pipe(
        () => (strategy === "concurrent" ? merge : concat)(stack, ...activeEpics.map(sideEffect => sideEffect(currentAction, currentState, dependencies())))
      ).subscribe({
        next: (childAction: any) => {
          if (isAction(childAction)) {
            dispatch(childAction);
          }
        },
        error: (err: any) => {
          console.warn("Error in epic:", err);
          subscription && subscription.unsubscribe();
        },
        complete: () => subscription && subscription.unsubscribe()
      });
    }

    currentAction.next(action);
    currentState.next(getState());

    return result;
  };
};

export const epics = createEpicsMiddleware();

export const addEpics = action("ADD_EPICS", (...epics: Epic[]) => ({ epics }));
export const removeEpics = action("REMOVE_EPICS", (...epics: Epic[]) => ({ epics }));
