import { InjectionToken, Injector, Type, inject } from "@angular/core";
import { action, bindActionCreators } from "./actions";
import { isValidSignature } from "./hash";
import { Lock } from "./lock";
import { CustomBehaviorSubject, CustomObservable, CustomSubject, CustomSubscription, IObservable, Unsubscribable } from "./observable";
import { concat, concatMap, merge, waitFor } from "./operators";
import { starter } from "./starter";
import { CustomAsyncSubject } from "./subject";
import { Tracker } from "./tracker";
import { Action, AnyFn, AsyncReducer, FeatureModule, MainModule, MetaReducer, ProcessingStrategy, Reducer, SideEffect, StoreEnhancer, Tree, isAction, isPlainObject, kindOf } from "./types";

export { createStore as store };

/**
 * Class representing configuration options for a store.
 *
 * This class defines properties that control various behaviors of a store for managing application state.
 */
export class StoreSettings {
  dispatchSystemActions = true;
  awaitStatePropagation = true;
  enableMetaReducers = true;
  enableAsyncReducers = true;
};

/**
 * Constant array containing system action types as strings.
 *
 * These action types are likely used internally for system events.
 */
const SYSTEM_ACTION_TYPES = [
  "INITIALIZE_STATE",
  "UPDATE_STATE",
  "STORE_INITIALIZED",
  "MODULE_LOADED",
  "MODULE_UNLOADED",
  "EFFECTS_REGISTERED",
  "EFFECTS_UNREGISTERED"
] as const;

/**
 * Type alias representing all possible system action types.
 *
 * This type is derived from the `SYSTEM_ACTION_TYPES` array using the `typeof` operator and ensures the type is also a string.
 */
export type SystemActionTypes = typeof SYSTEM_ACTION_TYPES[number] & string;

/**
 * Function to check if a given string is a system action type.
 *
 * @param type - The string to check.
 * @returns boolean - True if the type is a system action type, false otherwise.
 */
export function isSystemActionType(type: string): type is SystemActionTypes {
  return SYSTEM_ACTION_TYPES.includes(type as SystemActionTypes);
}

/**
 * Private function to create a system action.
 *
 * @param type - The system action type (string).
 * @param payload - Optional function or value to be attached as the payload.
 * @returns object - The created system action object.
 */
function systemAction<T extends SystemActionTypes>(type: T, payload?: Function) {
  return action(type, payload);
}

/**
 * Object containing action creator functions for all system action types.
 *
 * Each property name corresponds to a system action type, and the function creates an action object with that type and optional payload.
 */
const systemActions = {
  initializeState: systemAction("INITIALIZE_STATE"),
  updateState: systemAction("UPDATE_STATE"),
  storeInitialized: systemAction("STORE_INITIALIZED"),
  moduleLoaded: systemAction("MODULE_LOADED", (module: FeatureModule) => ({module})),
  moduleUnloaded: systemAction("MODULE_UNLOADED", (module: FeatureModule) => ({module})),
  effectsRegistered: systemAction("EFFECTS_REGISTERED", (effects: SideEffect[]) => ({effects})),
  effectsUnregistered: systemAction("EFFECTS_UNREGISTERED", (effects: SideEffect[]) => ({effects}))
};

/**
 * Class representing a state management store.
 *
 * This class provides functionalities for managing application state, including:
 *  * Storing the current state.
 *  * Dispatching actions to update the state.
 *  * Getting the current state.
 *  * Subscribing to changes in the state.
 */
export class Store {
  protected mainModule: MainModule = {
    slice: "main",
    middleware: [],
    reducer: (state: any = {}, action: Action<any>) => state as Reducer,
    metaReducers: [],
    dependencies: {},
    strategy: "exclusive" as ProcessingStrategy
  };
  protected modules: FeatureModule[] = [];
  protected pipeline = {
    middleware: [] as any[],
    reducer: ((state: any = {}, action: Action<any>) => state) as AsyncReducer,
    dependencies: {} as Tree<Type<any> | InjectionToken<any>>,
    strategy: "exclusive" as ProcessingStrategy
  };
  protected actionStream = new CustomSubject<Action<any>>();
  protected currentAction = new CustomAsyncSubject<Action<any>>();
  protected currentState = new CustomAsyncSubject<any>();
  protected isProcessing = new CustomBehaviorSubject<boolean>(false);
  protected subscription = CustomSubscription.EMPTY as Unsubscribable;
  protected systemActions = { ...systemActions };
  protected settings = { ...new StoreSettings(), ...inject(StoreSettings) };
  protected tracker = new Tracker();
  protected lock = new Lock();

  /**
   * Creates a new store instance with the provided mainModule and optional enhancer.
   * @param {MainModule} mainModule - The main module containing middleware, reducer, dependencies, and strategy.
   * @param {StoreEnhancer} [enhancer] - Optional store enhancer function.
   * @returns {Store} The created store instance.
   * @throws {Error} Throws an error if the enhancer is not a function.
   */
  static create(mainModule: MainModule, enhancer?: StoreEnhancer) {

    /**
     * Function to create a store instance.
     * @param {MainModule} mainModule - The main module containing middleware, reducer, dependencies, and strategy.
     * @returns {Store} The created store instance.
     */
    let storeCreator = (mainModule: MainModule) => {

      let store = new Store();

      // Assign mainModule properties to store
      mainModule = {...store.mainModule, ...mainModule};
      store.mainModule = mainModule;

      // Configure store pipeline
      store.pipeline = {...store.pipeline, ...{
        middleware: Array.from(mainModule.middleware ?? []),
        reducer: store.combineReducers({[mainModule.slice!]: mainModule.reducer}),
        dependencies: {...mainModule.dependencies},
        strategy: mainModule.strategy!,
      }};

      // Apply middleware
      store.applyMiddleware();

      // Bind system actions
      store.systemActions = bindActionCreators(systemActions, (action: Action<any>) => store.settings.dispatchSystemActions && store.dispatch(action));

      // Create action stream observable
      // Subscribe to action stream and process actions
      let count = 0;

      store.subscription = store.actionStream.pipe(
        concatMap(async (action: any) => {
          if (count === 0) {
            console.log("%cYou are using ActionStack. Happy coding! 🎉", "font-weight: bold;");
            await store.currentState.next(await store.setupReducer());
            store.systemActions.storeInitialized();
          }
          count++;
          return action;
        }),
        store.processAction()
      ).subscribe(() => {});

      // Initialize state and mark store as initialized
      store.systemActions.initializeState();

      return store;
    }

    // Apply enhancer if provided
    if (typeof enhancer !== "undefined") {
      if (typeof enhancer !== "function") {
        throw new Error(`Expected the enhancer to be a function. Instead, received: '${kindOf(enhancer)}'`);
      }
      // Apply the enhancer to the storeCreator function
      return enhancer(storeCreator)(mainModule);
    }

    // If no enhancer provided, return the result of calling storeCreator
    return storeCreator(mainModule);
  }

  /**
   * Dispatches an action to be processed by the store's reducer.
   * @param {Action<any>} action - The action to dispatch.
   * @throws {Error} Throws an error if the action is not a plain object, does not have a defined "type" property, or if the "type" property is not a string.
   */
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

  /**
   * Waits for the store to become idle.
   * @returns {Promise<boolean>} A promise that resolves to true when the store is idle (not processing any actions), or false if the store completes without becoming idle.
   */
  waitForIdle(): Promise<boolean> {
    return waitFor(this.isProcessing.asObservable(), value => value === false);
  }

  /**
   * Selects a value from the store's state using the provided selector function.
   * @param {(obs: Observable<any>) => Observable<any>} selector - The selector function to apply on the state observable.
   * @param {*} [defaultValue] - The default value to use if the selected value is undefined.
   * @returns {Observable<any>} An observable stream with the selected value.
   */
  select(selector: (obs: IObservable<any>) => IObservable<any>, defaultValue?: any): IObservable<any> {
    let lastValue: any;
    return new CustomObservable<any>(subscriber => {
      const subscription = this.currentState.asObservable().pipe((state) => (selector(state) as CustomObservable<any>)).subscribe(selectedValue => {
        const filteredValue = selectedValue === undefined ? defaultValue : selectedValue;
        if(filteredValue !== lastValue) {
          lastValue = filteredValue;
          subscriber.next(filteredValue);
        }
      });

      return () => subscription.unsubscribe();
    });
  }

  /**
   * Gets the current state or a slice of the state from the store.
   * @param {keyof T | string[]} [slice] - The slice of the state to retrieve.
   * @returns {T | any} The current state or the selected slice of the state.
   * @throws {Error} Throws an error if the slice parameter is of unsupported type.
   * @template T
   */
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

  /**
   * Applies a change to the initial state based on the provided path and value, updating the state and tracking changes.
   * @param {any} initialState - The initial state object.
   * @param {Object} change - The change object containing the path and value to update.
   * @param {string[]} change.path - The path to the value to be updated.
   * @param {any} change.value - The new value to set at the specified path.
   * @param {Tree<boolean>} edges - The tree structure representing the tracked changes.
   * @returns {any} The updated state object after applying the change.
   * @protected
   */
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

  /**
   * Updates the state based on the provided slice and value, returning the updated state.
   * @param {keyof T | string[] | undefined} slice - The slice of the state to update.
   * @param {any} value - The new value to set for the specified slice.
   * @param {Action<any>} [action=systemActions.updateState()] - The action to propagate after updating the state.
   * @returns {Promise<any>}  A promise that resolves to the updated state object.
   * @protected
   * @template T
   */
  protected async setState<T = any>(slice: keyof T | string[] | undefined, value: any, action: Action<any> = systemActions.updateState()): Promise<any> {
    let newState: any;
    if (slice === undefined || typeof slice === "string" && slice == "@global") {
      // Update the whole state with a shallow copy of the value
      newState = ({...value});
    } else if (typeof slice === "string") {
      // Update the state property with the given key with a shallow copy of the value
      newState = {...this.currentState.value, [slice]: { ...value }};
    } else if (Array.isArray(slice)) {
      // Apply change to the state based on the provided path and value
      newState = this.applyChange(this.currentState.value, {path: slice, value}, {});
    } else {
      // Unsupported type of slice parameter
      throw new Error("Unsupported type of slice parameter");
    }

    this.tracker.reset();

    let stateUpdated = this.currentState.next(newState);
    let actionHandled = this.currentAction.next(action);
    let effectsExecuted = this.tracker.allExecuted;

    if (this.settings.awaitStatePropagation) {
      await Promise.allSettled([stateUpdated, actionHandled, effectsExecuted]);
    }

    return newState;
  }

  /**
   * Updates the state asynchronously based on the provided slice and callback function, then propagates the action.
   * @param {keyof T | string[]} slice - The slice of the state to update.
   * @param {AnyFn} callback - The callback function to apply on the current state.
   * @param {Action<any>} [action=systemActions.updateState()] - The action to propagate after updating the state.
   * @returns {Promise<any>} A promise that resolves to the propagated action.
   * @protected
   * @template T
   */
  protected async updateState<T = any>(slice: keyof T | string[] | undefined, callback: AnyFn, action: Action<any> = systemActions.updateState()): Promise<any> {
    if(callback === undefined) {
      throw new Error('Callback function is missing. State will not be updated.')
    }

    let state = await this.getState(slice);
    let result = await callback(state);
    await this.setState(slice, result, action);

    return action;
  }

  /**
   * Combines multiple reducers into a single asynchronous reducer function.
   * @param {Tree<Reducer>} reducers - The tree structure containing reducers.
   * @returns {AsyncReducer} An asynchronous reducer function.
   * @protected
   */
  protected combineReducers(reducers: Tree<Reducer>): AsyncReducer {
    // Create a map for reducers
    const reducerMap = new Map<Reducer, string[]>();

    /**
     * Recursively builds a map of reducers with their corresponding paths.
     * @param {Tree<Reducer>} tree - The tree structure containing reducers.
     * @param {string[]} [path=[]] - The current path in the tree.
     */
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

    /**
     * Combined reducer function that applies each individual reducer to the state.
     * @param {any} [state={}] - The current state.
     * @param {Action<any>} action - The action to process.
     * @returns {Promise<any>} A promise that resolves to the modified state.
     */
    const combinedReducer = async (state: any = {}, action: Action<any>) => {
      // Apply every reducer to state and track changes
      let modified = {};
      for (const [reducer, path] of reducerMap) {
        try {
          const currentState = await this.getState(path);
          const updatedState = await reducer(currentState, action);
          if(currentState !== updatedState) { state = await this.applyChange(state, {path, value: updatedState}, modified); }
        } catch (error: any) {
          console.warn(`Error occurred while processing an action ${action.type} for ${path.join('.')}: ${error.message}`);
        }
      }
      return state;
    };
    return combinedReducer;
  }

    /**
   * Sets up the reducer function by combining feature reducers and applying meta reducers.
   * @param {any} [state={}] - The initial state.
   * @returns {Promise<any>} A promise that resolves to the updated state after setting up the reducer.
   * @protected
   */
  protected async setupReducer(state: any = {}): Promise<any> {

    let featureReducers = [{slice: this.mainModule.slice!, reducer: this.mainModule.reducer}, ...this.modules].reduce((reducers, module) => {
      let moduleReducer: any = module.reducer instanceof Function ? module.reducer : {...module.reducer};
      reducers = {...reducers, [module.slice]: moduleReducer};
      return reducers;
    }, {} as Tree<Reducer>);

    let reducer = this.combineReducers(featureReducers);

    // Define async compose function to apply meta reducers
    const asyncCompose = (...fns: MetaReducer[]) => async (reducer: AsyncReducer) => {
      for (let i = fns.length - 1; i >= 0; i--) {
        reducer = await fns[i](reducer);
      }
      return reducer;
    };

    // Apply meta reducers if enabled
    this.settings.enableMetaReducers && this.mainModule.metaReducers
      && this.mainModule.metaReducers.length
      && (reducer = await asyncCompose(...this.mainModule.metaReducers)(reducer));
    this.pipeline.reducer = reducer;

    // Update store state
    return await reducer(state, systemActions.updateState());
  }

  /**
   * Injects dependencies into the store using the provided injector.
   * @param {Injector} injector - The injector to use for dependency injection.
   * @returns {Store} The store instance with injected dependencies.
   * @protected
   */
  protected injectDependencies(injector: Injector): Store {
    // Initialize the new dependencies object
    let newDependencies = {} as any;

    // Combine all dependencies into one object
    let allDependencies = [this.mainModule.dependencies, ...this.modules.map(module => module.dependencies)].filter(Boolean);

    // Recursively clone and update dependencies
    allDependencies.forEach((dep: any) => {
      Object.keys(dep).forEach(key => {
        newDependencies[key] = dep[key];
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

    /**
   * Ejects dependencies associated with the specified module from the store.
   * @param {FeatureModule} module - The module whose dependencies should be ejected.
   * @returns {Store} The store instance with ejected dependencies.
   * @protected
   */
  protected ejectDependencies(module: FeatureModule): Store {
    // Combine all dependencies into one object, excluding the module to eject
    let allDependencies = [this.mainModule.dependencies, ...this.modules.filter(m => m !== module).map(m => m.dependencies)].filter(Boolean);

    // Initialize the new dependencies object
    let newDependencies = {} as any;

    // Recursively clone and update dependencies
    allDependencies.forEach((dep: any) => {
      Object.keys(dep).forEach(key => {
        newDependencies[key] = dep[key];
      });
    });

    // Create a stack for the DFS traversal
    let stack = [{ source: this.pipeline.dependencies as any, target: newDependencies }];

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

  /**
   * Creates an RxJS operator that processes incoming actions.
   * @param {Observable<Action<any>>} source - The observable stream of actions.
   * @returns {Observable<any>} An observable stream that processes actions.
   * @protected
   */
  processAction() {
    return (source: IObservable<Action<any>>) =>
      new CustomObservable<Action<any>>(subscriber => {

        const subscription = source.pipe(
          concatMap(async (action: Action<any>) => {
            try {
              return await this.updateState("@global", async (state) => await this.pipeline.reducer(state, action), action);
            } finally {
              this.isProcessing.next(false);
            }
          })
        ).subscribe({
          error: (error) => {
            console.warn(error.message);
            subscriber.complete(); // Complete the observable on error
          },
          complete: () => {
            subscriber.complete(); // Complete the observable when the source completes
          }
        });

        return () => subscription.unsubscribe();
      });
  }

  /**
   * Applies middleware to the store's dispatch method.
   * @returns {Store} The store instance with applied middleware.
   * @protected
   */
  protected applyMiddleware(): Store {

    let dispatch = (action: any) => {
      throw new Error("Dispatching while constructing your middleware is not allowed. Other middleware would not be applied to this dispatch.");
    };

    // Define starter and middleware APIs
    const starterAPI = {
      getState: () => this.getState(),
      dispatch: async (action: any) => await dispatch(action),
      isProcessing: this.isProcessing,
      dependencies: () => this.pipeline.dependencies,
      strategy: () => this.pipeline.strategy,
      lock: this.lock
    };

    const middlewareAPI = {
      getState: () => this.getState(),
      dispatch: async (action: any) => await dispatch(action),
    };

    // Build middleware chain
    const chain = [starter(isValidSignature(starter.signature) ? starterAPI : middlewareAPI), ...this.pipeline.middleware.map(middleware => middleware(middlewareAPI))];
    // Compose middleware chain with dispatch function
    dispatch = (chain.length === 1 ? chain[0] : chain.reduce((a, b) => (...args: any[]) => a(b(...args))))(this.dispatch.bind(this));

    this.dispatch = dispatch;
    return this;
  }

  /**
   * Extends the observable stream with the provided side effects.
   * @param {...SideEffect[]} args - The side effect functions to extend the stream.
   * @returns {Observable<any>} An observable stream extended with the specified side effects.
   * @protected
   */
  extend(...args: SideEffect[]): IObservable<any> {
    const dependencies = this.pipeline.dependencies;

    const effects$ = new CustomObservable<any>(subscriber => {
      let effectsSubscription: Unsubscribable | undefined;
      const unregisterEffects = () => {
        if (effectsSubscription) {
          effectsSubscription.unsubscribe();
          effectsSubscription = undefined;
        }
        this.systemActions.effectsUnregistered(args);
      };

      this.waitForIdle().then(() => {
        this.tracker.track(effects$);

        const sideEffects = args.map(sideEffect => sideEffect(this.currentAction.asObservable(), this.currentState.asObservable(), dependencies));
        let effectsExecutedCount = 0;
        effectsSubscription = (this.pipeline.strategy === "concurrent" ? merge : concat)(...sideEffects).subscribe({
          next: (childAction: any) => {
            if (isAction(childAction)) {
              this.dispatch(childAction);
            }
            effectsExecutedCount++;
            if(effectsExecutedCount === args.length) {
              this.tracker.setStatus(effects$, true);
            }
          },
          error: (err: any) => subscriber.error(err),
          complete: () => { subscriber.complete() },
        });

        return () => unregisterEffects();
      }).catch(err => subscriber.error(err));

      return () => {
        unregisterEffects();
        this.tracker.remove(effects$);
      }
    });

    this.systemActions.effectsRegistered(args);
    return effects$;
  }

  /**
   * Loads a feature module into the store.
   * @param {FeatureModule} module - The feature module to load.
   * @param {Injector} injector - The injector to use for dependency injection.
   * @returns {Promise<void>}
   */
  loadModule(module: FeatureModule, injector: Injector): Promise<void> {

    // Check if the module already exists
    if (this.modules.some(m => m.slice === module.slice)) {
      return Promise.resolve(); // Module already exists, return without changes
    }

    const promise = this.lock.acquire()
      .then(() => this.waitForIdle())
      .then(() => {
        // Create a new array with the module added
        this.modules = [...this.modules, module];

        // Inject dependencies
        return this.injectDependencies(injector);
      })
      .then(() => this.updateState("@global", state => this.setupReducer(state)))
      .finally(() => {
        // Release the lock
        this.lock.release();
      });

    // Dispatch module loaded action
    this.systemActions.moduleLoaded(module);
    return promise;
  }

  /**
   * Unloads a feature module from the store.
   * @param {FeatureModule} module - The feature module to unload.
   * @param {boolean} [clearState=false] - A flag indicating whether to clear the module's state.
   * @returns {Promise<void>}
   */
  unloadModule(module: FeatureModule, clearState: boolean = false): Promise<void> {
    // Find the module index in the modules array
    const moduleIndex = this.modules.findIndex(m => m.slice === module.slice);

    // Check if the module exists
    if (moduleIndex === -1) {
      console.warn(`Module ${module.slice} not found, cannot unload.`);
      return Promise.resolve(); // Module not found, nothing to unload
    }

    const promise = this.lock.acquire()
      .then(() => this.waitForIdle())
      .then(() => {
        // Remove the module from the internal state
        this.modules.splice(moduleIndex, 1);

        // Eject dependencies
        return this.ejectDependencies(module);
      })
      .then(() => this.updateState("@global", state => {
        if (clearState) {
          // Create a copy and delete the module's slice from state
          return { ...state, [module.slice]: undefined };
        } else {
          return this.setupReducer(state); // No state clearing
        }
      }, this.systemActions.initializeState()))
      .then(() => this.lock.release());

    // Dispatch module unloaded action
    this.systemActions.moduleUnloaded(module);
    return promise;
  }
}

/**
 * Creates a store instance with the specified main module and optional enhancer.
 * @param {MainModule} mainModule - The main module of the store.
 * @param {StoreEnhancer} [enhancer] - An optional enhancer for the store.
 * @returns {Store} The created store instance.
 */
export function createStore(mainModule: MainModule, enhancer?: StoreEnhancer) {
  return Store.create(mainModule, enhancer);
}
