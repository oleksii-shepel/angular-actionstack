import { InjectionToken, Injector, Type, inject } from "@angular/core";
import { BehaviorSubject, EMPTY, Observable, Observer, Subject, Subscription, catchError, concatMap, defaultIfEmpty, distinctUntilChanged, filter, finalize, firstValueFrom, from, ignoreElements, mergeMap, of, scan, tap, withLatestFrom } from "rxjs";
import { action, bindActionCreators } from "./actions";
import { Stack } from "./collections";
import { runSideEffectsInParallel, runSideEffectsSequentially } from "./effects";
import { isValidMiddleware } from "./hash";
import { starter } from "./starter";
import { AsyncObserver, CustomAsyncSubject } from "./subject";
import { Action, AnyFn, FeatureModule, MainModule, MetaReducer, Reducer, SideEffect, StoreEnhancer, Tree, isPlainObject, kindOf } from "./types";

export { createStore as store };

export class StoreSettings {
  dispatchSystemActions!: boolean;
  awaitStatePropagation!: boolean;
  enableMetaReducers!: boolean;
  enableAsyncReducers!: boolean;

  constructor() {
    Object.assign(this, StoreSettings.default);
  }

  static get default(): StoreSettings {
    return {
      dispatchSystemActions: false,
      awaitStatePropagation: true,
      enableMetaReducers: false,
      enableAsyncReducers: false,
    };
  }
}


export const systemActionTypes = {
  INITIALIZE_STATE: `INITIALIZE_STATE`,
  UPDATE_STATE: `UPDATE_STATE`,
  STORE_INITIALIZED: `STORE_INITIALIZED`,
  MODULE_LOADED: `MODULE_LOADED`,
  MODULE_UNLOADED: `MODULE_UNLOADED`,
  EFFECTS_REGISTERED: `EFFECTS_REGISTERED`,
  EFFECTS_UNREGISTERED: `EFFECTS_UNREGISTERED`
};

// Define the action creators
const systemActions = {
  initializeState: action(systemActionTypes.INITIALIZE_STATE),
  updateState: action(systemActionTypes.UPDATE_STATE),
  storeInitialized: action(systemActionTypes.STORE_INITIALIZED),
  moduleLoaded: action(systemActionTypes.MODULE_LOADED, (module: FeatureModule) => ({module})),
  moduleUnloaded: action(systemActionTypes.MODULE_UNLOADED, (module: FeatureModule) => ({module})),
  effectsRegistered: action(systemActionTypes.EFFECTS_REGISTERED, (effects: SideEffect[]) => ({effects})),
  effectsUnregistered: action(systemActionTypes.EFFECTS_UNREGISTERED, (effects: SideEffect[]) => ({effects}))
};


export class Store {
  protected mainModule: MainModule;
  protected modules: FeatureModule[];
  protected pipeline: {
    middlewares: any[];
    reducer: Reducer;
    dependencies: Record<string, any>;
    strategy: "exclusive" | "concurrent";
  };
  protected actionStream: Subject<Action<any>>;
  protected actionStack: Stack;
  protected currentAction: CustomAsyncSubject<any>;
  protected currentState: CustomAsyncSubject<any>;
  protected isProcessing: BehaviorSubject<boolean>;
  protected subscription: Subscription;
  protected systemActions: Record<keyof typeof systemActions, any>;
  protected settings: StoreSettings;

  protected constructor() {
    let STORE_SETTINGS_DEFAULT = StoreSettings.default;

    let MAIN_MODULE_DEFAULT = {
      slice: "main",
      middlewares: [],
      reducer: (state: any = {}, action: Action<any>) => state,
      metaReducers: [],
      dependencies: {},
      strategy: "exclusive" as "exclusive"
    };

    let MODULES_DEFAULT: FeatureModule[] = [];

    let PIPELINE_DEFAULT = {
      middlewares: [],
      reducer: (state: any = {}, action: Action<any>) => state,
      dependencies: {},
      strategy: "exclusive" as "exclusive"
    };

    let ACTION_STREAM_DEFAULT = new Subject<Action<any>>();
    let ACTION_STACK_DEFAULT = new Stack();

    let CURRENT_ACTION_DEFAULT = new CustomAsyncSubject<any>();
    let CURRENT_STATE_DEFAULT = new CustomAsyncSubject<any>();

    let PROCESSING_DEFAULT = new BehaviorSubject(false);
    let SUBSCRIPTION_DEFAULT = Subscription.EMPTY;
    let SYSTEM_ACTIONS_DEFAULT = { ...systemActions };

    try {
      STORE_SETTINGS_DEFAULT = Object.assign(STORE_SETTINGS_DEFAULT, inject(StoreSettings));
    } catch {
      console.warn("Failed to inject StoreSettings. Please check your configuration and try again.");
      STORE_SETTINGS_DEFAULT = STORE_SETTINGS_DEFAULT;
    }

    this.mainModule = MAIN_MODULE_DEFAULT;
    this.modules = MODULES_DEFAULT;
    this.pipeline = PIPELINE_DEFAULT;
    this.actionStream = ACTION_STREAM_DEFAULT;
    this.actionStack = ACTION_STACK_DEFAULT;
    this.currentAction = CURRENT_ACTION_DEFAULT;
    this.currentState = CURRENT_STATE_DEFAULT;
    this.isProcessing = PROCESSING_DEFAULT;
    this.subscription = SUBSCRIPTION_DEFAULT;
    this.systemActions = SYSTEM_ACTIONS_DEFAULT;
    this.settings = STORE_SETTINGS_DEFAULT;
  }

  static create(mainModule: MainModule, enhancer?: StoreEnhancer) {

    let storeCreator = (mainModule: MainModule) => {

      let store = new Store();

      mainModule = Object.assign(store.mainModule, { ...mainModule });
      
      store.mainModule = mainModule;
      store.pipeline = Object.assign(store.pipeline, {
        middlewares: Array.from(mainModule.middlewares),
        reducer: mainModule.reducer,
        dependencies: Object.assign({}, { ...mainModule.dependencies }),
        strategy: mainModule.strategy,
      });

      store.applyMiddleware();

      let action$ = store.actionStream.asObservable();

      store.subscription = action$.pipe(
        scan((acc, action: any) => ({count: acc.count + 1, action}), {count: 0, action: undefined}),
        concatMap(({count, action}: any) => (count === 1) ? store.updateState("@global", () => store.setupReducer(), systemActions.initializeState()) : of(action)),
        store.processAction()
      ).subscribe();

      store.systemActions = bindActionCreators(systemActions, (action: Action<any>) => store.settings.dispatchSystemActions && store.dispatch(action));

      store.systemActions.initializeState();
      store.systemActions.storeInitialized();

      return store;
    }

    if (typeof enhancer !== "undefined") {
      if (typeof enhancer !== "function") {
        throw new Error(`Expected the enhancer to be a function. Instead, received: '${kindOf(enhancer)}'`);
      }
      // Apply the enhancer to the this
      return enhancer(storeCreator)(mainModule);
    }

    return storeCreator(mainModule);
  }

  dispatch(action: Action<any>) {
    if (!isPlainObject(action)) {
      throw new Error(`Actions must be plain objects. Instead, the actual type was: '${kindOf(action)}'. You may need to add middleware to your setup to handle dispatching custom values.`);
    }
    if (typeof action.type === "undefined") {
      throw new Error('Actions may not have an undefined "type" property. You may have misspelled an action type string constant.');
    }
    if (typeof action.type !== "string") {
      throw new Error(`Action "type" property must be a string. Instead, the actual type was: '${kindOf(action.type)}'. Value was: '${action.type}' (stringified)`);
    }

    this.actionStream.next(action);
  }

  getState<T = any>(slice?: keyof T | string[]): any {
    if (this.currentState.value === undefined || slice === undefined || typeof slice === "string" && slice == "@global") {
      return this.currentState.value as T;
    } else if (typeof slice === "string") {
      return this.currentState.value[slice] as T;
    } else if (Array.isArray(slice)) {
      return slice.reduce((acc, key) => {
        if (acc === undefined || acc === null) {
          return undefined;
        } else if (Array.isArray(acc)) {
          return acc[parseInt(key)];
        } else {
          return acc[key];
        }
      }, this.currentState.value) as T;
    } else {
      throw new Error("Unsupported type of slice parameter");
    }
  }

  // Function to apply a single change to the state and accumulate edges
  protected applyChange(initialState: any, {path, value}: {path: string[], value: any}, edges: Tree<boolean>): any {
    let currentState: any = { ...initialState };
    let currentObj: any = currentState;
    let currentEdges: Tree<boolean> = edges;

    for (let i = 0; i < path.length; i++) {
      const key = path[i];
      if (i === path.length - 1) {
        // Reached the leaf node, update its value
        currentObj[key] = value;
        currentEdges[key] = true;
      } else {
        // Continue traversal
        currentObj = currentObj[key] = currentEdges[key] ? currentObj[key]: { ...currentObj[key] };
        currentEdges = currentEdges[key] ? currentEdges[key] : {};
      }
    }
    return currentState;
  }
                                                                                                                                      
  protected setState(slice?: keyof T | string[], value?: any, modified?: Tree<boolean> = {}): any {
    if (slice === undefined || (typeof slice === "string" && slice === "@global")) {
      // Update the whole state with a shallow copy of the value
      return { ...value };
    } else if (typeof slice === "string") {
      // Update the state property with the given key, tracking modifications
      const updatedState = {
        ...this.currentState.value,
        [slice]: { ...value },
      };
            
      modified[slice] = true; // Mark this property as modified
      return updatedState;
    } else if (Array.isArray(slice)) {
      // Update the nested state property with the given path using reduce
      const updatedState = slice.reduce((currentObj, key) => {
        if (!currentObj[key]) {
          currentObj[key] = {}; // Create a new node
        }  
        modified[key] = true; // Mark this property as modified
        return currentObj[key];
      }, { ...this.currentState.value });
      return updatedState;
    } else {
      throw new Error("Unsupported type of slice parameter");
    }
  }

  protected setState<T = any>(slice?: keyof T | string[], value?: any): any {
    if (slice === undefined || typeof slice === "string" && slice == "@global") {
      // update the whole state with a shallow copy of the value
      return ({...value});
    } else if (typeof slice === "string") {
      // update the state property with the given key with a shallow copy of the value
      return ({...this.currentState.value, [slice]: {...value}});
    } else if (Array.isArray(slice)) {
      // update the nested state property with the given path with a shallow copy of the value
      // use a helper function to recursively clone and update the object
      return cloneAndUpdate(this.currentState.value, slice, value);
    } else {
      throw new Error("Unsupported type of slice parameter");
    }
  }

  protected updateState<T = any>(slice: keyof T | string[] | undefined, callback: AnyFn, action: Action<any> = systemActions.updateState()): Observable<any> {
    return from((async () => {
      if(callback === undefined) {
        throw new Error('Callback function is missing. State will not be updated.')
      }

      let state = await this.getState(slice);
      let result = await callback(state);
      let newState = await this.setState(slice, result);

      let stateUpdated = this.currentState.next(newState);
      let actionHandled = this.currentAction.next(action);

      if (this.settings.awaitStatePropagation) {
        await Promise.allSettled([stateUpdated, actionHandled]);
      }

      return action;
    })());
  }


  subscribe(next?: AnyFn | Observer<any>, error?: AnyFn, complete?: AnyFn): Subscription {
    const stateObservable = this.currentState.asObservable().pipe(
      filter(value => value !== undefined),
      distinctUntilChanged()
    );
    if (typeof next === 'function') {
      return stateObservable.subscribe({next, error, complete});
    } else {
      return stateObservable.subscribe(next as Partial<AsyncObserver<any>>);
    }
  }

  select(selector: (obs: Observable<any>) => Observable<any>, defaultValue?: any): Observable<any> {
    let obs = selector(this.currentState.asObservable()).pipe(distinctUntilChanged());
    if (defaultValue !== undefined) {
      obs = obs.pipe(defaultIfEmpty(defaultValue));
    }
    return obs;
  }

  extend(...args: SideEffect[]) {
    const dependencies = this.pipeline.dependencies;
    const runSideEffects = this.pipeline.strategy === "concurrent" ? runSideEffectsInParallel : runSideEffectsSequentially;
    const mapMethod = this.pipeline.strategy === "concurrent" ? mergeMap : concatMap;

    const effectsSubscription = this.currentAction.asObservable().pipe(
      withLatestFrom(this.currentState.asObservable()),
      concatMap(([action, state]) => runSideEffects(...args)(action, state, dependencies).pipe(
        mapMethod((childActions: Action<any>[]) => {
          if (childActions.length > 0) {
            return from(childActions).pipe(
            tap((nextAction: Action<any>) => {
              this.actionStack.push(nextAction);
              this.dispatch(nextAction);
            }));
          }
          return EMPTY;
        })
      )),
      finalize(() => this.systemActions.effectsUnregistered(args))
    ).subscribe();

    this.systemActions.effectsRegistered(args);
    return effectsSubscription;
  }

  loadModule(module: FeatureModule, injector: Injector) {
    firstValueFrom(this.isProcessing.pipe(filter(value => value === false),
      tap(() => {
        this.isProcessing.next(true);
        // Check if the module already exists in the this's modules
        if (this.modules.some(m => m.slice === module.slice)) {
          // If the module already exists, return the this without changes
          return;
        }
        // Create a new array with the module added to the this's modules
        const newModules = [...this.modules, module];

        // Return a new this with the updated properties
        this.modules = newModules;

        // Inject dependencies
        this.injectDependencies(injector);
      }),
      concatMap(() => this.updateState("@global", state => this.setupReducer(state), systemActions.updateState())),
      tap(() => this.systemActions.moduleLoaded(module)),
      catchError(error => { console.warn(error.message); return EMPTY; }),
      finalize(() => this.isProcessing.next(false))
    ));

    return this;
  }

  unloadModule(module: FeatureModule, clearState: boolean = false) {
    firstValueFrom(this.isProcessing.pipe(filter(value => value === false),
      tap(() => {
        this.isProcessing.next(true);
        // Create a new array with the module removed from the this's modules
        const newModules = this.modules.filter(m => m.slice !== module.slice);

        // Return a new this with the updated properties
        this.modules = newModules;

        // Eject dependencies
        this.ejectDependencies(module);
      }),
      concatMap(() => this.updateState("@global", state => {
        if (clearState) {
          state = { ...state };
          delete state[module.slice];
        }
        return this.setupReducer(state);
      }, systemActions.initializeState())),
      tap(() => this.systemActions.moduleUnloaded(module)),
      catchError(error => { console.warn(error.message); return EMPTY; }),
      finalize(() => this.isProcessing.next(false))
    ));

    return this;
  }

  protected async combineReducersNew(reducers: Tree<Reducer>): Promise<[Reducer, Tree<any>, Map<string, string>]> {
    // Create a map for reducers
    const reducerMap = new Map<Reducer, string[]>();

    const buildReducerMap = (tree: Tree<Reducer>, path: string[] = []) => {
      for (const key in tree) {
        const reducer = tree[key];
        const newPath = [...path, key]; // Add current key to the path
        reducerMap.set(reducer, newPath);

        if (typeof reducer === 'object') {
          buildReducerMap(reducer, newPath);
        }
      }
    };

    buildReducerMap(reducers);

    const combinedReducer = (state: any = {}, action: Action<any>) => {
      const changesMap = new Map();

      // Apply every reducer to state and track changes
      for (const [reducer, path] of reducerMap) {
        try {
          const currentState = this.getState(path);
          const updatedState = await reducer(currentState, action);
          if(currentState !== updatedState) { changesMap.set(reducer, updatedState); }
        } catch (error: any) {
          throw new Error(`Error occurred while processing an action ${action.type} for ${path}: ${error.message}`);
        }
      }

      // Apply changes to source state
      for (const [reducer, change] of changesMap) {
        try {
          const path = reducerMap.get(reducer);
          this.setState(path);
        } catch (error: any) {
          throw new Error(`Error occurred while applying changes for ${path}: ${error.message}`);
        }
      }
    };
  }
  
  protected async combineReducers(reducers: Tree<Reducer>): Promise<[Reducer, any, Map<string, string>]> {
    let errors = new Map<string, string>();
    let featureReducers = {} as any;
    let featureState = {} as any;

    // Initialize state
    for (let key of Object.keys(reducers)) {
      try {
        if(reducers[key] instanceof Function) {
          let reducer = reducers[key] as Function;
          let reducerResult = reducer(undefined, systemActions.initializeState());

          featureState[key] = await reducerResult;
          featureReducers[key] = reducer;

          if (reducerResult instanceof Promise && this.settings.enableAsyncReducers === false) {
            throw new Error("Async reducers are disabled.");
          }
        } else {
          let [nestedReducer, nestedState, nestedErrors] = await this.combineReducers(featureReducers[key]);
          featureState[key] = nestedState;
          featureReducers[key] = nestedReducer;
          errors = new Map([...errors, ...nestedErrors]);
        }
      } catch (error: any) {
        errors.set(key, `Initializing state failed for ${key}: ${error.message}`);
      }
    }

    // Combine the main module reducer with the feature module reducers
    const combinedReducer = async (state: any = {}, action: Action<any>) => {
      let newState = state;

      for (let key of Object.keys(featureReducers)) {
        try {
          const featureState = await featureReducers[key](newState[key], action);

          if(featureState !== newState[key]){
            newState = {...newState, [key]: featureState};
          }
        } catch (error: any) {
          throw new Error(`Error occurred while processing an action ${action.type} for ${key}: ${error.message}`);
        }
      }

      return newState;
    };

    return [combinedReducer, featureState, errors];
  }

  protected hydrateState(state: any, initialState: any): any {
    // Create a new object to avoid mutating the original state
    let newState = {...state};

    // Iterate over each property in the initial state
    for (let prop in initialState) {
      // If the property is not already present in the state, add it
      if (!newState.hasOwnProperty(prop) || newState[prop] === undefined) {
        newState[prop] = initialState[prop];
      } else if (Array.isArray(initialState[prop])) {
        // If the property is an array, merge the arrays
        newState[prop] = newState[prop] ?? initialState[prop];
      } else if (typeof newState[prop] === 'object' && newState[prop] !== null) {
        // If the property is an object, recurse into it
        newState[prop] = this.hydrateState(newState[prop], initialState[prop]);
      }
    }

    return newState;
  }

  protected async setupReducer(state: any = {}): Promise<any> {

    let featureReducers = [{slice: this.mainModule.slice!, reducer: this.mainModule.reducer}, ...this.modules].reduce((reducers, module) => {
      let moduleReducer: any = module.reducer instanceof Function ? module.reducer : {...module.reducer};
      reducers = {...reducers, [module.slice]: moduleReducer};
      return reducers;
    }, {} as Tree<Reducer>);

    let [reducer, initialState, errors] = await this.combineReducers(featureReducers);

    // Update store state
    state = this.hydrateState({ ...state }, initialState);

    const asyncCompose = (...fns: MetaReducer[]) => async (reducer: Reducer) => {
      for (let i = fns.length - 1; i >= 0; i--) {
          reducer = await fns[i](reducer);
      }
      return reducer;
    };

    this.settings.enableMetaReducers && this.mainModule.metaReducers
      && this.mainModule.metaReducers.length
      && (reducer = await asyncCompose(...this.mainModule.metaReducers)(reducer));
    this.pipeline.reducer = reducer;

    if(errors.size) {
      let receivedErrors = Array.from(errors.entries()).map((value) => value[1]).join('\n');
      throw new Error(`${errors.size} errors during state initialization.\n${receivedErrors}`);
    }

    return state;
  }

  protected injectDependencies(injector: Injector): Store {
    // Initialize the new dependencies object
    let newDependencies = {} as any;

    // Combine all dependencies into one object
    let allDependencies = [this.mainModule.dependencies, ...this.modules.map(module => module.dependencies)].filter(Boolean);

    // Recursively clone and update dependencies
    allDependencies.forEach((dep: any) => {
      Object.keys(dep).forEach(key => {
        newDependencies[key] = deepCopy(dep[key]);
      });
    });

    // Initialize the pipeline dependencies object
    this.pipeline.dependencies = {} as any;

    // Create a stack for depth-first traversal of newDependencies
    let stack: { parent: any, key: string | number, subtree: any }[] = Object.keys(newDependencies).map(key => ({ parent: newDependencies, key, subtree: this.pipeline.dependencies }));

    while (stack.length > 0) {
      const { parent, key, subtree } = stack.pop()!;
      const value = parent[key];
      if (Array.isArray(value)) {
        // If value is an array, add its elements to the stack
        subtree[key] = [];
        stack.push(...value.map((v, i) => ({ parent: value, key: i, subtree: subtree[key] })));
      } else if (typeof value === 'object' && value !== null) {
        // If value is an object, add its children to the stack
        subtree[key] = {};
        stack.push(...Object.keys(value).map(childKey => ({ parent: value, key: childKey, subtree: subtree[key] })));
      } else if (typeof value === 'function' || value instanceof InjectionToken) {
        // If value is a function or an instance of InjectionToken, get the dependency from the injector
        const Dependency = value as Type<any> | InjectionToken<any>;
        subtree[key] = injector.get(Dependency);
      }
    }

    return this;
  }

  protected ejectDependencies(module: FeatureModule): Store {
    // Combine all dependencies into one object, excluding the module to eject
    let allDependencies = [this.mainModule.dependencies, ...this.modules.filter(m => m !== module).map(m => m.dependencies)].filter(Boolean);

    // Initialize the new dependencies object
    let newDependencies = {} as any;

    // Recursively clone and update dependencies
    allDependencies.forEach((dep: any) => {
      Object.keys(dep).forEach(key => {
        newDependencies[key] = deepCopy(dep[key]);
      });
    });

    // Create a stack for the DFS traversal
    let stack = [{ source: this.pipeline.dependencies, target: newDependencies }];

    while (stack.length > 0) {
      const { source, target } = stack.pop()!;
      for (const key in target) {
        if (Array.isArray(target[key])) {
          // If target[key] is an array, iterate over its elements
          for (let i = 0; i < target[key].length; i++) {
            if (typeof target[key][i] !== 'function' && !(target[key][i] instanceof InjectionToken)) {
              stack.push({ source: source[key][i], target: target[key][i] });
            } else {
              target[key][i] = source[key][i];
            }
          }
        } else if (typeof target[key] !== 'function' && !(target[key] instanceof InjectionToken)) {
          stack.push({ source: source[key], target: target[key] });
        } else {
          target[key] = source[key];
        }
      }
    }

    // Assign the newly formed dependencies object
    this.pipeline.dependencies = newDependencies;

    return this;
  }


  protected processAction() {
    return (source: Observable<Action<any>>) => {
      return source.pipe(
        concatMap((action: Action<any>) => {
          return this.updateState("@global", (state) => this.pipeline.reducer(state, action), action).pipe(
            finalize(() => (this.actionStack.pop(), this.actionStack.length === 0 && this.isProcessing.next(false)))
          );
        }),
        ignoreElements(),
        catchError((error) => {
          console.warn(error.message);
          return EMPTY;
        })
      );
    };
  }

  protected applyMiddleware(): Store {

    let dispatch = (action: any) => {
      throw new Error("Dispatching while constructing your middleware is not allowed. Other middleware would not be applied to this dispatch.");
    };

    const starterAPI = {
      getState: () => this.getState(),
      dispatch: (action: any) => dispatch(action),
      isProcessing: this.isProcessing,
      actionStack: this.actionStack,
      dependencies: () => this.pipeline.dependencies,
      strategy: () => this.pipeline.strategy
    };

    const middlewareAPI = {
      getState: () => this.getState(),
      dispatch: (action: any) => dispatch(action),
    };

    const chain = [starter(isValidMiddleware(starter.signature) ? starterAPI : middlewareAPI), ...this.pipeline.middlewares.map(middleware => middleware(middlewareAPI))];
    dispatch = compose(...chain)(this.dispatch.bind(this));

    this.dispatch = dispatch;
    return this;
  }
}

export function createStore(mainModule: MainModule, enhancer?: StoreEnhancer) {
  return Store.create(mainModule, enhancer);
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

function deepCopy(obj: any) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  let copy: any = Array.isArray(obj) ? [] : {};

  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      copy[key] = deepCopy(obj[key]);
    }
  }

  return copy;
}

function cloneAndUpdate(obj: any, path: string[], value: any, clone: boolean = true): any {
  if (path.length === 0) {
    return clone ? deepCopy(value) : value;
  }

  const index = parseInt(path[0], 10);
  const key = !isNaN(index) ? index : path[0]
  const rest = path.slice(1);

  // Check if the key is a numeric index and if so, initialize obj as an array
  obj = obj !== undefined ? obj : (!isNaN(index)) ? [] : {};

  const clonedObj = Array.isArray(obj) ? [...obj] : {...obj};

  // Initialize obj[key] if it's undefined
  clonedObj[key] = obj[key] !== undefined ? (Array.isArray(obj[key]) ? [...obj[key]] : {...obj[key]}) : (rest.length && !isNaN(parseInt(rest[0], 10)) ? [] : {});

  // Recursively update the nested property with the rest of the path
  clonedObj[key] = cloneAndUpdate(clonedObj[key], rest, value, clone);

  return clonedObj;
}
