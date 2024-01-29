import { Action, AnyFn, Middleware, Reducer } from "redux-replica";
import { BehaviorSubject, Observable, Observer, Subject, Subscription } from "rxjs";
import { ActionStack } from './stack';

export type SideEffect = (action: Observable<Action<any>>, state: Observable<any>, dependencies: Record<string, any>) => Observable<Action<any>>;

export interface FeatureModule {
  slice: string;
  reducer: Reducer;
  effects: SideEffect[];
  dependencies: Record<string, any>;
}

export interface MainModule {
  middlewares: Middleware[];
  reducer: Reducer;
  effects: SideEffect[];
  dependencies: Record<string, any>;
}

export interface Store {
  dispatch: (action: any) => any;
  getState: () => any;
  addReducer: (featureKey: string, reducer: Reducer) => void;
  subscribe: (next?: AnyFn | Observer<any>, error?: AnyFn, complete?: AnyFn) => Subscription;
}


export interface EnhancedStore extends Store {
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
  actionStream: Subject<Action<any>>;
  actionStack: ActionStack;
  currentState: BehaviorSubject<any>;
  isProcessing: BehaviorSubject<boolean>;
}


export type StoreCreator = (reducer: Reducer, preloadedState?: any, enhancer?: StoreEnhancer) => Store;
export type StoreEnhancer = (next: StoreCreator) => StoreCreator;
