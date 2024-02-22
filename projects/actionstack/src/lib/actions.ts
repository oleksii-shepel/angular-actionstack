import { isAction, kindOf } from "./types";

export function createAction(typeOrThunk: string | Function, payloadCreator?: Function): any {
  function actionCreator(...args: any[]) {
    if (typeof typeOrThunk === 'function') {
      return async (dispatch: Function, getState: Function, dependencies: any) => {
        return await typeOrThunk(...args)(dispatch, getState, dependencies);
      }
    } else if (payloadCreator) {
      let result = payloadCreator(...args);
      if (!result) {
        throw new Error('payloadCreator did not return an object');
      }

      return {
        type: typeOrThunk,
        payload: result.payload,
        ...('meta' in result && { meta: result.meta }),
        ...('error' in result && { error: result.error }),
      }
    }
    return { type: typeOrThunk, payload: args[0] };
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
