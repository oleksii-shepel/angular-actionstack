import { AnyFn, MemoizedFunction, MemoizedSelector, ProjectorFunction, SelectorFunction } from "./types";

// Shallow equality check function
const shallowEqual = (a: any[], b: any[]): boolean => {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

export const defaultMemoize: AnyFn = (fn: AnyFn): MemoizedFunction => {
  let lastArgs: any[] | undefined = undefined;
  let lastResult: any | undefined = undefined;
  let called = false;

  const resultFunc: MemoizedFunction = (...args: any[]): any => {
    if (called && lastArgs !== undefined && shallowEqual(args, lastArgs)) {
      return lastResult;
    }

    try {
      const result = fn(...args);
      lastResult = result;
      // Create a shallow copy of the args array to prevent future mutations from affecting the memoization
      lastArgs = [...args];
      called = true;
      return result;
    } catch (error) {
      // Handle error here
      throw error;
    }
  };

  resultFunc.release = () => {
    lastArgs = undefined;
    lastResult = undefined;
    called = false;
  };

  return resultFunc;
};

export function nomemoize(fn: AnyFn) {
  const func = (...args: any[]) => fn(...args);
  func.release = () => { Function.prototype };
  return func;
}

export function createSelector(
  selectors: SelectorFunction | SelectorFunction[],
  projectorOrOptions?: ProjectorFunction | { memoizeSelectors?: AnyFn; memoizeProjector?: AnyFn },
  options: { memoizeSelectors?: AnyFn; memoizeProjector?: AnyFn } = {}
): MemoizedSelector {
  options = typeof projectorOrOptions !== "function" ? projectorOrOptions as any : options || {};

  const isSelectorArray = Array.isArray(selectors);
  const selectorArray: SelectorFunction[] = isSelectorArray ? selectors : [selectors];
  const projector = typeof projectorOrOptions === "function" ? projectorOrOptions : undefined;

  // Default memoization functions if not provided
  const memoizeSelector = options.memoizeSelectors || nomemoize;
  const memoizeProjector = options.memoizeProjector || nomemoize;

  if (isSelectorArray && !projector) {
    throw new Error("Invalid parameters: When 'selectors' is an array, 'projector' function should be provided.");
  }

  // Memoize each selector
  const memoizedSelectors = memoizeSelector === nomemoize ? selectorArray : selectorArray.map(selector => memoizeSelector(selector));
  // If a projector is provided, memoize it; otherwise, use identity function
  const memoizedProjector = projector ? (memoizeProjector === nomemoize ? projector : memoizeProjector(projector)) : undefined;

  // The memoizedSelector function will return a function that executes the selectors and projector
  const memoizedSelector: MemoizedSelector = (state: any, props?: any) => {
    // Execute each selector with the state and props
    const resolvedSelectors = memoizedSelectors
      .map(selector => selector(state, props))
      .map(result => result instanceof Promise || result?.then instanceof Function ? result : Promise.resolve(result));
    // Wait for all the promises to resolve
    return Promise.all(resolvedSelectors).then(values => {
      // Apply the projector function to the resolved values
      return memoizedProjector ? memoizedProjector(...values) : values[0];
    });
  };

  // Optional: Implement a release method if your memoization functions require cleanup
  memoizedSelector.release = () => {
    // Release logic here, if necessary
    memoizedSelectors !== selectorArray && memoizedSelectors.forEach(selector => selector.release());
    projector && memoizedProjector.release();
  };

  return memoizedSelector;
}

