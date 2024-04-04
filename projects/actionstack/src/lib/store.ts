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
  dispatchSystemActions = false;
  awaitStatePropagation = true;
  enableMetaReducers = true;
  enableAsyncReducers = true;
};

const SYSTEM_ACTION_TYPES = [
  "INITIALIZE_STATE",
  "UPDATE_STATE",
  "STORE_INITIALIZED",
  "MODULE_LOADED",
  "MODULE_UNLOADED",
  "EFFECTS_REGISTERED",
  "EFFECTS_UNREGISTERED"
] as const;

// Define the type from the values of the array
export type SystemActionTypes = typeof SYSTEM_ACTION_TYPES[number] & string;

export function isSystemActionType(type: string): type is SystemActionTypes {
  return SYSTEM_ACTION_TYPES.includes(type as SystemActionTypes);
}

function systemAction<T extends SystemActionTypes>(type: T, payload?: Function) {
  return action(type, payload);
}

// Define the action creators
const systemActions = {
  initializeState: systemAction("INITIALIZE_STATE"),
  updateState: systemAction("UPDATE_STATE"),
  storeInitialized: systemAction("STORE_INITIALIZED"),
  moduleLoaded: systemAction("MODULE_LOADED", (module: FeatureModule) => ({module})),
  moduleUnloaded: systemAction("MODULE_UNLOADED", (module: FeatureModule) => ({module})),
  effectsRegistered: systemAction("EFFECTS_REGISTERED", (effects: SideEffect[]) => ({effects})),
  effectsUnregistered: systemAction("EFFECTS_UNREGISTERED", (effects: SideEffect[]) => ({effects}))
};

export class Store {
  protected mainModule: MainModule = {
    slice: "main",
    middleware: [],
    reducer: (state: any = {}, action: Action<any>) => state,
    metaReducers: [],
    dependencies: {},
    strategy: "exclusive" as "exclusive"
  };
  protected modules: FeatureModule[] = [];
  protected pipeline = {
    middleware: [] as any[],
    reducer: (state: any = {}, action: Action<any>) => state as Reducer,
    dependencies: {} as Record<string, any>,
    strategy: "exclusive" as "exclusive" | "concurrent"
  };
  protected actionStream = new Subject<Action<any>>();
  protected actionStack = new Stack();
  protected currentAction = new CustomAsyncSubject<any>();
  protected currentState = new CustomAsyncSubject<any>();
  protected isProcessing = new BehaviorSubject<boolean>(false);
  protected subscription = Subscription.EMPTY;
  protected systemActions: Record<keyof typeof systemActions, any> = { ...systemActions };
  protected settings = Object.assign({}, new StoreSettings(), inject(StoreSettings));

  static create(mainModule: MainModule, enhancer?: StoreEnhancer) {

    let storeCreator = (mainModule: MainModule) => {

      let store = new Store();

      mainModule = Object.assign(store.mainModule, { ...mainModule });

      store.mainModule = mainModule;
      store.pipeline = Object.assign(store.pipeline, {
        middleware: Array.from(mainModule.middleware ?? []),
        reducer: mainModule.reducer,
        dependencies: Object.assign({}, { ...mainModule.dependencies }),
        strategy: mainModule.strategy,
      });

      store.applyMiddleware();

      let action$ = store.actionStream.asObservable();

      store.subscription = action$.pipe(
        scan((acc, action: any) => ({count: acc.count + 1, action}), {count: 0, action: undefined}),
        concatMap(({count, action}: any) => (count === 1) ? (console.log("%cYou are using ActionStack. Happy coding! 🎉", "font-weight: bold;"),
          store.updateState("@global", () => store.setupReducer(), action)) : of(action)),
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
    let currentState: any = Object.keys(edges).length > 0 ? initialState: {...initialState};
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
        currentObj = currentObj[key] = currentEdges[key] ? currentObj[key] : { ...currentObj[key] };
        currentEdges = (currentEdges[key] = currentEdges[key] ?? {}) as any;
      }
    }
    return currentState;
  }

  protected setState<T = any>(state?: any, slice?: keyof T | string[], value?: any, edges: Tree<boolean> = {}): any {
    state = state ?? this.currentState.value;
    if (slice === undefined || typeof slice === "string" && slice == "@global") {
      // update the whole state with a shallow copy of the value
      return ({...value});
    } else if (typeof slice === "string") {
      // update the state property with the given key with a shallow copy of the value
      const updatedState = {...state, [slice]: { ...value }};
      edges[slice] = true; // Mark this property as modified
      return updatedState;
    } else if (Array.isArray(slice)) {
      return this.applyChange(state, {path: slice, value}, edges);
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
      let newState = await this.setState(this.currentState.value, slice, result);

      let stateUpdated = this.currentState.next(newState);
      let actionHandled = this.currentAction.next(action);

      if (this.settings.awaitStatePropagation) {
        await Promise.allSettled([stateUpdated, actionHandled]);
      }

      return action;
    })());
  }

  protected combineReducers(reducers: Tree<Reducer>): Reducer {
    // Create a map for reducers
    const reducerMap = new Map<Reducer, string[]>();

    const buildReducerMap = (tree: Tree<Reducer>, path: string[] = []) => {
      for (const key in tree) {
        const reducer = tree[key]; const newPath = [...path, key]; // Add current key to the path
        if(reducer instanceof Function) {
          reducerMap.set(reducer, newPath);
        }
        else if (typeof reducer === 'object') {
          buildReducerMap(reducer, newPath);
        }
      }
    };

    buildReducerMap(reducers);

    const combinedReducer = async (state: any = {}, action: Action<any>) => {
      // Apply every reducer to state and track changes
      let modified = {};
      for (const [reducer, path] of reducerMap) {
        try {
          const currentState = await this.getState(path);
          const updatedState = await reducer(currentState, action);
          if(currentState !== updatedState) { state = await this.setState(state, path, updatedState, modified); }
        } catch (error: any) {
          console.warn(`Error occurred while processing an action ${action.type} for ${path.join('.')}: ${error.message}`);
        }
      }
      return state;
    };
    return combinedReducer;
  }

  protected async setupReducer(state: any = {}): Promise<any> {

    let featureReducers = [{slice: this.mainModule.slice!, reducer: this.mainModule.reducer}, ...this.modules].reduce((reducers, module) => {
      let moduleReducer: any = module.reducer instanceof Function ? module.reducer : {...module.reducer};
      reducers = {...reducers, [module.slice]: moduleReducer};
      return reducers;
    }, {} as Tree<Reducer>);

    let reducer = this.combineReducers(featureReducers);

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

    // Update store state
    return reducer(state, systemActions.updateState());
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

    const chain = [starter(isValidMiddleware(starter.signature) ? starterAPI : middlewareAPI), ...this.pipeline.middleware.map(middleware => middleware(middlewareAPI))];
    dispatch = compose(...chain)(this.dispatch.bind(this));

    this.dispatch = dispatch;
    return this;
  }

  protected processSystemAction(operator: (obs: Observable<any>) => Observable<any>) {
    return (async() => await firstValueFrom(this.isProcessing.pipe(filter(value => value === false),
      tap(() => this.isProcessing.next(true)),
      operator,
      catchError(error => { console.warn(error.message); return EMPTY; }),
      finalize(() => this.isProcessing.next(false))
    )))();
  }

  extend(...args: SideEffect[]) {
    const dependencies = this.pipeline.dependencies;
    const runSideEffects = this.pipeline.strategy === "concurrent" ? runSideEffectsInParallel : runSideEffectsSequentially;
    const mapMethod = this.pipeline.strategy === "concurrent" ? mergeMap : concatMap;

    const effectsSubscription = from(this.processSystemAction((obs) => obs.pipe(
      concatMap(() => this.currentAction.asObservable()),
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
    ))).subscribe();

    return effectsSubscription;
  }

  loadModule(module: FeatureModule, injector: Injector) {
    this.processSystemAction((obs) => obs.pipe(
      tap(() => {
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
    ));

    return this;
  }

  unloadModule(module: FeatureModule, clearState: boolean = false) {
    this.processSystemAction((obs) => obs.pipe(
      tap(() => {
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
    ));

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

