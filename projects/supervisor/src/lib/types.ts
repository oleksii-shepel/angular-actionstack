import { BehaviorSubject, Observable, Observer, Subject, Subscription } from "rxjs";
import { ActionStack } from './structures';

export interface Action<T = any> {
  type: string;
  payload?: T;
  error?: boolean;
  meta?: any;
}

export interface AsyncAction<T = any> {
  (...args: any[]): Promise<T>;
}

export type SyncFunction<T> = (...args: any[]) => (dispatch: Function, getState?: Function) => T;
export type AsyncFunction<T> = (...args: any[]) => (dispatch: Function, getState?: Function) => Promise<T>;

export type Reducer = (state: any, action: Action<any>) => any;
export type MetaReducer = (reducer: Reducer) => Reducer;

export interface Middleware {
  (store: any): (next: (action: any) => any) => Promise<(action: any) => any> | any;
}
export interface Store {
  dispatch: (action: any) => any;
  getState: () => any;
  addReducer: (featureKey: string, reducer: Reducer) => void;
  subscribe: (next?: AnyFn | Observer<any>, error?: AnyFn, complete?: AnyFn) => Subscription;
}


export type AnyFn = (...args: any[]) => any;

export interface SelectorFunction {
  (state: any, props: any): any;
}

export interface ProjectorFunction {
  (state: any | any[], props: any): any;
}

export interface MemoizedFunction {
  (...args: any[]): any;
  release: () => any;
}

export interface MemoizedSelectorFunction extends MemoizedFunction, SelectorFunction {

}

export interface MemoizedProjectorFunction extends MemoizedFunction, ProjectorFunction {

}

export interface MemoizedSelector extends MemoizedFunction {
  (props: any | any[], projectorProps?: any): any;
  release: () => any;
}

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
    dependencies: Record<string, any>;
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


function isAction(action: any): boolean {
  return isPlainObject(action) && "type" in action && typeof action.type === "string";
}

function isPlainObject(obj: any): boolean {
  if (typeof obj !== "object" || obj === null)
    return false;

  let proto = obj;
  while (Object.getPrototypeOf(proto) !== null) {
    proto = Object.getPrototypeOf(proto);
  }

  return Object.getPrototypeOf(obj) === proto;
}

function kindOf(val: any): string {
  if (val === undefined)
    return "undefined";
  if (val === null)
    return "null";

  const type = typeof val;
  switch (type) {
    case "boolean":
    case "string":
    case "number":
    case "symbol":
    case "function": {
      return type;
    }
  }

  if (Array.isArray(val))
    return "array";

  if (isDate(val))
    return "date";

  if (isError(val))
    return "error";

  const constructorName = ctorName(val);
  switch (constructorName) {
    case "Symbol":
    case "Promise":
    case "WeakMap":
    case "WeakSet":
    case "Map":
    case "Set":
      return constructorName;
  }

  return Object.prototype.toString.call(val).slice(8, -1).toLowerCase().replace(/\s/g, "");
}

function ctorName(val: any): string {
  return typeof val.constructor === "function" ? val.constructor.name : null;
}

function isError(val: any): boolean {
  return val instanceof Error || typeof val.message === "string" && val.constructor && typeof val.constructor.stackTraceLimit === "number";
}

function isDate(val: any): boolean {
  if (val instanceof Date)
    return true;

  return typeof val.toDateString === "function" && typeof val.getDate === "function" && typeof val.setDate === "function";
}

export {
  isAction, isPlainObject, kindOf
};

