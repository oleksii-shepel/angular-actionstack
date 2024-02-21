import { BehaviorSubject, EMPTY, Observable, Observer, Subject, Subscription, combineLatest, concatMap, finalize, from, ignoreElements, mergeMap, of, tap } from "rxjs";
import { ActionStack } from "./collections";
import { runSideEffectsInParallel, runSideEffectsSequentially } from "./effects";
import { starter } from "./starter";
import { AsyncObserver, CustomAsyncSubject } from "./subject";
import { Action, AnyFn, EnhancedStore, FeatureModule, MainModule, MemoizedSelector, Reducer, SideEffect, StoreEnhancer, isPlainObject, kindOf } from "./types";

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

export function createStore(mainModule: MainModule, enhancer?: StoreEnhancer) {

  let storeCreator = (mainModule: MainModule) => {
    let store = initStore(mainModule);
    store = applyMiddleware(store);

    let action$ = store.actionStream.asObservable();

    let subscription = action$.pipe(
      processAction(store)
    ).subscribe();

    store.dispatch(actionCreators.initStore());

    return {
      ...store,
      subscription
    };
  }

  if (typeof enhancer !== "undefined") {
    if (typeof enhancer !== "function") {
      throw new Error(`Expected the enhancer to be a function. Instead, received: '${kindOf(enhancer)}'`);
    }
    // Apply the enhancer to the store
    return enhancer(storeCreator)(mainModule);
  }

  return storeCreator(mainModule);
}

function initStore(mainModule: MainModule): EnhancedStore {

  const MAIN_MODULE_DEFAULT = {
    middlewares: [],
    reducer: (state: any = {}, action: Action<any>) => state,
    dependencies: {},
    strategy: "exclusive"
  };

  const MODULES_DEFAULT: FeatureModule[] = [];

  const PIPELINE_DEFAULT = {
    middlewares: [],
    reducer: (state: any = {}, action: Action<any>) => state,
    effects: [],
    dependencies: {},
    strategy: "exclusive"
  };

  const ACTION_STREAM_DEFAULT = new Subject<Action<any>>();
  const ACTION_STACK_DEFAULT = new ActionStack();

  const CURRENT_STATE_DEFAULT = new CustomAsyncSubject<any>({});

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
    dispatch: function (action: Action<any>)  { return dispatch(enhancedStore, action); },
    getState: function () { return enhancedStore.currentState.value; },
    subscribe: function (next?: AnyFn | Observer<any>, error?: AnyFn, complete?: AnyFn) { return Object.assign(this, {...this, ...subscribe(enhancedStore, next, error, complete) }); },
    select: function (selector: MemoizedSelector) { return Object.assign(this, {...this, ...select(enhancedStore, selector) }); },
    attach: function (...args: (SideEffect | any)[]) { return Object.assign(this, {...this, ...attach(this, ...args) }); },
    detach: function (...effects: SideEffect[]) { return Object.assign(this, {...this, ...detach(this, ...effects) }); },
    loadModule: function (module: FeatureModule) { return Object.assign(this, {...this, ...loadModule(this, module) }); },
    unloadModule: function (module: FeatureModule) { return Object.assign(this, {...this, ...unloadModule(this, module) }); },
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

  // Return a new store with the updated properties
  store.modules = newModules;
  return store;
}

function unloadModule(store: EnhancedStore, module: FeatureModule): EnhancedStore {
  // Create a new array with the module removed from the store's modules
  const newModules = store.modules.filter(m => m.slice !== module.slice);

  // Setup the reducers
  store = setupReducer(store);

  // Eject dependencies
  store = ejectDependencies(store, module);

  // Return a new store with the updated properties
  store.modules = newModules;
  return store;
}

function select(store: EnhancedStore, selector: MemoizedSelector): Observable<any> {

  return new Observable(observer => {
    const unsubscribe = store.subscribe(() => {
      observer.next(selector(store.getState()));
    });
    return unsubscribe;
  });
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

  store.pipeline.dependencies = dependencies;
  return store;
}

function ejectDependencies(store: EnhancedStore, module: FeatureModule): EnhancedStore {

  let dependencies = store.pipeline.dependencies;
  delete dependencies[module.slice];

  store.pipeline.dependencies = dependencies;
  return store;
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
      newState[key] = featureReducers[key](newState[key], action);
    });

    return newState;
  };

  store.pipeline.reducer = combinedReducer;
  return store;
}


export function processAction(store: EnhancedStore) {
  return (source: Observable<Action<any>>) => {
    const runSideEffects = store.pipeline.strategy === "concurrent" ? runSideEffectsInParallel : runSideEffectsSequentially;
    const mapMethod = store.pipeline.strategy === "concurrent" ? mergeMap : concatMap;
    return source.pipe(
      concatMap((action: Action<any>) => {
        let state = store.pipeline.reducer(store.currentState.value, action);
        return combineLatest([from(store.currentState.next(state)), runSideEffects(store.pipeline.effects.entries())([of(action), of(state)]).pipe(
          mapMethod((childActions: Action<any>[]) => {
            if (childActions.length > 0) {
              return from(childActions).pipe(
                tap((nextAction: Action<any>) => {
                  store.actionStack.push(nextAction);
                  store.dispatch(nextAction);
                }),
              );
            }
            return EMPTY;
          }),
          finalize(() => {
            if (store.actionStack.length > 0) {
              store.actionStack.pop();
            } else {
              store.isProcessing.next(false);
            }
          }))
        ])
      }),
      ignoreElements()
    );
  };
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
    return store.currentState.subscribe(next as Partial<AsyncObserver<any>>);
  }
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

  let dispatch = (action: any) => {
    throw new Error("Dispatching while constructing your middleware is not allowed. Other middleware would not be applied to this dispatch.");
  }

  const internalAPI = {
    getState: store.getState,
    dispatch: (action: any) => dispatch(action),
    isProcessing: store.isProcessing,
    actionStack: store.actionStack,
    dependencies: () => store.pipeline.dependencies,
    strategy: () => store.pipeline.strategy
  };

  const middlewareAPI = {
    getState: store.getState,
    dispatch: (action: any) => dispatch(action),
  };

  const middlewares = [starter, ...store.pipeline.middlewares];
  const chain = middlewares.map(middleware => middleware(middleware.internal ? internalAPI : middlewareAPI));
  dispatch = compose(...chain)(store.dispatch);

  store.dispatch = dispatch;
  return store;
}

function attach(store: EnhancedStore, ...args: (SideEffect | any)[]): EnhancedStore {
  let dependencies = {};
  let effects: SideEffect[] = [];

  if (typeof args[args.length - 1] !== "function") {
    dependencies = args.pop();
  }

  effects = args;

  let newEffects = new Map(store.pipeline.effects);

  effects.forEach((effect) => {
    newEffects.set(effect, dependencies);
  });

  store.pipeline.effects = newEffects;
  return store;
}



function detach(store: EnhancedStore, ...effects: SideEffect[]): EnhancedStore {
  let newEffects = new Map(store.pipeline.effects);

  effects.forEach((effect) => {
    newEffects.delete(effect);
  });

  store.pipeline.effects = newEffects;
  return store;
}
