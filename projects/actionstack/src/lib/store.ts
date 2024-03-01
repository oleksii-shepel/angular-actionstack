import { Injector, Type } from "@angular/core";
import { BehaviorSubject, EMPTY, Observable, Observer, Subject, Subscription, catchError, combineLatest, concatMap, filter, finalize, firstValueFrom, from, ignoreElements, map, mergeMap, of, scan, startWith, tap } from "rxjs";
import { createAction } from "./actions";
import { ActionStack } from "./collections";
import { runSideEffectsInParallel, runSideEffectsSequentially } from "./effects";
import { starter } from "./starter";
import { AsyncObserver, CustomAsyncSubject, toObservable } from "./subject";
import { Action, AnyFn, FeatureModule, MainModule, MemoizedFn, Reducer, SideEffect, StoreEnhancer, isPlainObject, kindOf } from "./types";

const randomString = () => Math.random().toString(36).substring(7).split('').join('.');

export const systemActions = {
  INITIALIZE_STATE: `INITIALIZE_STATE⛽${randomString()}`,
  STORE_INITIALIZED: `STORE_INITIALIZED⛽${randomString()}`,
  MODULE_LOADED: `MODULE_LOADED⛽${randomString()}`,
  MODULE_UNLOADED: `MODULE_UNLOADED⛽${randomString()}`,
  EFFECTS_REGISTERED: `EFFECTS_REGISTERED⛽${randomString()}`,
  EFFECTS_UNREGISTERED: `EFFECTS_UNREGISTERED⛽${randomString()}`
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

export class Store {
  protected mainModule: MainModule;
  protected modules: FeatureModule[];
  protected pipeline: {
    middlewares: any[];
    reducer: Reducer;
    effects: Map<SideEffect, any>;
    dependencies: Record<string, any>;
    strategy: "exclusive" | "concurrent";
  };
  protected actionStream: Subject<Action<any>>;
  protected actionStack: ActionStack;
  protected currentState: CustomAsyncSubject<any>;
  protected isProcessing: BehaviorSubject<boolean>;
  protected subscription: Subscription;

  protected constructor() {
    const MAIN_MODULE_DEFAULT = {
      slice: "main",
      middlewares: [],
      reducer: (state: any = {}, action: Action<any>) => state,
      dependencies: {},
      strategy: "exclusive" as "exclusive"
    };

    const MODULES_DEFAULT: FeatureModule[] = [];

    const PIPELINE_DEFAULT = {
      middlewares: [],
      reducer: (state: any = {}, action: Action<any>) => state,
      effects: new Map(),
      dependencies: {},
      strategy: "exclusive" as "exclusive"
    };

    const ACTION_STREAM_DEFAULT = new Subject<Action<any>>();
    const ACTION_STACK_DEFAULT = new ActionStack();

    const CURRENT_STATE_DEFAULT = new CustomAsyncSubject<any>({});

    const PROCESSING_DEFAULT = new BehaviorSubject(false);

    this.mainModule = MAIN_MODULE_DEFAULT;
    this.modules = MODULES_DEFAULT;
    this.pipeline = PIPELINE_DEFAULT;
    this.actionStream = ACTION_STREAM_DEFAULT;
    this.actionStack = ACTION_STACK_DEFAULT;
    this.currentState = CURRENT_STATE_DEFAULT;
    this.isProcessing = PROCESSING_DEFAULT;
    this.subscription = Subscription.EMPTY;
  }

  static createStore(mainModule: MainModule, enhancer?: StoreEnhancer) {

    let storeCreator = (mainModule: MainModule) => {

      let store = new Store();

      store.mainModule = Object.assign(store.mainModule, mainModule);
      store.pipeline = Object.assign(store.pipeline, {
        middlewares: Array.from(mainModule.middlewares ?? store.pipeline.middlewares),
        reducer: (state: any, action: any) => state,
        dependencies: Object.assign(Object.assign(store.pipeline.dependencies, mainModule.dependencies)),
        strategy: mainModule.strategy ?? store.pipeline.strategy,
      });

      store.applyMiddleware();

      let action$ = store.actionStream.asObservable();

      store.subscription = action$.pipe(
        startWith(systemActionCreators.initializeState()),
        scan((acc, action: any) => ({count: acc.count + 1, action}), {count: 0, action: undefined}),
        concatMap(({count, action}: any) => (count === 1)
          ? from(store.setupReducer()).pipe(
              catchError(error => { console.warn(error); return EMPTY; }),
              map(() => action),
              tap(() => store.dispatch(systemActionCreators.storeInitialized()))
            )
          : of(action)),
        store.processAction()
      ).subscribe();

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

  getState(): any | Promise<any> {
    return this.currentState.value;
  }

  subscribe(next?: AnyFn | Observer<any>, error?: AnyFn, complete?: AnyFn): Subscription {
    const stateObservable = toObservable(this.currentState).pipe(filter(value => value !== undefined));
    if (typeof next === 'function') {
      return stateObservable.subscribe({next, error, complete});
    } else {
      return stateObservable.subscribe(next as Partial<AsyncObserver<any>>);
    }
  }

  select(selector: Promise<MemoizedFn> | AnyFn): Observable<any> {
    return new Observable(observer => {
      const unsubscribe = this.subscribe(async () => {
        const resolvedSelector = selector instanceof Promise ? await selector : selector;
        const result = resolvedSelector(this);
        if(result !== undefined) {
          observer.next(result);
        }
      });
      return unsubscribe;
    });
  }

  extend(...args: [...SideEffect[], any | never]) {
    firstValueFrom(this.isProcessing.pipe(filter(value => value === false), tap(() => {
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
    })));

    this.dispatch(systemActionCreators.effectsRegistered(args));
    return this;
  }

  revoke(...effects: SideEffect[]) {

    firstValueFrom(this.isProcessing.pipe(filter(value => value === false), tap(() => {
      let newEffects = new Map(this.pipeline.effects);

      effects.forEach((effect) => {
        newEffects.delete(effect);
      });

      this.pipeline.effects = newEffects;
    })));

    this.dispatch(systemActionCreators.effectsUnregistered(effects));
    return this;
  }

  loadModule(module: FeatureModule, injector: Injector) {
    firstValueFrom(this.isProcessing.pipe(filter(value => value === false),
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
      concatMap(() => from(this.setupReducer()).pipe(catchError(error => { console.warn(error); return EMPTY; }))),
      tap(() => this.dispatch(systemActionCreators.moduleLoaded(module)))
    ));

    return this;
  }

  unloadModule(module: FeatureModule) {
    firstValueFrom(this.isProcessing.pipe(filter(value => value === false),
      tap(() => {
        // Create a new array with the module removed from the this's modules
        const newModules = this.modules.filter(m => m.slice !== module.slice);

        // Return a new this with the updated properties
        this.modules = newModules;

        // Eject dependencies
        this.ejectDependencies(module);
      }),
      concatMap(() => from(this.setupReducer()).pipe(catchError(error => { console.warn(error); return EMPTY; }))),
      tap(() => this.dispatch(systemActionCreators.moduleUnloaded(module)))
    ));

    return this;
  }

  protected async setupReducer(): Promise<void> {
    let errors = new Map<string, string>();

    // Get the main module reducer
    const mainReducer = this.mainModule.reducer;

    // Get the feature module reducers
    let featureReducers = this.modules.reduce((reducers, module) => {
      reducers[module.slice] = module.reducer;
      return reducers;
    }, {} as Record<string, Reducer>);

    featureReducers[this.mainModule.slice!] = mainReducer;

    // Initialize state
    let stateUpdated = false, state = await this.getState();
    Object.keys(featureReducers).forEach((key) => {
      try {
        if(state[key] === undefined) {
          state[key] = featureReducers[key](undefined, systemActionCreators.initializeState());
          stateUpdated = true;
        }
      } catch (error: any) {
        errors.set(key, `Initializing state failed for ${key}: ${error.message}`);
      }
    });

    if(stateUpdated) {
      state = { ...state };
      this.currentState.next(state);
    }

    Object.keys(featureReducers).filter((key) => errors.has(key)).forEach(key => {
      delete featureReducers[key];
    });

    // Combine the main module reducer with the feature module reducers
    const combinedReducer = (state: any = {}, action: Action<any>) => {
      let newState = state, stateUpdated = false;

      Object.keys(featureReducers).filter(reducer => !errors.has(reducer)).forEach((key) => {
        try {
            const featureState = featureReducers[key](newState[key], action);
            if(featureState !== newState[key]){
              stateUpdated = true;
              newState[key] = featureState;
            }
        } catch (error) {
          throw new Error(`Error occurred while processing action ${action.type} for ${key}: ${error}`);
        }
      });

      if(stateUpdated) {
        newState = { ...newState };
      }

      return newState;
    };

    this.pipeline.reducer = combinedReducer;

    if(errors.size) {
      let receivedErrors = Array.from(errors.entries()).map((value) => value[1]).join('\n');
      throw new Error(`${errors.size} errors during state initialization.\n${receivedErrors}`);
    }
  }

  protected injectDependencies(injector: Injector): Store {

    // Handle dependencies for MainModule
    let mainDependencies = this.mainModule.dependencies ? {...this.mainModule.dependencies} : {};
    if(!this.pipeline.dependencies[this.mainModule.slice!]) {
      this.pipeline.dependencies[this.mainModule.slice!] = {};
    }
    for (const key in mainDependencies) {
      const DependencyType = mainDependencies[key] as Type<any>;
      this.pipeline.dependencies[this.mainModule.slice!][key] = injector.get(DependencyType);
    }

    // Handle dependencies for each FeatureModule
    for (const module of this.modules) {
      let dependencies = module.dependencies ? {...module.dependencies} : {};
      if(!this.pipeline.dependencies[module.slice]) {
        this.pipeline.dependencies[module.slice] = {};
      }

      for (const key in dependencies) {
        if (!this.pipeline.dependencies[module.slice].hasOwnProperty(key)) {
          const DependencyType = dependencies[key] as Type<any>;
          this.pipeline.dependencies[module.slice][key] = injector.get(DependencyType);
        }
      }
    }
    return this;
  }

  protected ejectDependencies(module: FeatureModule): Store {
    for (const key in module.dependencies) {
      if(this.pipeline.dependencies[module.slice].hasOwnProperty(key)) {
        delete this.pipeline.dependencies[module.slice][key];
      }
    }
    return this;
  }

  protected processAction() {
    return (source: Observable<Action<any>>) => {
      const runSideEffects = this.pipeline.strategy === "concurrent" ? runSideEffectsInParallel : runSideEffectsSequentially;
      const mapMethod = this.pipeline.strategy === "concurrent" ? mergeMap : concatMap;

      return source.pipe(
        concatMap((action: Action<any>) => {
          let state = this.pipeline.reducer(this.currentState.value, action);
          return combineLatest([
            from(this.currentState.next(state)),
            runSideEffects(this.pipeline.effects.entries())([of(action), of(state)]).pipe(
              mapMethod((childActions: Action<any>[]) => {
                if (childActions.length > 0) {
                  return from(childActions).pipe(
                    tap((nextAction: Action<any>) => {
                      this.actionStack.push(nextAction);
                      this.dispatch(nextAction);
                    })
                  );
                }
                return EMPTY;
              }),
              finalize(() => {
                // Pop the action from the stack after it is processed
                this.actionStack.pop();
                if (this.actionStack.length === 0) {
                  // Set isProcessing to false if there are no more actions in the stack
                  this.isProcessing.next(false);
                }
              })
            )
          ]);
        }),
        ignoreElements(),
        catchError((error) => {
          console.warn(error);
          return EMPTY;
        })
      );
    };
  }

  protected applyMiddleware(): Store {

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
