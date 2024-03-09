import { Injector, Type } from "@angular/core";
import { BehaviorSubject, EMPTY, Observable, Observer, Subject, Subscription, catchError, combineLatest, concatMap, defaultIfEmpty, distinctUntilChanged, filter, finalize, firstValueFrom, from, ignoreElements, map, mergeMap, of, scan, tap, withLatestFrom } from "rxjs";
import { bindActionCreators, systemActionCreators } from "./actions";
import { ActionStack } from "./collections";
import { runSideEffectsInParallel, runSideEffectsSequentially } from "./effects";
import { isValidMiddleware } from "./hash";
import { starter } from "./starter";
import { AsyncObserver, CustomAsyncSubject } from "./subject";
import { Action, AnyFn, FeatureModule, MainModule, Reducer, SideEffect, StoreEnhancer, isPlainObject, kindOf } from "./types";

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
  protected currentAction: CustomAsyncSubject<any>;
  protected currentState: CustomAsyncSubject<any>;
  protected isProcessing: BehaviorSubject<boolean>;
  protected subscription: Subscription;
  protected systemActions: Record<keyof typeof systemActionCreators, any>;

  protected constructor() {
    const MAIN_MODULE_DEFAULT = {
      slice: "main",
      middlewares: [],
      reducer: (state: any = {}, action: Action<any>) => state,
      dependencies: {},
      strategy: "exclusive" as "exclusive",
      shouldDispatchSystemActions: true
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

    const CURRENT_ACTION_DEFAULT = new CustomAsyncSubject<any>();
    const CURRENT_STATE_DEFAULT = new CustomAsyncSubject<any>();

    const PROCESSING_DEFAULT = new BehaviorSubject(false);
    const SUBSCRIPTION_DEFAULT = Subscription.EMPTY;
    const SYSTEM_ACTIONS_DEFAULT = { ...systemActionCreators };

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
        scan((acc, action: any) => ({count: acc.count + 1, action}), {count: 0, action: undefined}),
        concatMap(({count, action}: any) => {
          return (count === 1)
          ? from(store.setupReducer()).pipe(
              catchError(error => { console.warn(error.message); return EMPTY; }),
              map(() => action),
            )
          : of(action)
        }),
        store.processAction()
      ).subscribe();

      store.systemActions = bindActionCreators(systemActionCreators, (action: Action<any>) => store.mainModule.shouldDispatchSystemActions && store.dispatch(action));

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
    if (slice === undefined || typeof slice === "string" && slice == "@global") {
      return this.currentState.value as T;
    } else if (typeof slice === "string") {
      return this.currentState.value[slice] as T;
    } else if (Array.isArray(slice)) {
      return slice.reduce((acc, key) => (acc && Array.isArray(acc) ? acc[parseInt(key)] : acc[key]) || undefined, this.currentState.value) as T;
    } else {
      throw new Error("Unsupported type of slice parameter");
    }
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

  select(selector: Promise<AnyFn> | AnyFn, defaultValue?: any): Observable<any> {
    return this.currentState.asObservable().pipe(
      concatMap(() => (selector instanceof Promise ? from(selector) : of(selector)).pipe(
      concatMap(async (selector) => await selector(this)),
      filter(value => value !== undefined),
      distinctUntilChanged(),
      defaultValue !== undefined ? defaultIfEmpty(defaultValue) : (value => value)
    )));
  }

  extend(...args: [...SideEffect[], any | never]) {
    const dependencies = typeof sideEffects[sideEffects.length - 1]  === "function" ? {} : sideEffects.pop();
    const runSideEffects = this.pipeline.strategy === "concurrent" ? runSideEffectsInParallel : runSideEffectsSequentially;
    const effectsSubscription = return this.currentAction.asObservable().pipe(
      withLatestFrom(of(this.currentState.value)),
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
      ))
    ).subscribe();

    this.systemActions.effectsRegistered(args);
    return effectsSubscription;
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
      concatMap(() => from(this.setupReducer()).pipe(catchError(error => { console.warn(error.message); return EMPTY; }))),
      tap(() => this.systemActions.moduleLoaded(module))
    ));

    return this;
  }

  unloadModule(module: FeatureModule, clearState: boolean = false) {
    firstValueFrom(this.isProcessing.pipe(filter(value => value === false),
      tap(() => {
        // Create a new array with the module removed from the this's modules
        const newModules = this.modules.filter(m => m.slice !== module.slice);

        // Return a new this with the updated properties
        this.modules = newModules;

        // Eject dependencies
        this.ejectDependencies(module);
      }),
      concatMap(() => {
        let stateOrPromise = this.getState();
        return stateOrPromise instanceof Promise ? from(stateOrPromise) : of(stateOrPromise);
      }),
      tap((state) => {
        if (clearState) {
          let newState = {...state};
          delete newState[module.slice];
          this.currentState.next(newState);
        }
      }),
      concatMap(() => from(this.setupReducer()).pipe(catchError(error => { console.warn(error.message); return EMPTY; }))),
      tap(() => this.systemActions.moduleUnloaded(module))
    ));

    return this;
  }

  combineReducers(reducers: Record<string, Reducer>): [Reducer, any] {
    let errors = new Map<string, string>();
    let featureReducers = {...reducers};
    let featureState = {} as any;
    try {
      // Initialize state
      Object.keys(featureReducers).forEach((key) => {
        try {
          if(featureState[key] === undefined) {
            featureState[key] = featureReducers[key](undefined, systemActionCreators.initializeState());
          }
        } catch (error: any) {
          errors.set(key, `Initializing state failed for ${key}: ${error.message}`);
        }
      });

      Object.keys(featureReducers).filter((key) => errors.has(key)).forEach(key => {
        delete featureReducers[key];
      });

      // Combine the main module reducer with the feature module reducers
      const combinedReducer = (state: any = featureState, action: Action<any>) => {
        let newState = state;

        Object.keys(featureReducers).filter(reducer => !errors.has(reducer)).forEach((key) => {
          try {
              const featureState = featureReducers[key](newState[key], action);
              if(featureState !== newState[key]){
                newState = {...newState, key: featureState};
              }
          } catch (error) {
            throw new Error(`Error occurred while processing action ${action.type} for ${key}: ${error}`);
          }
        });

        return newState;
      };

      return [combinedReducer, featureState];
    } finally {
      if(errors.size) {
        let receivedErrors = Array.from(errors.entries()).map((value) => value[1]).join('\n');
        throw new Error(`${errors.size} errors during state initialization.\n${receivedErrors}`);
      }
    }
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

  protected async setupReducer(): Promise<void> {
    let errors = new Map<string, string>();
    let initialState = {} as any;

    // Get the feature module reducers and initialize state
    let featureReducers = [{slice: this.mainModule.slice!, reducer: this.mainModule.reducer}, ...this.modules].reduce((reducers, module) => {
      try {
        if(typeof module.reducer === "function") {
          let [moduleReducer, moduleState]: any = [module.reducer, module.reducer(undefined, systemActionCreators.initializeState())];
          reducers[module.slice] = moduleReducer;
          initialState[module.slice] = moduleState;
        } else {
          let [moduleReducer, moduleState] = this.combineReducers(module.reducer);
          reducers[module.slice] = moduleReducer;
          initialState[module.slice] = moduleState;
        }
      }
      catch (error: any) {
        errors.set(module.slice, `Initializing state failed for ${module.slice}: ${error.message}`);
        initialState[module.slice] = {};
      }
      return reducers;
    }, {} as Record<string, Reducer>);

    // Remove the reducer from the featureReducers object if its execution has failed
    Object.keys(featureReducers).filter((key) => errors.has(key)).forEach(key => {
      delete featureReducers[key];
    });

    // Update store state
    const state = this.hydrateState(await this.getState(), initialState);
    this.currentState.next(state);

    // Combine multiple feature reducers into one
    const combinedReducer = (state: any = {}, action: Action<any>) => {
      let newState = state;

      Object.keys(featureReducers).filter(reducer => !errors.has(reducer)).forEach((key) => {
        try {
            const featureState = featureReducers[key](newState[key], action);
            if (featureState !== newState[key]) {
              newState = {...newState, key: featureState};
            }
        } catch (error) {
          throw new Error(`Error occurred while processing the action ${action.type} for ${key}: ${error}`);
        }
      });

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
          const state = this.pipeline.reducer(this.currentState.value, action);
          const stateUpdated = this.currentState.next(state);
          const actionHandled = this.currentAction.next(action);
          return combineLatest([
            from(stateUpdated), from(actionHandled)
          ]).pipe(finalize(() => {
            this.actionStack.pop();
            if (this.actionStack.length === 0) {
              // Set isProcessing to false if there are no more actions in the stack
              this.isProcessing.next(false);
            }
          }));
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

    const chain = middlewares.map(middleware => middleware(isValidMiddleware(middleware.signature) ? internalAPI : middlewareAPI));
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
