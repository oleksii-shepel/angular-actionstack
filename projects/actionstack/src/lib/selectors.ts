import { AnyFn, MemoizedFunction, MemoizedSelector, ProjectionFunction, SelectorFunction } from "./types";

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
  projectionOrOptions?: ProjectionFunction | { memoizeSelectors?: AnyFn; memoizeProjection?: AnyFn },
  options: { memoizeSelectors?: AnyFn; memoizeProjection?: AnyFn } = {}
): (props?: any[] | any, projectionProps?: any) => MemoizedSelector {
  options = (typeof projectionOrOptions !== "function" ? projectionOrOptions : options) || {};

  const isSelectorArray = Array.isArray(selectors);
  const selectorArray: SelectorFunction[] = isSelectorArray ? selectors : [selectors];
  const projection = typeof projectionOrOptions === "function" ? projectionOrOptions : undefined;

  // Default memoization functions if not provided
  const memoizeSelector = options.memoizeSelectors || nomemoize;
  const memoizeProjection = options.memoizeProjection || nomemoize;

  if (isSelectorArray && !projection) {
    throw new Error("Invalid parameters: When 'selectors' is an array, 'projection' function should be provided.");
  }

  // Memoize each selector
  const memoizedSelectors = memoizeSelector === nomemoize ? selectorArray : selectorArray.map(selector => memoizeSelector(selector));
  // If a projection is provided, memoize it; otherwise, use identity function
  const memoizedProjection = projection ? (memoizeProjection === nomemoize ? projection : memoizeProjection(projection)) : undefined;

  // The createSelector function will return a function that takes some arguments and returns a memoizedSelector function
  return (props: any[] | any, projectionProps: any) => {
    if(!Array.isArray(props)) {
      props = [props];
    }
    // The memoizedSelector function will return a function that executes the selectors and projection
    const memoizedSelector = (state: any) => {
      // Execute each selector with the state and props
      const values = memoizedSelectors.map((selector, index) => selector(state, props[index]));

      // Apply the projection function to the resolved values
      return memoizedProjection ? memoizedProjection(...values, projectionProps) : values[0];
    };

    const selector = memoizedSelector as MemoizedSelector;

    // Optional: Implement a release method if your memoization functions require cleanup
    selector.release = () => {
      // Release logic here, if necessary
      memoizedSelectors !== selectorArray && memoizedSelectors.forEach(ms => ms.release());
      projection && memoizedProjection.release();
    };

    return selector;
  };
}

export function createSelectorAsync(
  selectors: SelectorFunction | SelectorFunction[],
  projectionOrOptions?: ProjectionFunction | { memoizeSelectors?: AnyFn; memoizeProjection?: AnyFn },
  options: { memoizeSelectors?: AnyFn; memoizeProjection?: AnyFn } = {}
): (props?: any[] | any, projectionProps?: any) => Promise<MemoizedSelector> {
  options = (typeof projectionOrOptions !== "function" ? projectionOrOptions : options) || {};

  const isSelectorArray = Array.isArray(selectors);
  const selectorArray: SelectorFunction[] = isSelectorArray ? selectors : [selectors];
  const projection = typeof projectionOrOptions === "function" ? projectionOrOptions : undefined;

  // Default memoization functions if not provided
  const memoizeSelector = options.memoizeSelectors || nomemoize;
  const memoizeProjection = options.memoizeProjection || nomemoize;

  if (isSelectorArray && !projection) {
    throw new Error("Invalid parameters: When 'selectors' is an array, 'projection' function should be provided.");
  }

  // Memoize each selector
  const memoizedSelectors = memoizeSelector === nomemoize ? selectorArray : selectorArray.map(selector => memoizeSelector(selector));
  // If a projection is provided, memoize it; otherwise, use identity function
  const memoizedProjection = projection ? (memoizeProjection === nomemoize ? projection : memoizeProjection(projection)) : undefined;

  // The createSelectorAsync function will return a function that takes some arguments and returns a memoizedSelector function
  return async (props: any[] | any, projectionProps: any) => {
    if(!Array.isArray(props)) {
      props = [props];
    }
    // The memoizedSelector function will return a function that executes the selectors and projection
    const memoizedSelector = async (state: any) => {
      // Execute each selector with the state and props
      const resolvedSelectors = memoizedSelectors
        .map((selector, index) => selector(state, props[index]))
        .map(result => result instanceof Promise || result?.then instanceof Function ? result : Promise.resolve(result));

      // Wait for all the promises to resolve
      const values = await Promise.all(resolvedSelectors);

      // Apply the projection function to the resolved values
      return memoizedProjection ? memoizedProjection(...values, projectionProps) : values[0];
    };

    const selector = (await memoizedSelector) as MemoizedSelector;

    // Optional: Implement a release method if your memoization functions require cleanup
    selector.release = () => {
      // Release logic here, if necessary
      memoizedSelectors !== selectorArray && memoizedSelectors.forEach(ms => ms.release());
      projection && memoizedProjection.release();
    };

    return selector;
  };
}

