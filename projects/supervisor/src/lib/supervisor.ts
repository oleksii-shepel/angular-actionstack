import { BehaviorSubject, EMPTY, Observable, Observer, OperatorFunction, Subject, Subscription, concatMap, finalize, from, ignoreElements, of, tap } from "rxjs";
import { bufferize } from "./buffer";
import { ActionStack } from "./collections";
import { runSideEffectsSequentially } from "./effects";
import { Action, AnyFn, EnhancedStore, FeatureModule, MainModule, MetaReducer, Reducer, isPlainObject, kindOf } from "./types";


const actions = {
  INIT_STORE: 'INIT_STORE',
  LOAD_MODULE: 'LOAD_MODULE',
  UNLOAD_MODULE: 'UNLOAD_MODULE',
  APPLY_MIDDLEWARES: 'APPLY_MIDDLEWARES',
  REGISTER_EFFECTS: 'REGISTER_EFFECTS',
  UNREGISTER_EFFECTS: 'UNREGISTER_EFFECTS'
};

const randomString = (): string => Math.random().toString(36).substring(7).split("").join(".");

const ActionTypes = {
  INIT: `@@redux/INIT${/* @__PURE__ */ randomString()}`,
  REPLACE: `@@redux/REPLACE${/* @__PURE__ */ randomString()}`,
  PROBE_UNKNOWN_ACTION: (): string => `@@redux/PROBE_UNKNOWN_ACTION${randomString()}`
};

const actionTypes_default = ActionTypes;

// Define the action creators
const actionCreators = {
  initStore: () => ({ type: actions.INIT_STORE }),
  applyMiddlewares: () => ({ type: actions.APPLY_MIDDLEWARES }),
  registerEffects: () => ({ type: actions.REGISTER_EFFECTS }),
  loadModule: (module: FeatureModule) => ({ type: actions.LOAD_MODULE, payload: module }),
  unloadModule: (module: FeatureModule) => ({ type: actions.UNLOAD_MODULE, payload: module }),
  unregisterEffects: (module: FeatureModule) => ({ type: actions.UNREGISTER_EFFECTS, payload: module }),
};

export function createStore(mainModule: MainModule) {

  let store = initStore(mainModule);
  store = applyMiddleware(store);
  store = injectDependencies(store);
  store = registerEffects(store);

  let action$ = store.actionStream.asObservable();

  let subscription = action$.pipe(
    tap(() => store.isProcessing.next(true)),
    processAction(store, store.actionStack),
    tap(() => store.isProcessing.next(false))
  ).subscribe();

  store.dispatch(actionCreators.initStore());

  return {
    ...store,
    subscription
  };
}

function initStore(mainModule: MainModule): EnhancedStore {

  const MAIN_MODULE_DEFAULT = {
    middlewares: [],
    reducer: (state: any = {}, action: Action<any>) => state,
    effects: []
  };

  const MODULES_DEFAULT: FeatureModule[] = [];

  const PIPELINE_DEFAULT = {
    middlewares: [],
    reducer: (state: any = {}, action: Action<any>) => state,
    effects: []
  };

  const ACTION_STREAM_DEFAULT = new Subject<Action<any>>();
  const ACTION_STACK_DEFAULT = new ActionStack();

  const CURRENT_STATE_DEFAULT = new BehaviorSubject<any>({});

  const DISPATCHING_DEFAULT = new BehaviorSubject(false);

  let enhancedStore = {
    mainModule: Object.assign(MAIN_MODULE_DEFAULT, mainModule),
    modules: MODULES_DEFAULT,
    pipeline: Object.assign(PIPELINE_DEFAULT, mainModule),
    actionStream: ACTION_STREAM_DEFAULT,
    actionStack: ACTION_STACK_DEFAULT,
    currentState: CURRENT_STATE_DEFAULT,
    isProcessing: DISPATCHING_DEFAULT
  } as any;

  enhancedStore = {
    ...enhancedStore,
    dispatch: (action: Action<any>) => dispatch(enhancedStore, action),
    getState: () => enhancedStore.currentState.value,
    addReducer: (featureKey: string, reducer: Reducer) => addReducer(enhancedStore, featureKey, reducer),
    subscribe: (next?: AnyFn | Observer<any>, error?: AnyFn, complete?: AnyFn) => subscribe(enhancedStore, next, error, complete),

    loadModule: (module: FeatureModule) => loadModule(enhancedStore, module),
    unloadModule: (module: FeatureModule) => unloadModule(enhancedStore, module),
  } as EnhancedStore;

  return enhancedStore;
};

function loadModule(store: EnhancedStore, module: FeatureModule): EnhancedStore {
  // Check if the module already exists in the store's modules
  if (store.modules.some(m => m.slice === module.slice)) {
    // If the module already exists, return the store without changes
    return store;
  }

  // Setup the reducers
  store = setupReducer(store);

  // Inject dependencies
  store = injectDependencies(store);

  // Create a new array with the module added to the store's modules
  const newModules = [...store.modules, module];

  // Register the module's effects
  const newEffects = [...store.pipeline.effects, ...module.effects];

  // Return a new store with the updated properties
  return { ...store, modules: newModules, pipeline: {...store.pipeline, effects: newEffects }};
}

function unloadModule(store: EnhancedStore, module: FeatureModule): EnhancedStore {
  // Create a new array with the module removed from the store's modules
  const newModules = store.modules.filter(m => m.slice !== module.slice);

  // Setup the reducers
  store = setupReducer(store);

  // Eject dependencies
  store = ejectDependencies(store, module);

  // Unregister the module's effects
  store = unregisterEffects(store, module);

  // Return a new store with the updated properties
  return { ...store };
}

function injectDependencies(store: EnhancedStore): EnhancedStore {
  let dependencies = store.mainModule.dependencies ? {...store.mainModule.dependencies} : {};
  for (const module of store.modules) {
    for (const key in module.dependencies) {
      if (dependencies.hasOwnProperty(key)) {
        throw new Error(`Dependency property ${key} in module ${module.slice} conflicts with an existing dependency.`);
      }
      dependencies[key] = module.dependencies[key];
    }
  }

  return { ...store, pipeline: { ...store.pipeline, dependencies } };
}

function ejectDependencies(store: EnhancedStore, module: FeatureModule): EnhancedStore {

  let dependencies = store.pipeline.dependencies;
  delete dependencies[module.slice];

  return { ...store, pipeline: { ...store.pipeline, dependencies } };
}

function registerEffects(store: EnhancedStore): EnhancedStore {
  // Iterate over each module and add its effects to the pipeline
  let effects = store.mainModule.effects ? [...store.mainModule.effects] : [];
  for (const module of store.modules) {
    effects.push(...module.effects);
  }

  return { ...store, pipeline: { ...store.pipeline, effects } };
}

function unregisterEffects(store: EnhancedStore, module: FeatureModule): EnhancedStore {
  // Create a new array excluding the effects of the module to be unloaded
  const remainingEffects = store.pipeline.effects.filter(effect => !module.effects.includes(effect));

  // Return the array of remaining effects
  return { ...store, pipeline: { ...store.pipeline, effects: remainingEffects } };
}

function setupReducer(store: EnhancedStore): EnhancedStore {
  // Get the main module reducer
  const mainReducer = store.mainModule.reducer;

  // Get the feature module reducers
  const featureReducers = store.modules.reduce((reducers, module) => {
    reducers[module.slice] = module.reducer;
    return reducers;
  }, {} as Record<string, Reducer>);

  // Combine the main module reducer with the feature module reducers
  const combinedReducer = (state: any, action: Action<any>) => {
    let newState = mainReducer(state, action);

    Object.keys(featureReducers).forEach((key) => {
      newState[key] = featureReducers[key];
    });

    return newState;
  };

  return { ...store, pipeline: { ...store.pipeline, reducer: combinedReducer }};
}

export function processAction(store: EnhancedStore, actionStack: ActionStack): OperatorFunction<Action<any>, void> {
  return (source: Observable<Action<any>>) => {
    actionStack.clear();
    return source.pipe(
      concatMap((action: Action<any>) => {
        let state = store.pipeline.reducer(store.currentState.value, action);
        store.currentState.next(state);
        return runSideEffectsSequentially(store.pipeline.effects, store.pipeline.dependencies)([of(action), of(state)]).pipe(
          concatMap((childActions: Action<any>[]) => {
            if (childActions.length > 0) {
              return from(childActions).pipe(
                tap((nextAction: Action<any>) => store.dispatch(nextAction))
              );
            }

            return EMPTY;
          }),
          finalize(() => actionStack.pop())
        )}),
      ignoreElements()
    );
  }
}

function dispatch(store: EnhancedStore, action: Action<any>): any {
  if (!isPlainObject(action)) {
    throw new Error(`Actions must be plain objects. Instead, the actual type was: '${kindOf(action)}'. You may need to add middleware to your store setup to handle dispatching other values, such as 'redux-thunk' to handle dispatching functions. See https://redux.js.org/tutorials/fundamentals/part-4-store#middleware and https://redux.js.org/tutorials/fundamentals/part-6-async-logic#using-the-redux-thunk-middleware for examples.`);
  }
  if (typeof action.type === "undefined") {
    throw new Error('Actions may not have an undefined "type" property. You may have misspelled an action type string constant.');
  }
  if (typeof action.type !== "string") {
    throw new Error(`Action "type" property must be a string. Instead, the actual type was: '${kindOf(action.type)}'. Value was: '${action.type}' (stringified)`);
  }

  store.actionStream.next(action);
}

function subscribe(store: EnhancedStore, next?: AnyFn | Observer<any>, error?: AnyFn, complete?: AnyFn): Subscription {
  if (typeof next === 'function') {
    return store.currentState.subscribe({next, error, complete});
  } else {
    return store.currentState.subscribe(next as Partial<Observer<any>>);
  }
}

function combineReducers(reducers: Record<string, Reducer>): Reducer {
  const reducerKeys = Object.keys(reducers);
  const finalReducers: any = {};

  for (const key of reducerKeys) {
    if (typeof reducers[key] === "function") {
      finalReducers[key] = reducers[key];
    }
  }

  const finalReducerKeys = Object.keys(finalReducers);

  return function combination(state = {} as any, action: Action<any>): any {

    const nextState: any = {};
    let hasChanged = false;

    for (const key of finalReducerKeys) {
      const reducer = finalReducers[key];
      const previousStateForKey = state[key];
      const nextStateForKey = reducer(previousStateForKey, action);

      if (typeof nextStateForKey === "undefined") {
        const actionType = action && action.type;
        throw new Error(`When called with an action of type ${actionType ? `"${String(actionType)}"` : "(unknown type)"}, the slice reducer for key "${key}" returned undefined. To ignore an action, you must explicitly return the previous state. If you want this reducer to hold no value, you can return null instead of undefined.`);
      }

      nextState[key] = nextStateForKey;
      hasChanged = hasChanged || nextStateForKey !== previousStateForKey;

      if (hasChanged) {
        break;
      }
    }

    if (!hasChanged && finalReducerKeys.length === Object.keys(state).length) {
      return state;
    }

    return nextState;
  };
}

function replaceReducer(store: EnhancedStore, nextReducer: Reducer): void {
  if (typeof nextReducer !== "function") {
    throw new Error(`Expected the nextReducer to be a function. Instead, received: '${kindOf(nextReducer)}`);
  }
  store.pipeline.reducer = nextReducer;
}

function addReducer(store: EnhancedStore, featureKey: string, reducer: Reducer) {
  let reducers = {} as Record<string, any>;
  for (let module of store.modules) {
    const featureReducer = module.reducer;
    reducers[module.slice] = featureReducer;
  }

  reducers[featureKey] = reducer;
  let combination = combineReducers(reducers);

  let mainReducer: MetaReducer = (reducer: Reducer) => (state: any, action: Action<any>) => {
    return (state: any, action: Action<any>) => {
      const newState = store.mainModule.reducer(state, action);
      return reducer(newState, action);
    }
  }

  replaceReducer(store, mainReducer(combination));
}

function compose(...funcs: AnyFn[]): AnyFn {
  if (funcs.length === 0) {
    return (arg: any): any => arg;
  }

  if (funcs.length === 1) {
    return funcs[0];
  }

  return funcs.reduce((a, b) => (...args: any[]) => a(b(...args)));
}

function applyMiddleware(store: EnhancedStore): EnhancedStore {

  let dispatch = (action: any, ...args: any[]) => {
    throw new Error("Dispatching while constructing your middleware is not allowed. Other middleware would not be applied to this dispatch.");
  }

  const middlewareAPI = {
    getState: store.getState,
    dispatch: (action: any, ...args: any[]) => dispatch(action, ...args),
    isProcessing: store.isProcessing,
    actionStack: store.actionStack,
    dependencies: () => store.pipeline.dependencies
  };

  const middlewares = [bufferize, ...store.mainModule.middlewares];
  const chain = middlewares.map(middleware => middleware(middlewareAPI));
  dispatch = compose(...chain)(store.dispatch);

  return {
    ...store,
    dispatch
  };
}


