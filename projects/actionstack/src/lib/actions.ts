import { AsyncFunction, SyncFunction, kindOf } from "./types";

export function createAction(type: string, fn?: SyncFunction<any> | AsyncFunction<any>) {
  return (...args: any[]) => async (dispatch: Function, getState?: Function, dependencies?: Record<string, any>) => {
    if (!fn) {
      dispatch({ type });
      return;
    }

    dispatch({ type: `${type}_REQUEST` });
    try {
      const data = await fn(...args)(dispatch, getState, dependencies);
      dispatch({ type: `${type}_SUCCESS`, payload: data });
      return data;
    } catch (error) {
      dispatch({ type: `${type}_FAILURE`, payload: error, error: true });
      throw error;
    }
  };
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
