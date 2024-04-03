import { Action, isAction, kindOf } from "./types";

export { createAction as action };

function createAction(typeOrThunk: string | Function, payloadCreator?: Function): any {
  function actionCreator(...args: any[]) {
    let action: Action<any> = {
      type: typeOrThunk as string,
    };

    if (typeof typeOrThunk === 'function') {
      return async (dispatch: Function, getState: Function, dependencies: any) => {
        try {
          return await typeOrThunk(...args)(dispatch, getState, dependencies);
        } catch (error: any) {
          console.warn(`Error in action: ${error.message}. If dependencies object provided does not contain required property, it is possible that the slice name obtained from the tag name does not match the one declared in the slice file.`);
        }
      }
    } else if (payloadCreator) {
      let result = payloadCreator(...args);
      if (!result) {
        throw new Error('payloadCreator did not return an object. Did you forget to initialize an action with params?');
      }

      // Do not return payload if it is undefined
      if (result !== undefined) {
        action.payload = result;
        'meta' in result && (action.meta = result.meta);
        'error' in result && (action.error = result.error);
      }
    }
    else {
      // Do not return payload if it is undefined
      if (args[0] !== undefined) {
        action.payload = args[0];
      }
    }

    return action;
  }

  actionCreator.toString = () => `${typeOrThunk}`;
  actionCreator.type = typeOrThunk;
  actionCreator.match = (action: any) => isAction(action) && action.type === typeOrThunk;

  return actionCreator;
}

export function bindActionCreator(actionCreator: Function, dispatch: Function): Function {
  return function(this: any, ...args: any[]): any {
    return dispatch(actionCreator.apply(this, args));
  };
}

export function bindActionCreators(actionCreators: any, dispatch: Function): any {
  actionCreators = { ...actionCreators };
  if (typeof actionCreators === "function") {
    return bindActionCreator(actionCreators, dispatch);
  }

  if (typeof actionCreators !== "object" || actionCreators === null) {
    throw new Error(`bindActionCreators expected an object or a function, but instead received: '${kindOf(actionCreators)}'. Did you write "import ActionCreators from" instead of "import * as ActionCreators from"?`);
  }

  const keys = Object.keys(actionCreators);
  const numKeys = keys.length;

  if (numKeys === 1) {
    const actionCreator = actionCreators[keys[0]];

    if (typeof actionCreator === "function") {
      return bindActionCreator(actionCreator, dispatch);
    }
  }

  for (let i = 0; i < numKeys; i++) {
    const key = keys[i];
    const actionCreator = actionCreators[key];

    if (typeof actionCreator === "function") {
      actionCreators[key] = bindActionCreator(actionCreator, dispatch);
    }
  }

  return actionCreators;
}
