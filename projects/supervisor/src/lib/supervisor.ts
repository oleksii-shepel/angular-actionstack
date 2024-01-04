import { Action, Reducer, StoreCreator, StoreEnhancer, compose } from "redux-replica";
import { BehaviorSubject, Observable, OperatorFunction, ReplaySubject, concatAll, concatMap, filter, from, map, mergeMap, of, tap } from "rxjs";
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
const actionCreators = {
  initStore: () => ({ type: actions.INIT_STORE }),
  applyMiddlewares: () => ({ type: actions.APPLY_MIDDLEWARES }),
  registerEffects: () => ({ type: actions.REGISTER_EFFECTS }),
  loadModule: (module: FeatureModule) => ({ type: actions.LOAD_MODULE, payload: module }),
  unloadModule: (module: FeatureModule) => ({ type: actions.UNLOAD_MODULE, payload: module }),
  unregisterEffects: (module: FeatureModule) => ({ type: actions.UNREGISTER_EFFECTS, payload: module }),
};

export function supervisor(mainModule: MainModule) {

  function runSideEffectsSequentially(sideEffects: SideEffect[]) {
    return concatMap(([action, state]: [any, any]) =>
      sideEffects.map((sideEffect: SideEffect) => from(sideEffect(of(action), of(state)))));
  }

  function runSideEffectsInParallel(sideEffects: SideEffect[]) {
    return mergeMap(([action, state]: [any, any]) =>
      sideEffects.map((sideEffect: SideEffect) => from(sideEffect(of(action), of(state)))));
  }

  function scanWithAction<T, R>(reducer: (acc: R, value: T) => R, seed: R): OperatorFunction<T, [T, R]> {
    return (source: Observable<T>) => source.pipe(
      map(value => {
        const newState = reducer(seed, value);
        return [value, newState] as [T, R];
      })
    );
  }

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

    let store = createStore(reducer, preloadedState, enhancer) as EnhancedStore;

    store = init(store)(mainModule);
    store = patchDispatch(store);
    store = registerEffects(store);

    let subscription = store.actionStream.pipe(
      concatMap(action => action),
      tap(() => store.isDispatching = true),
      scanWithAction(store.pipeline.reducer, store.currentState.value),
      tap(() => store.isDispatching = false),
      tap(([, state]) => store.currentState.next(state)),
      runSideEffectsSequentially(store.pipeline.effects),
      concatAll(),
      filter(action => action),
      tap((action) => store.dispatch(action))
    ).subscribe()

    store.dispatch(actionCreators.initStore());

    return {
      subscription,
      initStore: init,
      loadModule: load,
      unloadModule: unload,
      dispatch: store.dispatch,
      getState: store.dispatch,
      addReducer: store.addReducer,
      subscribe: store.subscribe
    };
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
  } as any;
};

export function loadModule(store: EnhancedStore, module: FeatureModule): EnhancedStore {
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

export function unloadModule(store: EnhancedStore, module: FeatureModule): EnhancedStore {
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
function patchDispatch(store: EnhancedStore): EnhancedStore {
  // Save the original dispatch function
  const originalDispatch = store.dispatch;

  // Patch the dispatch function
  const dispatch = function(action: Action<any>) {
    // Dispatch the action as usual
    originalDispatch(action);
    // Also pass the action to the actionStream
    store.actionStream.next(of(action));
  };

  return { ...store, dispatch };
}

