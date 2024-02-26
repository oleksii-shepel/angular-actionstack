import { Injector, Type } from "@angular/core";
import { BehaviorSubject, EMPTY, Observable, Observer, Subject, Subscription, combineLatest, concatMap, finalize, from, ignoreElements, mergeMap, of, tap } from "rxjs";
import { createAction } from "./actions";
import { ActionStack } from "./collections";
import { runSideEffectsInParallel, runSideEffectsSequentially } from "./effects";
import { starter } from "./starter";
import { AsyncObserver, CustomAsyncSubject } from "./subject";
import { Action, AnyFn, FeatureModule, MainModule, MemoizedFn, Reducer, SideEffect, StoreEnhancer, isBoxed, isPlainObject, isPrimitive, kindOf } from "./types";

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
  initStore: createAction(actions.INIT_STORE),
  applyMiddlewares: createAction(actions.APPLY_MIDDLEWARES),
  registerEffects: createAction(actions.REGISTER_EFFECTS),
  loadModule: createAction(actions.LOAD_MODULE, (module: MainModule) => module),
  unloadModule: createAction(actions.UNLOAD_MODULE, (module: FeatureModule) => module),
  unregisterEffects: createAction(actions.UNREGISTER_EFFECTS, (module: FeatureModule) => module)
};

export class Store {
  mainModule: MainModule;
  modules: FeatureModule[];
  pipeline: {
    middlewares: any[];
    reducer: Reducer;
    effects: Map<SideEffect, any>;
    dependencies: Record<string, any>;
    strategy: "exclusive" | "concurrent";
  };
  actionStream: Subject<Action<any>>;
  actionStack: ActionStack;
  currentState: CustomAsyncSubject<any>;
  isProcessing: BehaviorSubject<boolean>;
  subscription: Subscription;

  constructor(mainModule: MainModule) {
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

    this.mainModule = Object.assign(MAIN_MODULE_DEFAULT, mainModule);
    this.modules = MODULES_DEFAULT;
    this.pipeline = Object.assign(PIPELINE_DEFAULT, deepClone(mainModule));
    this.actionStream = ACTION_STREAM_DEFAULT;
    this.actionStack = ACTION_STACK_DEFAULT;
    this.currentState = CURRENT_STATE_DEFAULT;
    this.isProcessing = DISPATCHING_DEFAULT;
    this.subscription = Subscription.EMPTY;
  }

  static createStore(mainModule: MainModule, enhancer?: StoreEnhancer) {

    let storeCreator = (mainModule: MainModule) => {

      let store = new Store(mainModule);
      store.applyMiddleware();

      let action$ = store.actionStream.asObservable();

      store.subscription = action$.pipe(
        store.processAction()
      ).subscribe();

      store.dispatch(actionCreators.initStore());

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

  getState() {
    return this.currentState.value;
  }

  subscribe(next?: AnyFn | Observer<any>, error?: AnyFn, complete?: AnyFn): Subscription {
    if (typeof next === 'function') {
      return this.currentState.subscribe({next, error, complete});
    } else {
      return this.currentState.subscribe(next as Partial<AsyncObserver<any>>);
    }
  }

  select(selector: Promise<MemoizedFn> | AnyFn): Observable<any> {
    return new Observable(observer => {
      const unsubscribe = this.subscribe(async () => {
        const state = this.getState();
        // If the selector is a promise, await it to get the function
        const resolvedSelector = selector instanceof Promise ? await selector : selector;
        const result = resolvedSelector(state);
        observer.next(result);
      });
      return unsubscribe;
    });
  }

  extend(...args: [...SideEffect[], any | never]) {
    let dependencies = {};
    let effects: SideEffect[] = [];

    if (typeof args[args.length - 1] !== "function") {
      dependencies = args.pop();
    }

    effects = args;

    let newEffects = new Map(this.pipeline.effects);

    effects.forEach((effect) => {
      newEffects.set(effect, dependencies);
    });

    this.pipeline.effects = newEffects;
    return this;
  }

  revoke(...effects: SideEffect[]) {
    let newEffects = new Map(this.pipeline.effects);

    effects.forEach((effect) => {
      newEffects.delete(effect);
    });

    this.pipeline.effects = newEffects;
    return this;
  }

  loadModule(module: FeatureModule, injector: Injector) {
    // Check if the module already exists in the this's modules
    if (this.modules.some(m => m.slice === module.slice)) {
      // If the module already exists, return the this without changes
      return this;
    }
    // Create a new array with the module added to the this's modules
    const newModules = [...this.modules, module];

    // Return a new this with the updated properties
    this.modules = newModules;

    // Setup the reducers
    this.setupReducer();

    // Inject dependencies
    this.injectDependencies(injector);

    return this;
  }

  unloadModule(module: FeatureModule) {
    // Create a new array with the module removed from the this's modules
    const newModules = this.modules.filter(m => m.slice !== module.slice);

    // Return a new this with the updated properties
    this.modules = newModules;

    // Setup the reducers
    this.setupReducer();

    // Eject dependencies
    this.ejectDependencies(module);

    return this;
  }

  setupReducer(): Store {
    // Get the main module reducer
    const mainReducer = this.mainModule.reducer;

    // Get the feature module reducers
    const featureReducers = this.modules.reduce((reducers, module) => {
      reducers[module.slice] = module.reducer;
      return reducers;
    }, {} as Record<string, Reducer>);

    if(featureReducers.hasOwnProperty("main")) {
      throw new Error("Module name 'main' is reserved. Please provide other name for the module");
    }

    featureReducers["main"] = mainReducer;

    // Combine the main module reducer with the feature module reducers
    const combinedReducer = (state: any = {}, action: Action<any>) => {
      let newState = state;

      Object.keys(featureReducers).forEach((key) => {
        newState[key] = featureReducers[key](newState[key], action);
      });

      return newState;
    };

    this.pipeline.reducer = combinedReducer;
    return this;
  }

  injectDependencies(injector: Injector): Store {

    // Handle dependencies for MainModule
    let mainDependencies = this.mainModule.dependencies ? {...this.mainModule.dependencies} : {};
    if(!this.pipeline.dependencies["main"]) {
      this.pipeline.dependencies["main"] = {};
    }
    for (const key in mainDependencies) {
      const DependencyType = mainDependencies[key] as Type<any>;
      this.pipeline.dependencies["main"][key] = injector.get(DependencyType);
    }

    // Handle dependencies for each FeatureModule
    for (const module of this.modules) {
      let dependencies = module.dependencies ? {...module.dependencies} : {};
      if(!this.pipeline.dependencies[module.slice]) {
        this.pipeline.dependencies[module.slice] = {};
      }

      for (const key in module.dependencies) {
        if (!this.pipeline.dependencies[module.slice].hasOwnProperty(key)) {
          const DependencyType = module.dependencies[key] as Type<any>;
          this.pipeline.dependencies[module.slice][key] = injector.get(DependencyType);
        }
      }
    }
    return this;
  }

  ejectDependencies(module: FeatureModule): Store {
    for (const key in module.dependencies) {
      if(this.pipeline.dependencies[module.slice].hasOwnProperty(key)) {
        delete this.pipeline.dependencies[module.slice][key];
      }
    }
    return this;
  }

  processAction() {
    return (source: Observable<Action<any>>) => {
      const runSideEffects = this.pipeline.strategy === "concurrent" ? runSideEffectsInParallel : runSideEffectsSequentially;
      const mapMethod = this.pipeline.strategy === "concurrent" ? mergeMap : concatMap;
      return source.pipe(
        concatMap((action: Action<any>) => {
          let state = this.pipeline.reducer(this.currentState.value, action);
          return combineLatest([from(this.currentState.next(state)), runSideEffects(this.pipeline.effects.entries())([of(action), of(state)]).pipe(
            mapMethod((childActions: Action<any>[]) => {
              if (childActions.length > 0) {
                return from(childActions).pipe(
                  tap((nextAction: Action<any>) => {
                    this.actionStack.push(nextAction);
                    this.dispatch(nextAction);
                  }),
                );
              }
              return EMPTY;
            }),
            finalize(() => {
              if (this.actionStack.length > 0) {
                this.actionStack.pop();
              }
              if (this.actionStack.length === 0) {
                this.isProcessing.next(false);
              }
            }))
          ])
        }),
        ignoreElements()
      );
    };
  }

  applyMiddleware(): Store {

    let dispatch = (action: any) => {
      throw new Error("Dispatching while constructing your middleware is not allowed. Other middleware would not be applied to this dispatch.");
    }

    const internalAPI = {
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

    const middlewares = [starter, ...this.pipeline.middlewares];
    const chain = middlewares.map(middleware => middleware(middleware.internal ? internalAPI : middlewareAPI));
    dispatch = compose(...chain)(this.dispatch.bind(this));

    this.dispatch = dispatch;
    return this;
  }
}

export function compose(...funcs: AnyFn[]): AnyFn {
  if (funcs.length === 0) {
    return (arg: any): any => arg;
  }

  if (funcs.length === 1) {
    return funcs[0];
  }

  return funcs.reduce((a, b) => (...args: any[]) => a(b(...args)));
}

function deepClone<T>(objectToClone: T): T {
  if (isPrimitive(objectToClone)) return objectToClone;

  let obj: any;
  if (isBoxed(objectToClone)) {
    obj = (objectToClone as any).valueOf();
  } else if (objectToClone instanceof Date) {
    obj = new Date((objectToClone as Date).valueOf());
  } else if (objectToClone instanceof Map) {
    obj = new Map(Array.from(objectToClone as Map<any, any>, ([key, value]) => [deepClone(key), deepClone(value)]));
  } else if (objectToClone instanceof Set) {
    obj = new Set(Array.from(objectToClone as Set<any>, value => deepClone(value)));
  } else if (Array.isArray(objectToClone)) {
    obj = (objectToClone as any[]).map(value => deepClone(value));
  } else if (typeof objectToClone === 'object') {
    obj = Object.create(Object.getPrototypeOf(objectToClone));
    for (const key in objectToClone) {
      if (Object.prototype.hasOwnProperty.call(objectToClone, key)) {
        obj[key] = deepClone((objectToClone as any)[key]);
      }
    }
  } else {
    obj = objectToClone;
  }

  return obj;
}

export function shallowEqual(obj1: any, obj2: any) {
  return Object.keys(obj1).length === Object.keys(obj2).length &&
  Object.keys(obj1).every(key => obj1[key] === obj2[key]);
}
