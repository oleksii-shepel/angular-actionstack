import { FeatureModule, SideEffect, isAction, kindOf } from "./types";

export const systemActions = {
  INITIALIZE_STATE: `INITIALIZE_STATE`,
  STORE_INITIALIZED: `STORE_INITIALIZED`,
  MODULE_LOADED: `MODULE_LOADED`,
  MODULE_UNLOADED: `MODULE_UNLOADED`,
  EFFECTS_REGISTERED: `EFFECTS_REGISTERED`,
  EFFECTS_UNREGISTERED: `EFFECTS_UNREGISTERED`
};

// Define the action creators
export const systemActionCreators = {
  initializeState: createAction(systemActions.INITIALIZE_STATE),
  storeInitialized: createAction(systemActions.STORE_INITIALIZED),
  moduleLoaded: createAction(systemActions.MODULE_LOADED, (module: FeatureModule) => ({module})),
  moduleUnloaded: createAction(systemActions.MODULE_UNLOADED, (module: FeatureModule) => ({module})),
  effectsRegistered: createAction(systemActions.EFFECTS_REGISTERED, (effects: SideEffect[]) => ({effects})),
  effectsUnregistered: createAction(systemActions.EFFECTS_UNREGISTERED, (effects: SideEffect[]) => ({effects}))
};

export function createAction(typeOrThunk: string | Function, payloadCreator?: Function): any {
  function actionCreator(...args: any[]) {
    if (typeof typeOrThunk === 'function') {
      return async (dispatch, getState, dependencies) => {
        try {
          const actionResult = await typeOrThunk(...args)(dispatch, getState, dependencies);
          return actionResult;
        } catch (error) {
          console.warn(`Error in action: ${error.message}`);
          throw error;
        }
      };
    }
  
    let action: any = {
      type: typeOrThunk,
    };
  
    if (payloadCreator) {
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

  typeOrThunk = typeof typeOrThunk === "function" ? "ASYNC_ACTION" : typeOrThunk;
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
