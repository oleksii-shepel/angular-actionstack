import { Action, Reducer, StoreCreator, StoreEnhancer, compose } from "redux-replica";
import { BehaviorSubject, Observable, ReplaySubject, scan, tap } from "rxjs";
import { EnhancedStore, FeatureModule, MainModule, SideEffect, Store } from "./types";

const actions = {
  INIT_STORE: 'INIT_STORE',
  LOAD_MODULE: 'LOAD_MODULE',
  UNLOAD_MODULE: 'UNLOAD_MODULE',
  APPLY_MIDDLEWARES: 'APPLY_MIDDLEWARES',
  REGISTER_EFFECTS: 'REGISTER_EFFECTS',
  UNREGISTER_EFFECTS: 'UNREGISTER_EFFECTS'
};

// Define the action creators
export const actionCreators = {
  initStore: () => ({ type: actions.INIT_STORE }),
  applyMiddlewares: () => ({ type: actions.APPLY_MIDDLEWARES }),
  registerEffects: () => ({ type: actions.REGISTER_EFFECTS }),
  loadModule: (module: FeatureModule) => ({ type: actions.LOAD_MODULE, payload: module }),
  unloadModule: (module: FeatureModule) => ({ type: actions.UNLOAD_MODULE, payload: module }),
  unregisterEffects: (module: FeatureModule) => ({ type: actions.UNREGISTER_EFFECTS, payload: module }),
};



export function supervisor(mainModule: MainModule) {

  return (createStore: StoreCreator) => (reducer: Reducer, preloadedState?: any, enhancer?: StoreEnhancer) => {
    // Create the store as usual
    let store = createStore(reducer, preloadedState, enhancer) as EnhancedStore;

    store = initStore(store, mainModule);
    store = applyMiddlewares(store);

    // Enhance the dispatch function
    const originalDispatch = store.dispatch;
    store.dispatch = (action: Action<any>) => {
      // Handle Action
      let result = originalDispatch(action);

      action = action as Action<any>;
      if(action?.type) {
        // Handle specific actions
        switch (action.type) {
          case actions.INIT_STORE:
            break;
          case actions.LOAD_MODULE:
            store = loadModule(store, action.payload);
            break;
          case actions.UNLOAD_MODULE:
            store = unloadModule(store, action.payload);
            break;
          case actions.APPLY_MIDDLEWARES:
            break;
          case actions.REGISTER_EFFECTS:
            store = { ...store, pipeline: {...store.pipeline, effects: registerEffects(store) }};
            break;
          case actions.UNREGISTER_EFFECTS:
            store = { ...store, pipeline: {...store.pipeline, effects: unregisterEffects(store, action.payload) }};
            break;
          default:
            break;
        }
      }

      return result;
    };

    // Initialize the store with the main module
    store.dispatch(actionCreators.initStore());
    store.dispatch(actionCreators.applyMiddlewares());
    store.dispatch(actionCreators.registerEffects());

    let subscription = store.actionStream.pipe(
      tap(() => store.isDispatching = true),
      scan((state, action: any) => store.pipeline.reducer(state, action), store.currentState.value),
      tap(() => store.isDispatching = false),
      tap((state: any) => store.currentState.next(state)),
    ).subscribe()

    return { ...store, subscription };
  };
}

export function initStore(store: Store, mainModule: MainModule): EnhancedStore {
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

  const ACTION_STREAM_DEFAULT = new ReplaySubject<Observable<Action<any>>>();

  const CURRENT_STATE_DEFAULT = new BehaviorSubject<any>({});

  const DISPATCHING_DEFAULT = false;

  return {
    ...store,
    mainModule: Object.assign(MAIN_MODULE_DEFAULT, mainModule),
    modules: MODULES_DEFAULT,
    pipeline: Object.assign(PIPELINE_DEFAULT, mainModule),
    actionStream: ACTION_STREAM_DEFAULT,
    currentState: CURRENT_STATE_DEFAULT,
    isDispatching: DISPATCHING_DEFAULT
  };
};

export function loadModule(store: EnhancedStore, module: FeatureModule): EnhancedStore {
  // Check if the module already exists in the store's modules
  if (store.modules.some(m => m.slice === module.slice)) {
    // If the module already exists, return the store without changes
    return store;
  }

  // Create a new array with the module added to the store's modules
  const newModules = [...store.modules, module];

  // Setup the reducers
  const newReducer = setupReducer(store);

  // Register the module's effects
  const newEffects = [...store.pipeline.effects, ...module.effects];

  // Return a new store with the updated properties
  return {...store, modules: newModules, pipeline: {...store.pipeline, reducer: newReducer, effects: newEffects}};
}

export function unloadModule(store: EnhancedStore, module: FeatureModule): EnhancedStore {
  // Create a new array with the module removed from the store's modules
  const newModules = store.modules.filter(m => m.slice !== module.slice);

  // Setup the reducers
  const newReducer = setupReducer(store);

  // Unregister the module's effects
  const newEffects = unregisterEffects(store, module);

  // Return a new store with the updated properties
  return {...store, modules: newModules, pipeline: {...store.pipeline, reducer: newReducer, effects: newEffects}}
}

function registerEffects(store: EnhancedStore): SideEffect[]  {
  // Iterate over each module and add its effects to the pipeline
  let effects = store.mainModule.effects ? [...store.mainModule.effects] : [];
  for (const module of store.modules) {
    effects.push(...module.effects);
  }

  return effects;
}

function unregisterEffects(store: EnhancedStore, module: FeatureModule): SideEffect[] {
  // Create a new array excluding the effects of the module to be unloaded
  const remainingEffects = store.pipeline.effects.filter(effect => !module.effects.includes(effect));

  // Return the array of remaining effects
  return remainingEffects;
}


function setupReducer(store: EnhancedStore): Reducer {
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

  return combinedReducer;
}

function applyMiddlewares(store: EnhancedStore): EnhancedStore {
  // Define the middleware API
  const middlewareAPI = {
    getState: store.getState,
    dispatch: (action: Action<any>) => store.dispatch(action),
  };

  // Create a chain of middleware functions
  const chain = store.mainModule.middlewares.map(middleware => middleware(middlewareAPI));

  // Compose the middleware functions and enhance the dispatch function
  const dispatch = compose(...chain)(store.dispatch);

  return { ...store, dispatch };
}
