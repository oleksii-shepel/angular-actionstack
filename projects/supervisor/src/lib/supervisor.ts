import { BehaviorSubject, EMPTY, Observable, Observer, OperatorFunction, Subject, Subscription, concatMap, finalize, from, ignoreElements, of, tap } from "rxjs";
import { bufferize } from "./buffer";
import { ActionStack } from "./collections";
import { runSideEffectsSequentially } from "./effects";
import { Action, AnyFn, AsyncAction, EnhancedStore, FeatureModule, MainModule, Reducer, Store, StoreCreator, StoreEnhancer, isPlainObject, kindOf } from "./types";


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

export function createStore(reducer: Reducer, preloadedState?: any, enhancer?: StoreEnhancer): Store {

  if (typeof reducer !== "function") {
    throw new Error(`Expected the root reducer to be a function. Instead, received: '${kindOf(reducer)}'`);
  }

  if ((typeof preloadedState === "function" && typeof enhancer === "function") || (typeof enhancer === "function" && typeof arguments[3] === "function")) {
    throw new Error("It looks like you are passing several store enhancers to createStore(). This is not supported. Instead, compose them together to a single function. See https://redux.js.org/tutorials/fundamentals/part-4-store#creating-a-store-with-enhancers for an example.");
  }

  if (typeof preloadedState === "function" && typeof enhancer === "undefined") {
    enhancer = preloadedState;
    preloadedState = undefined;
  }

  if (typeof enhancer !== "undefined") {
    if (typeof enhancer !== "function") {
      throw new Error(`Expected the enhancer to be a function. Instead, received: '${kindOf(enhancer)}'`);
    }
    return enhancer(createStore)(reducer, preloadedState);
  }

  let reducers = {main: reducer} as Record<string, Reducer>;
  let currentReducer = combineReducers(reducers);
  let currentState = new BehaviorSubject<any>(preloadedState);
  let isDispatching = false;

  function getState(): any {
    return currentState.value;
  }

  function subscribe(next?: AnyFn | Observer<any>, error?: AnyFn, complete?: AnyFn): Subscription {
    if (typeof next === 'function') {
      return currentState.subscribe({next, error, complete});
    } else {
      return currentState.subscribe(next as Partial<Observer<any>>);
    }
  }

  function dispatch(action: Action<any>): any {
    if (!isPlainObject(action)) {
      throw new Error(`Actions must be plain objects. Instead, the actual type was: '${kindOf(action)}'. You may need to add middleware to your store setup to handle dispatching other values, such as 'redux-thunk' to handle dispatching functions. See https://redux.js.org/tutorials/fundamentals/part-4-store#middleware and https://redux.js.org/tutorials/fundamentals/part-6-async-logic#using-the-redux-thunk-middleware for examples.`);
    }
    if (typeof action.type === "undefined") {
      throw new Error('Actions may not have an undefined "type" property. You may have misspelled an action type string constant.');
    }
    if (typeof action.type !== "string") {
      throw new Error(`Action "type" property must be a string. Instead, the actual type was: '${kindOf(action.type)}'. Value was: '${action.type}' (stringified)`);
    }
    if (isDispatching) {
      throw new Error("Reducers may not dispatch actions.");
    }

    processAction(action);
    return action;
  }

  function processAction(action: Action<any>): void {
    try {
      isDispatching = true;
      const nextState = currentReducer(currentState.value, action);
      currentState.next(nextState);
    } finally {
      isDispatching = false;
    }
  }

  function replaceReducer(nextReducer: Reducer): void {
    if (typeof nextReducer !== "function") {
      throw new Error(`Expected the nextReducer to be a function. Instead, received: '${kindOf(nextReducer)}`);
    }
    currentReducer = nextReducer;
    dispatch({
      type: actionTypes_default.REPLACE
    });
  }

  function addReducer(featureKey: string, reducer: Reducer) {
    reducers[featureKey] = reducer;
    replaceReducer(combineReducers(reducers));
  }

  dispatch({
    type: actionTypes_default.INIT
  });

  return {
    dispatch,
    getState,
    addReducer,
    subscribe
  }
}

export function supervisor(mainModule: MainModule) {

  function init(store: EnhancedStore) {
    return (module: MainModule) => initStore(store, module);
  }

  function load(store: EnhancedStore) {
    return (module: FeatureModule) => loadModule(store, module);
  }

  function unload(store: EnhancedStore) {
    return (module: FeatureModule) => unloadModule(store, module);
  }

  return (createStore: StoreCreator) => (reducer: Reducer, preloadedState?: any, enhancer?: StoreEnhancer) => {
    let store = createStore(reducer, preloadedState) as EnhancedStore;

    store = init(store)(mainModule);
    store = patchDispatch(store);
    store = applyMiddleware(store);
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
      subscription,
      initStore: init,
      loadModule: load,
      unloadModule: unload,
      dispatch: store.dispatch,
      getState: store.getState,
      addReducer: store.addReducer,
      subscribe: store.subscribe
    };
  };
}

function initStore(store: Store, mainModule: MainModule): EnhancedStore {

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

  return {
    ...store,
    initStore: () => { throw new Error('initStore method is not defined'); },
    loadModule: () =>  { throw new Error('loadModule method is not defined'); },
    unloadModule: () => { throw new Error('unloadModule method is not defined'); },
    mainModule: Object.assign(MAIN_MODULE_DEFAULT, mainModule),
    modules: MODULES_DEFAULT,
    pipeline: Object.assign(PIPELINE_DEFAULT, mainModule),
    actionStream: ACTION_STREAM_DEFAULT,
    actionStack: ACTION_STACK_DEFAULT,
    currentState: CURRENT_STATE_DEFAULT,
    isProcessing: DISPATCHING_DEFAULT
  };
};

function loadModule(store: EnhancedStore, module: FeatureModule): EnhancedStore {
  // Check if the module already exists in the store's modules
  if (store.modules.some(m => m.slice === module.slice)) {
    // If the module already exists, return the store without changes
    return store;
  }

  store = setupReducer(store);

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

  // Unregister the module's effects
  store = unregisterEffects(store, module);

  // Return a new store with the updated properties
  return { ...store };
}

function registerEffects(store: EnhancedStore): EnhancedStore  {
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


function patchDispatch(store: EnhancedStore): EnhancedStore {
  let result = { ...store };

  result.dispatch = (action: Action<any> | AsyncAction<any>) => {
    // If action is of type Action<any>, return Observable of action
    if (typeof action === 'object' && (action as any)?.type) {
      result.actionStream.next(action);
    }
  };

  return result;
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


