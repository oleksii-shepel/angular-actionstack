import { Action, AnyFn, Middleware, Reducer } from "redux-replica";
import { BehaviorSubject, Observable, Observer, ReplaySubject, Subscription } from "rxjs";

export type SideEffect = (action: Observable<Action<any>>, state?: Observable<any>) => Observable<any>;

export interface FeatureModule {
  slice: string;
  reducer: Reducer;
  effects: SideEffect[];
}

export interface MainModule {
  middlewares: Middleware[];
  reducer: Reducer;
  effects: SideEffect[];
}

export interface Store {
  dispatch: (action: Action<any>) => any;
  getState: () => any;
  addReducer: (featureKey: string, reducer: Reducer) => void;
  subscribe: (next?: AnyFn | Observer<any>, error?: AnyFn, complete?: AnyFn) => Subscription;
}


export interface EnhancedStore {
  dispatch: (action: Action<any>) => any;
  getState: () => any;
  addReducer: (featureKey: string, reducer: Reducer) => void;
  subscribe: (next?: AnyFn | Observer<any>, error?: AnyFn, complete?: AnyFn) => Subscription;
  initStore: (module: MainModule) => void;
  loadModule: (module: FeatureModule) => void;
  unloadModule: (module: FeatureModule) => void;

  pipeline: {
    middlewares: Middleware[];
    reducer: Reducer;
    effects: SideEffect[];
  };
  mainModule: MainModule;
  modules: FeatureModule[];
  actionStream: ReplaySubject<Observable<Action<any>>>;
  currentState: BehaviorSubject<any>;
  isDispatching: boolean;
}


export type StoreCreator = (reducer: Reducer, preloadedState?: any, enhancer?: StoreEnhancer) => Store;
export type StoreEnhancer = (next: StoreCreator) => StoreCreator;
