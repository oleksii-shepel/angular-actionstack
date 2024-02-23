import { AnyFn, MemoizedFn, ProjectionFunction } from "./types";

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

export const defaultMemoize: AnyFn = (fn: AnyFn): MemoizedFn => {
  let lastArgs: any[] | undefined = undefined;
  let lastResult: any | undefined = undefined;
  let called = false;

  const resultFunc: MemoizedFn = (...args: any[]): any => {
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
  selectors: AnyFn | AnyFn[],
  projectionOrOptions?: ProjectionFunction | { memoizeSelectors?: AnyFn; memoizeProjection?: AnyFn },
  options: { memoizeSelectors?: AnyFn; memoizeProjection?: AnyFn } = {}
): (props?: any[] | any, projectionProps?: any) => MemoizedFn {
  options = (typeof projectionOrOptions !== "function" ? projectionOrOptions : options) || {};

  const isSelectorArray = Array.isArray(selectors);
  const selectorArray: AnyFn[] = isSelectorArray ? selectors : [selectors];
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

  // The createSelector function will return a function that takes some arguments and returns a SelectorFunction or an array of SelectorFunctions
  return (props?: any[] | any, projectionProps?: any) => {
    if(!Array.isArray(props)) {
      props = [props];
    }
    // The memoizedSelector function will return a function that executes the selectors and projection
    const fn = (state: any) => {
      const selectorResults = memoizedSelectors.map((selector, index) => selector(state, props[index]));

      if(selectorResults.length === 1) {
        // Apply the projection function to the resolved values
        return memoizedProjection ? memoizedProjection(selectorResults[0], projectionProps) : selectorResults[0];
      } else {
        return memoizedProjection ? memoizedProjection(selectorResults, projectionProps) : undefined;
      }
    };

    // Implement a release method if your memoization functions require cleanup
    fn.release = () => {
      // Release logic here, if necessary
      memoizedSelectors !== selectorArray && memoizedSelectors.forEach(ms => ms.release());
      projection && memoizedProjection.release();
    }

    return fn;
  };
}

export function createSelectorAsync(
  selectors: AnyFn | AnyFn[] | Promise<MemoizedFn> | Promise<MemoizedFn>[],
  projectionOrOptions?: ProjectionFunction | { memoizeSelectors?: AnyFn; memoizeProjection?: AnyFn },
  options: { memoizeSelectors?: AnyFn; memoizeProjection?: AnyFn } = {}
): (props?: any[] | any, projectionProps?: any) => Promise<MemoizedFn> {
  options = (typeof projectionOrOptions !== "function" ? projectionOrOptions : options) || {};

  const isSelectorArray = Array.isArray(selectors);
  const selectorArray: (AnyFn | Promise<MemoizedFn>)[] = isSelectorArray ? selectors : [selectors];
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

  // The createSelectorAsync function will return a function that takes some arguments and returns a Promise that resolves to a SelectorFunction or an array of SelectorFunctions
  return async (props?: any[] | any, projectionProps?: any) => {
    if(!Array.isArray(props)) {
      props = [props];
    }
    // The memoizedSelector function will return a function that executes the selectors and projection
    const fn = async (state: any) => {
      // Execute each selector with the state and props
      const resolvedSelectors = await Promise.all(memoizedSelectors.map(async (selector, index) => {
        const result = await (selector instanceof Promise ? selector : Promise.resolve(selector(state, props[index])));
        return result;
      }));

      if(resolvedSelectors.length === 1) {
        // Apply the projection function to the resolved values
        return memoizedProjection ? memoizedProjection(resolvedSelectors[0], projectionProps) : resolvedSelectors[0];
      } else {
        return memoizedProjection ? memoizedProjection(resolvedSelectors, projectionProps) : undefined;
      }
    };

    const selector = await fn as any;

    // Implement a release method if your memoization functions require cleanup
    selector.release = () => {
      // Release logic here, if necessary
      memoizedSelectors !== selectorArray && memoizedSelectors.forEach(ms => ms.release && ms.release());
      projection && memoizedProjection.release && memoizedProjection.release();
    }

    return selector;
  };
}
