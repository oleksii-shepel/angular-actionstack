import { InjectionToken, Injector, Type, inject } from "@angular/core";
import { BehaviorSubject, EMPTY, Observable, Subject, Subscription, catchError, concatMap, distinctUntilChanged, filter, finalize, firstValueFrom, from, ignoreElements, map, mergeMap, of, scan, take, tap } from "rxjs";
import { action, bindActionCreators } from "./actions";
import { Stack } from "./collections";
import { isValidMiddleware } from "./hash";
import { starter } from "./starter";
import { CustomAsyncSubject } from "./subject";
import { Action, AnyFn, AsyncReducer, FeatureModule, MainModule, MetaReducer, ProcessingStrategy, Reducer, SideEffect, StoreEnhancer, Tree, isAction, isPlainObject, kindOf } from "./types";

export { createStore as store };

/**
 * Class representing configuration options for a store.
 *
 * This class defines properties that control various behaviors of a store for managing application state.
 */
export class StoreSettings {
  dispatchSystemActions = false;
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
    reducer: async (state: any = {}, action: Action<any>) => state as AsyncReducer,
    dependencies: {} as Tree<Type<any> | InjectionToken<any>>,
    strategy: "exclusive" as ProcessingStrategy
  };
  protected actionStream = new Subject<Action<any>>();
  protected actionStack = new Stack();
  protected currentAction = new CustomAsyncSubject<Action<any>>();
  protected currentState = new CustomAsyncSubject<any>();
  protected isProcessing = new BehaviorSubject<boolean>(false);
  protected subscription = Subscription.EMPTY;
  protected systemActions: Record<keyof typeof systemActions, any> = { ...systemActions };
  protected settings = Object.assign({}, new StoreSettings(), inject(StoreSettings));

  /**
 * Factory function to create a new Store instance.
 *
 * This function takes the main module configuration (`mainModule`) and an optional enhancer function (`enhancer`). It performs the following steps:
 *  1. Defines an inner function `storeCreator` that takes the `mainModule` as input.
 *  2. Creates a new `Store` instance.
 *  3. Merges the provided `mainModule` configuration with the store's default `mainModule` properties.
 *  4. Updates the store's `pipeline` object with properties derived from the `mainModule` configuration.
 *  5. Calls the `applyMiddleware` method (presumably defined elsewhere) to apply middleware to the pipeline.
 *  6. Sets up an observable stream (`action$`) from the `actionStream` subject.
 *  7. Defines a subscription pipeline using RxJS operators to process actions:
 *      - `scan` - Tracks the number of actions processed.
 *      - `concatMap` - Checks if it's the first action and logs a message if so. Then, either updates state with a setup reducer or emits the action for processing.
 *      - `processAction` - Likely calls a method to handle action processing.
 *  8. Subscribes to the action processing pipeline.
 *  9. Creates bound action creators for system actions using `bindActionCreators` and checks the `dispatchSystemActions` setting before dispatching.
 *  10. Dispatches the `initializeState` and `storeInitialized` system actions.
 *  11. Returns the newly created `Store` instance.
 *  12. If an enhancer function is provided, it's wrapped around the `storeCreator` to potentially add additional logic before creating the store.
 *
 * @param mainModule - The main module configuration object.
 * @param enhancer - Optional enhancer function to wrap the store creation process.
 * @returns Store - The newly created Store instance.
 */
  static create(mainModule: MainModule, enhancer?: StoreEnhancer) {

    let storeCreator = (mainModule: MainModule) => {

      let store = new Store();

      mainModule = Object.assign(store.mainModule, { ...mainModule });

      store.mainModule = mainModule;
      store.pipeline = Object.assign(store.pipeline, {
        middleware: Array.from(mainModule.middleware ?? []),
        reducer: store.combineReducers({[mainModule.slice!]: mainModule.reducer}),
        dependencies: Object.assign({}, { ...mainModule.dependencies }),
        strategy: mainModule.strategy,
      });

      store.applyMiddleware();

      let action$ = store.actionStream.asObservable();

      store.subscription = action$.pipe(
        scan((acc, action: any) => ({count: acc.count + 1, action}), {count: 0, action: undefined}),
        concatMap(({count, action}: any) => (count === 1) ? (console.log("%cYou are using ActionStack. Happy coding! 🎉", "font-weight: bold;"),
          store.updateState("@global", async () => store.setupReducer(), action)) : of(action)),
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

  /**
   * Dispatches an action to the store.
   *
   * This method takes an action object and performs the following validations:
   *  - Checks if the action is a plain object.
   *  - Ensures the action has a defined "type" property that's a string.
   *  - Throws errors if validations fail.
   *
   * If valid, the method pushes the action object into the `actionStream` subject for processing.
   *
   * @param action - The action object to dispatch.
   * @throws Error - If the action object is invalid.
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
   * Selects a slice of state using a selector function.
   *
   * This method takes a selector function and an optional default value.
   * The selector function receives the state observable as input and returns a new observable representing the selected state slice.
   * The returned observable is piped with operators to:
   *  - Map the value to the default value if undefined.
   *  - Filter out undefined values.
   *  - Use `distinctUntilChanged` to avoid emitting the same value repeatedly.
   *
   * @param selector - Function that takes the state observable and returns a new observable representing the selected state slice.
   * @param defaultValue - Optional default value to emit if the selection results in undefined.
   * @returns Observable<any> - An observable that emits the selected state slice.
   */
  select(selector: (obs: Observable<any>) => Observable<any>, defaultValue?: any): Observable<any> {
    return selector(this.currentState.asObservable()).pipe(
      map(value => value === undefined ? defaultValue : value),
      filter(value => value !== undefined),
      distinctUntilChanged());
  }

  /**
   * Retrieves the current state or a specific slice of the state.
   *
   * This method takes an optional `slice` parameter that can be:
   *  - Undefined: Returns the entire state.
   *  - String representing a state property key: Returns the value of that property.
   *  - Array of strings representing state property keys: Applies a reducer-like function to retrieve nested values.
   *
   * The method throws an error if the provided `slice` type is unsupported.
   *
   * @param slice - Optional state slice identifier (property key or array of keys).
   * @returns T - The entire state object or the selected state slice value.
   * @throws Error - If the provided `slice` type is unsupported.
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
   * Protected method to apply a single change to the state and accumulate edges.
   *
   * This method takes the following arguments:
   *  - `initialState`: The initial state object.
   *  - `{path, value}`: An object containing the update path (`path` - array of keys) and the new value.
   *  - `edges`: A tree structure (likely used to track changes and optimize subsequent updates).
   *
   * It iterates through the `path` array and performs the following steps:
   *  - Creates a copy of the current object if edges exist.
   *  - Traverses the state object based on the path keys.
   *  - If it's the last key in the path (leaf node):
   *      - Updates the value of the corresponding property in the current object.
   *      - Sets the corresponding edge in the `edges` tree to `true`.
   *  - Otherwise (non-leaf node):
   *      - Creates a copy of the nested object if necessary based on the edges information.
   *      - Continues traversing to the next level using the current object and updates the `currentEdges` for the next iteration.
   *
   * Finally, the method returns the updated state object.
   *
   * @param initialState - The initial state object.
   * @param pathAndValue - An object containing the update path (`path` - array of keys) and the new value.
   * @param edges - A tree structure (likely used to track changes and optimize subsequent updates).
   * @returns any - The updated state object.
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
   * Protected method to update the state based on a slice and value.
   *
   * This method takes an optional `slice` argument that can be:
   *  - Undefined: Updates the entire state with a shallow copy of the provided `value`.
   *  - String representing a state property key: Updates the state property with the given key using a shallow copy of the `value`.
   *  - Array of strings representing state property keys: Calls the `applyChange` method to update a nested value using the path and value.
   *
   * The method throws an error if the provided `slice` type is unsupported.
   *
   * @param slice - Optional state slice identifier (property key or array of keys).
   * @param value - Optional new value to update the state with.
   * @returns any - The updated state object.
   * @throws Error - If the provided `slice` type is unsupported.
   */
  protected setState<T = any>(slice?: keyof T | string[], value?: any): any {
    if (slice === undefined || typeof slice === "string" && slice == "@global") {
      // update the whole state with a shallow copy of the value
      return ({...value});
    } else if (typeof slice === "string") {
      // update the state property with the given key with a shallow copy of the value
      return {...this.currentState.value, [slice]: { ...value }};
    } else if (Array.isArray(slice)) {
      return this.applyChange(this.currentState.value, {path: slice, value}, {});
    } else {
      throw new Error("Unsupported type of slice parameter");
    }
  }

  /**
   * Protected asynchronous method to update state using a callback function.
   *
   * This method takes the following arguments:
   *  - `slice`: Optional state slice identifier (property key or array of keys).
   *  - `callback`: Function that receives the current state and returns the updated state value.
   *  - `action`: Optional action object (defaults to `systemActions.updateState`).
   *
   * The method performs the following steps asynchronously:
   *  - Throws an error if the `callback` function is missing.
   *  - Retrieves the current state for the specified slice using `getState`.
   *  - Calls the `callback` function with the retrieved state.
   *  - Updates the state using `setState` with the result from the callback.
   *  - Emits the updated state to the `currentState` subject.
   *  - Dispatches the provided `action` (defaults to `updateState`).
   *  - Optionally waits for both state propagation and action handling to complete using `Promise.allSettled`.
   *  - Finally, returns the provided `action` object.
   *
   * @param slice - Optional state slice identifier (property key or array of keys).
   * @param callback - Function that receives the current state and returns the updated state value.
   * @param action - Optional action object (defaults to `systemActions.updateState`).
   * @returns Promise<any> - A promise that resolves with the provided `action` object.
   */
  protected updateState<T = any>(slice: keyof T | string[] | undefined, callback: AnyFn, action: Action<any> = systemActions.updateState()): Promise<any> {
    return (async () => {
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
    })();
  }

  /**
   * Protected method that combines multiple reducers into a single asynchronous reducer.
   *
   * This method takes a tree structure (`reducers`) containing individual reducers.
   * It iterates through the tree and builds a map that associates each reducer function with its corresponding state slice path (an array of keys).
   *
   * The method returns a new asynchronous reducer function (`combinedReducer`). This function:
   *  - Takes the current state object and an action object as arguments.
   *  - Iterates through the reducer map:
   *      - Retrieves the current state for the reducer's slice path using `getState`.
   *      - Calls the reducer function with the retrieved state and the action.
   *      - If the reducer returns a new state (different from the current state):
   *          - Uses `applyChange` to update the combined state object with the new state for the specific slice path.
   *  - Catches potential errors during reducer execution and logs a warning message.
   *  - Finally, returns the combined state object.
   *
   * @param reducers - A tree structure containing individual reducers for different state slices.
   * @returns AsyncReducer - A new asynchronous reducer function that combines all provided reducers.
   */
  protected combineReducers(reducers: Tree<Reducer>): AsyncReducer {
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
   * Protected asynchronous method to set up the store's root reducer.
   *
   * This method performs the following steps asynchronously:
   *  1. Merges reducers from the main module and other registered modules:
   *      - Extracts the `slice` and `reducer` properties from the main module.
   *      - Iterates through other registered modules and combines their reducers if they exist.
   *      - Builds a tree structure (`featureReducers`) with the combined slice-reducer pairs.
   *  2. Calls `combineReducers` to create a single asynchronous reducer from the feature reducers.
   *  3. Optionally applies meta-reducers (if enabled in settings and provided by the main module):
   *      - Defines an `asyncCompose` function to compose meta-reducers asynchronously.
   *      - If meta-reducers are defined in the main module, it creates an asynchronous composition chain using `asyncCompose` and applies it to the combined reducer.
   *  4. Updates the store's pipeline with the final reducer.
   *  5. Initializes the store state by calling the combined reducer with an initial state and the `updateState` system action.
   *  6. Returns the initial state after processing by the combined reducer.
   *
   * @param state - Optional initial state object (defaults to an empty object).
   * @returns Promise<any> - A promise that resolves with the initial state after processing by the combined reducer.
   */
  protected async setupReducer(state: any = {}): Promise<any> {

    let featureReducers = [{slice: this.mainModule.slice!, reducer: this.mainModule.reducer}, ...this.modules].reduce((reducers, module) => {
      let moduleReducer: any = module.reducer instanceof Function ? module.reducer : {...module.reducer};
      reducers = {...reducers, [module.slice]: moduleReducer};
      return reducers;
    }, {} as Tree<Reducer>);

    let reducer = this.combineReducers(featureReducers);

    const asyncCompose = (...fns: MetaReducer[]) => async (reducer: AsyncReducer) => {
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
    return await reducer(state, systemActions.updateState());
  }

  /**
   * Protected method to inject dependencies into the store pipeline.
   *
   * This method takes an `Injector` object and performs the following steps:
   *  1. Initializes an empty object `newDependencies` to store combined dependencies.
   *  2. Combines dependencies from the main module and other registered modules:
   *      - Extracts the `dependencies` property from the main module.
   *      - Iterates through other registered modules and filters out modules without dependencies.
   *      - Creates an array `allDependencies` containing these combined dependency objects.
   *  3. Recursively iterates through `allDependencies` using a depth-first search (DFS) approach:
   *      - Iterates over each key-value pair in the current dependency object.
   *      - For arrays as values:
   *          - Adds each element to the `stack` for further processing.
   *      - For objects as values:
   *          - Adds each child key-value pair to the `stack` for processing.
   *      - For function or `InjectionToken` values:
   *          - Uses the injector to retrieve the actual dependency instance and stores it in the corresponding key of the `newDependencies` object.
   *  4. Initializes an empty object `pipeline.dependencies` to store the pipeline-specific dependencies.
   *  5. Creates a stack for the DFS traversal, initializing it with the top-level dependencies.
   *  6. Iterates through the `stack` until empty:
   *      - Pops a node from the stack with properties `parent`, `key`, and `subtree`.
   *      - Extracts the value from the current parent object using the `key`.
   *      - Based on the value type:
   *          - For arrays: Adds elements to the corresponding subtree in `newDependencies` for further processing.
   *          - For objects: Adds child key-value pairs to the `stack` for further processing.
   *          - For functions or `InjectionToken`s: Retrieves the dependency from the injector and stores it in the subtree.
   *  7. Updates the `pipeline.dependencies` with the final processed `newDependencies` object.
   *  8. Returns the current `Store` instance (likely for method chaining).
   *
   * @param injector - The injector object used to retrieve dependencies.
   * @returns Store - The current Store instance.
   */
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

  /**
   * Protected method to eject dependencies for a specific feature module.
   *
   * This method takes a `FeatureModule` instance and performs the following steps:
   *  1. Combines dependencies from the main module and other modules, excluding the module to be ejected:
   *      - Filters out the provided `module` from the registered modules list.
   *      - Creates an array `allDependencies` containing dependencies from the main module and remaining modules.
   *  2. Initializes an empty object `newDependencies` to store the processed dependencies.
   *  3. Recursively iterates through `allDependencies` using a DFS approach (similar to `injectDependencies`).
   *  4. Creates a stack for the DFS traversal, initializing it with source and target objects.
   *      - Source: Existing pipeline dependencies.
        - Target: The `newDependencies` object.
  *  5. Iterates through the `stack` until empty:
  *      - Pops a node from the stack with properties `source` and `target`.
  *  6. Iterates through each key in the `target` object:
  *      - For arrays as target values:
  *          - Iterates through elements and copies non-function/InjectionToken values to the stack for further processing.
  *          - For function/InjectionToken values, directly copies the source value to the target.
  *      - For objects as target values: Adds child key-value pairs to the `stack` for processing.
  *      - For function/InjectionToken as target values: Directly copies the source value to the target.
  *  7. Assigns the processed `newDependencies` object to `pipeline.dependencies`.
  *  8. Returns the current `Store` instance (likely for method chaining).
  *
  * @param module - The FeatureModule instance to eject dependencies for.
  * @returns Store - The current Store instance.
  */
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
   * Protected method that creates an operator function for processing actions.
   *
   * This method takes an observable source of `Action` objects and returns a new observable.
   * The returned observable applies the following operators to each emitted action:
   *  - `concatMap`: Ensures actions are processed sequentially (one at a time).
   *  - Inside `concatMap`:
   *      - Wraps the action processing in a `try...finally` block.
   *      - Attempts to update the entire state ("@global") using `updateState`.
   *          - The update callback calls the pipeline's reducer with the current state and the action.
   *      - Pops the action from the internal `actionStack` after processing (regardless of success or failure).
   *      - If the `actionStack` becomes empty, it emits `false` on the `isProcessing` subject.
   *  - `ignoreElements`: Ignores the values emitted by the action processing logic (we only care about side effects).
   *  - `catchError`: Catches any errors during action processing and logs a warning message.
   *      - Returns an empty observable (`EMPTY`) to prevent further errors downstream.
   *
   * @param source - An observable source of `Action` objects.
   * @returns Observable - A new observable that processes actions sequentially.
   */
  protected processAction() {
    return (source: Observable<Action<any>>) => {
      return source.pipe(
        concatMap(async (action: Action<any>) => {
          try {
            await this.updateState("@global", async (state) => this.pipeline.reducer(state, action), action);
          } finally {
            this.actionStack.pop();
            if (this.actionStack.length === 0) {
              this.isProcessing.next(false);
            }
          }
          return EMPTY;
        }),
        ignoreElements(),
        catchError((error) => {
          console.warn(error.message);
          return EMPTY;
        })
      );
    };
  }

  /**
   * Protected method to apply middleware to the dispatch function.
   *
   * This method creates a new dispatch function that chains the provided middleware functions.
   * Here's a breakdown of the steps:
   *  1. Initializes a temporary `dispatch` function that throws an error if called during middleware setup.
   *  2. Defines an object `starterAPI` containing initial store APIs for middleware:
   *      - `getState`: Retrieves the current state.
   *      - `dispatch`: Dispatches actions (initially the temporary `dispatch`).
   *      - `isProcessing`: Access to the `isProcessing` subject.
   *      - `actionStack`: Access to the internal action stack.
   *      - `dependencies`: Retrieves pipeline dependencies.
   *      - `strategy`: Retrieves the pipeline execution strategy.
   *  3. Defines an object `middlewareAPI` (used internally by middleware) containing basic store APIs:
   *      - `getState`: Retrieves the current state.
   *      - `dispatch`: Dispatches actions.
   *  4. Creates an array `chain` containing chained middleware functions:
   *      - The first element is the result of calling `starter` with either `starterAPI` or `middlewareAPI` depending on middleware signature validation.
   *      - Subsequent elements are the results of calling each middleware function from `pipeline.middleware` with `middlewareAPI`.
   *  5. Composes the middleware chain using `compose` from Actionstack.
   *  6. Binds the original `dispatch` method to `this` context.
   *  7. Updates the store's `dispatch` function with the composed middleware chain applied to the bound `dispatch`.
   *  8. Returns the current `Store` instance (likely for method chaining).
   *
   * @returns Store - The current Store instance.
   */
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

  /**
   * Protected asynchronous method to process a system action using the provided operator.
   *
   * This method takes an operator function that transforms an observable stream.
   * It performs the following steps asynchronously:
   *  1. Waits for the `isProcessing` subject to emit `false` (indicating no ongoing action processing).
   *  2. Sets the `isProcessing` subject to `true` before processing.
   *  3. Applies the provided `operator` to an observable stream that emits the current state.
   *  4. Catches any errors during processing and logs a warning message.
   *      - Returns an empty observable (`EMPTY`) to prevent further errors downstream.
   *  5. Finally, sets the `isProcessing` subject back to `false`.
   *  6. Awaits the result of the observable chain and likely returns nothing (void).
   *
   * @param operator - A function that takes an observable and returns a transformed observable.
   */
  protected processSystemAction(operator: (obs: Observable<any>) => Observable<any>) {
    return (async() => await firstValueFrom(this.isProcessing.pipe(filter(value => value === false),
      tap(() => this.isProcessing.next(true)),
      operator,
      catchError(error => { console.warn(error.message); return EMPTY; }),
      finalize(() => this.isProcessing.next(false))
    )))();
  }

  /**
   * Public method that combines multiple side effects into a single observable stream.
   *
   * This method takes an indefinite number of `SideEffect` functions as arguments.
   * It returns an observable stream that emits actions dispatched by the side effects.
   * Here's a breakdown of the implementation:
   *  1. Retrieves the pipeline dependencies from `pipeline.dependencies`.
   *  2. Chooses the appropriate mapping operator based on the pipeline strategy:
   *      - "concurrent": Uses `mergeMap` to allow side effects to run concurrently.
   *      - Otherwise: Uses `concatMap` to run side effects sequentially (one at a time).
   *  3. Creates an observable `effects$` using the `isProcessing` subject:
   *      - Waits for the `isProcessing` subject to emit `false` (no ongoing action processing).
   *      - Takes only one emission using `take(1)`.
   *      - Dispatches a `systemActions.effectsRegistered` action with the provided side effects.
   *      - Uses `concatMap` to chain the following logic triggered by the current action:
   *          - Converts the current action observable using `asObservable`.
   *          - Converts the provided side effect functions to an observable stream using `from`.
   *          - Combines side effects and applies the mapping operator (`mapMethod`) in a single pipe:
   *              - The `mapMethod` (either `mergeMap` or `concatMap`) ensures side effects are run according to the strategy.
   *              - Inside the mapping function:
   *                  - Calls each side effect with the current action observable, current state observable, and dependencies.
   *                  - Casts the side effect result to an `Observable<Action<any>>`.
   *          - Flattens child actions emitted by side effects using `mergeMap`:
   *              - Checks if the emitted value is an action using `isAction`.
   *                  - If it's an action:
   *                      - Creates an observable with the action using `of`.
   *                      - Pipes the action through a `tap` operator to dispatch it using the store's `dispatch` function.
   *                  - If it's not an action: Returns an empty observable (`EMPTY`) to prevent further emissions.
   *  4. Finalizes the observable chain by dispatching a `systemActions.effectsUnregistered` action with the side effects.
   *  5. Returns the observable stream `effects$`.
   *
   * @param args - An indefinite number of `SideEffect` functions.
   * @returns Observable<any> - An observable stream that emits actions dispatched by the side effects.
   */
  extend(...args: SideEffect[]): Observable<any> {
    const dependencies = this.pipeline.dependencies;
    const mapMethod = this.pipeline.strategy === "concurrent" ? mergeMap : concatMap;

    const effects$ = this.isProcessing.pipe(
      filter(value => value === false),
      take(1),
      tap(() => this.systemActions.effectsRegistered(args)),
      concatMap(() => this.currentAction.asObservable().pipe(() => from([...args]).pipe(
          // Combine side effects and map in a single pipe
          mapMethod(sideEffect => sideEffect(this.currentAction.asObservable(), this.currentState.asObservable(), dependencies) as Observable<Action<any>>),
          // Flatten child actions and dispatch directly
          mergeMap((childAction: any) =>
            isAction(childAction) ? of(childAction).pipe(tap(this.dispatch)) : EMPTY
          )
        )
      )),
      finalize(() => this.systemActions.effectsUnregistered(args))
    );

    return effects$;
  }

  /**
   * Public method to load a feature module into the store.
   *
   * This method takes a `FeatureModule` instance and an `Injector` object.
   * It performs the following actions using a system action pipeline:
   *  1. Checks if the module already exists using `this.modules.some`.
   *      - If it exists, returns the current `Store` instance without changes.
   *  2. Creates a new array with the provided module appended to the existing modules.
   *  3. Updates the store's internal `modules` property with the new array.
   *  4. Injects dependencies for the feature module using `injectDependencies`.
   *  5. Updates the entire state ("@global") using `updateState`:
   *      - Calls `setupReducer` to potentially create a new combined reducer with the loaded module.
   *  6. Dispatches a `systemActions.moduleLoaded` action with the loaded module.
   *  7. Returns the current `Store` instance (likely for method chaining).
   *
   * @param module - The FeatureModule instance to load.
   * @param injector - The injector object used to inject dependencies.
   * @returns Store - The current Store instance.
   */
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
      concatMap(() => this.updateState("@global", async (state) => this.setupReducer(state), systemActions.updateState())),
      tap(() => this.systemActions.moduleLoaded(module)),
    ));

    return this;
  }

  /**
   * Public method to unload a feature module from the store.
   *
   * This method takes a `FeatureModule` instance and an optional `clearState` flag (defaults to `false`).
   * It unloads the module and optionally clears its corresponding state slice.
   * Here's a breakdown of the process:
   *  1. Uses `processSystemAction` to execute the following logic within a system action pipeline:
   *      - Inside the pipeline:
   *          - Removes the provided module from the store's internal `modules` list using a `tap` operator:
   *              - Filters out modules where the `slice` property doesn't match the provided module's slice.
   *              - Updates the store's `modules` property with the filtered array.
   *          - Ejects dependencies associated with the unloaded module using `ejectDependencies`.
   *          - Updates the entire state ("@global") using `updateState`:
   *              - Calls `setupReducer` to potentially create a new combined reducer without the unloaded module.
   *              - Optionally clears the state slice for the unloaded module:
   *                  - If `clearState` is `true`, creates a copy of the state using spread syntax (`...state`).
   *                  - Deletes the property corresponding to the module's slice from the copied state.
   *          - Dispatches a `systemActions.moduleUnloaded` action with the unloaded module.
   *  2. Returns the current `Store` instance (likely for method chaining).
   *
   * @param module - The FeatureModule instance to unload.
   * @param clearState - Optional flag (defaults to `false`) to indicate whether to clear the state slice for the unloaded module.
   * @returns Store - The current Store instance.
   */
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
      concatMap(() => this.updateState("@global", async (state) => {
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

/**
 * Creates a new store instance.
 *
 * This function is a wrapper around the internal `Store.create` method.
 * It takes a `MainModule` instance as a required argument and an optional `StoreEnhancer` function.
 * The `MainModule` defines the core configuration for the store, including initial state and reducers.
 * The optional `StoreEnhancer` allows for applying middleware or other enhancements to the store creation process.
 *
 * @param mainModule - The MainModule instance that defines the core store configuration.
 * @param enhancer - Optional StoreEnhancer function to apply enhancements during store creation.
 * @returns Store - A newly created Store instance.
 */
export function createStore(mainModule: MainModule, enhancer?: StoreEnhancer) {
  return Store.create(mainModule, enhancer);
}

/**
 * Composes multiple functions into a single function.
 *
 * This function takes a variable number of function arguments.
 * It returns a new function that is the composition of the provided functions.
 * The composition order is from right to left, meaning the rightmost function is executed first.
 *
 * Here's how function composition works:
 *  - If no functions are provided (empty array), the function simply returns the argument passed to it.
 *  - If only one function is provided, the function returns that function itself.
 *  - For multiple functions:
 *      - The function uses `reduce` to create the composed function.
 *      - The reducer takes two arguments:
 *          - `a`: The accumulator function (initially the last function in the argument list).
 *          - `b`: The current function being processed.
 *      - The reducer returns a new function that takes any number of arguments:
 *          - It calls `a` with the result of calling `b` with the provided arguments.
 *          - Effectively, the result of the current function (`b`) becomes the argument for the next function (`a`) in the composition chain.
 *
 * @param funcs - A variable number of functions to be composed.
 * @returns AnyFn - A new function that is the composition of the provided functions.
 */
function compose(...funcs: AnyFn[]): AnyFn {
  if (funcs.length === 0) {
    return (arg: any): any => arg;
  }

  if (funcs.length === 1) {
    return funcs[0];
  }

  return funcs.reduce((a, b) => (...args: any[]) => a(b(...args)));
}

/**
 * Creates a deep copy of an object.
 *
 * This function takes an object as input and returns a new object that is a copy of the original.
 * It performs a deep copy, meaning it copies the entire object structure and nested objects.
 *
 * The function handles different object types:
 *  - If the input is `null` or a primitive type (not an object), it returns the original value.
 *  - For arrays: It creates a new empty array and copies the elements using deep copy.
 *  - For objects: It creates a new object of the same type (empty object for plain objects).
 *      - Iterates over each own property of the original object.
 *      - For each property, it calls itself recursively (`deepCopy`) to create a deep copy of the property value.
 *      - Adds the copied property key-value pair to the new object.
 *
 * @param obj - The object to be deep copied.
 * @returns any - A new object that is a deep copy of the original object.
 */
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

