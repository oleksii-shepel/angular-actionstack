import { InjectionToken, Type } from "@angular/core";
import { Observable, isObservable } from "rxjs";
import { Store } from "./store";

export interface Action<T = any> {
  type: string;
  payload?: T;
  error?: boolean;
  meta?: any;
}

export interface AsyncAction<T = any> {
  (...args: any[]): Promise<T>;
}

export type Reducer = (state: any, action: Action<any>) => any | Promise<any>;
export type MetaReducer = (reducer: Reducer) => Reducer | Promise<Reducer>;

export interface Middleware {
  (store: any): (next: (action: any) => any) => Promise<(action: any) => any> | any;
  signature?: string;
}

export type AnyFn = (...args: any[]) => any;

export interface SelectorFunction {
  (state: any, props?: any): any;
}

export interface ProjectionFunction {
  (state: any | any[], props?: any): any;
}

export type SideEffect = (action: Observable<Action<any>>, state: Observable<any>, dependencies: Record<string, any>) => Observable<Action<any>>;

export type Tree<LeafType, T = any> = {
  [K in keyof T]: T[K] extends object ? Tree<LeafType, T[K]> : LeafType;
};

export type ProcessingStrategy = "exclusive" | "concurrent";
export interface FeatureModule {
  slice: string;
  reducer: Reducer | Tree<Reducer>;
  dependencies?: Tree<Type<any> | InjectionToken<any>>;
}

export interface MainModule {
  slice?: string;
  middleware?: Middleware[];
  reducer: Reducer | Tree<Reducer>;
  metaReducers?: MetaReducer[];
  dependencies?: Tree<Type<any> | InjectionToken<any>>;
  strategy?: ProcessingStrategy;
}

export type StoreCreator = (module: MainModule, enhancer?: StoreEnhancer) => Store;
export type StoreEnhancer = (next: StoreCreator) => StoreCreator;

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

  if (isObservable(val))
    return "observable";

  if (isPromise(val))
    return "promise";

  const constructorName = ctorName(val);
  switch (constructorName) {
    case "Symbol":
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

function isBoxed(value: any) {
  return value !== undefined && value !== null && value.valueOf() !== value;
}

function isPrimitive(value: any) {
  return value === undefined || value === null || typeof value !== 'object';
}

function isPromise(value: any) {
  return Promise.resolve(value) == value;
}

function isAction(action: any): boolean {
  return isPlainObject(action) && "type" in action && typeof action.type === "string";
}

function isAsync(func: Function) {
  return func.constructor.name === "AsyncFunction";
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

export { isAction, isAsync, isBoxed, isPlainObject, isPrimitive, kindOf };

