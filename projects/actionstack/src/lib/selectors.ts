import { Store } from './store';
import { AnyFn, MemoizedFn, ProjectionFunction } from "./types";
import { firstValueFrom } from 'rxjs';

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

export function createSelector<U = any, T = any> (
  slice: keyof T | string[],
  selectors: AnyFn | AnyFn[],
  projectionOrOptions?: ProjectionFunction | { memoizeSelectors?: AnyFn; memoizeProjection?: AnyFn },
  options: { memoizeSelectors?: AnyFn; memoizeProjection?: AnyFn } = {}
): (props?: any[] | any, projectionProps?: any) => MemoizedFn<U> {
  options = (typeof projectionOrOptions !== "function" ? projectionOrOptions : options) || {};

  const isSelectorArray = Array.isArray(selectors);
  const projection = typeof projectionOrOptions === "function" ? projectionOrOptions : undefined;

  // Default memoization functions if not provided
  const memoizeSelector = options.memoizeSelectors || nomemoize;
  const memoizeProjection = options.memoizeProjection || nomemoize;

  if (isSelectorArray && !projection) {
    throw new Error("Invalid parameters: When 'selectors' is an array, 'projection' function should be provided.");
  }

  // Memoize each selector
  const memoizedSelectors: AnyFn[] | AnyFn = isSelectorArray
    ? memoizeSelector === nomemoize ? selectors : selectors.map(selector => memoizeSelector(selector))
    : memoizeSelector === nomemoize ? selectors : memoizeSelector(selectors);

  // If a projection is provided, memoize it; otherwise, use identity function
  const memoizedProjection = memoizeProjection === nomemoize ? projection : (projection ? memoizeProjection(projection) : undefined);

  // The createSelector function will return a function that takes some arguments and returns combined result of selection and projection
  return (props?: any[] | any, projectionProps?: any) => {
    if(Array.isArray(props) && Array.isArray(selectors) && props.length !== selectors.length) {
      throw new Error('Not all selectors are parameterized. The number of props does not match the number of selectors.');
    }
    // The memoizedSelector function will return a function that executes the selectors and projection
    const fn = (store: Store): U => {
      let sliceState = store.getState(slice);
      if (sliceState instanceof Promise) {
        throw new Error("getState method returned a promise. Please use async selector instead.")
      }
      if (sliceState === undefined) {
        return undefined as U;
      }

      let selectorResults;
      if (Array.isArray(memoizedSelectors)) {
        selectorResults = memoizedSelectors.map((selector, index) => selector(sliceState, props[index]))
        return (selectorResults.some(result => typeof result === 'undefined'))
          ? undefined as U
          : memoizedProjection ? memoizedProjection(selectorResults, projectionProps) : selectorResults;
      } else {
        selectorResults = memoizedSelectors && memoizedSelectors(sliceState, props);
        return (typeof selectorResults === 'undefined')
          ? undefined as U
          : memoizedProjection ? memoizedProjection(selectorResults, projectionProps) : selectorResults;
      }
    };

    // Implement a release method if your memoization functions require cleanup
    fn.release = () => {
      // Release logic here, if necessary
      memoizedSelectors !== selectors && (Array.isArray(memoizedSelectors)
        ? memoizedSelectors.forEach((ms: any) => ms?.release && ms.release())
        : (memoizedSelectors as any)?.release && (memoizedSelectors as any).release());
      projection && memoizedProjection.release && memoizedProjection.release();
    }

    return fn;
  };
}

export function createSelectorAsync<U = any, T = any> (
  slice: keyof T | string[],
  selectors: AnyFn | AnyFn[] | Promise<AnyFn> | Promise<AnyFn>[],
  projectionOrOptions?: ProjectionFunction | { memoizeSelectors?: AnyFn; memoizeProjection?: AnyFn },
  options: { memoizeSelectors?: AnyFn; memoizeProjection?: AnyFn } = {}
): (props?: any[] | any, projectionProps?: any) => Promise<MemoizedFn<U>> {
  options = (typeof projectionOrOptions !== "function" ? projectionOrOptions : options) || {};

  const isSelectorArray = Array.isArray(selectors);
  const projection = typeof projectionOrOptions === "function" ? projectionOrOptions : undefined;

  // Default memoization functions if not provided
  const memoizeSelector = options.memoizeSelectors || nomemoize;
  const memoizeProjection = options.memoizeProjection || nomemoize;

  if (isSelectorArray && !projection) {
    throw new Error("Invalid parameters: When 'selectors' is an array, 'projection' function should be provided.");
  }

  // Memoize each selector
  const memoizedSelectors: AnyFn[] | AnyFn = isSelectorArray
    ? memoizeSelector === nomemoize ? selectors : selectors.map(selector => memoizeSelector(selector))
    : memoizeSelector === nomemoize ? selectors : memoizeSelector(selectors);

  // If a projection is provided, memoize it; otherwise, use identity function
  const memoizedProjection = memoizeProjection === nomemoize ? projection : (projection ? memoizeProjection(projection) : undefined);

  // The createSelectorAsync function will return a function that takes some arguments and returns combined result of selection and projection
  return async (props?: any[] | any, projectionProps?: any) => {
    if (Array.isArray(props) && Array.isArray(selectors) && props.length !== selectors.length) {
      throw new Error('Not all selectors are parameterized. The number of props does not match the number of selectors.');
    }
    // The memoizedSelector function will return a function that executes the selectors and projection
    const fn = async (store: Store): Promise<U> => {
      let sliceState = await store.getState(slice);
      if (sliceState === undefined) {
        return undefined as U;
      }

      let selectorResults;
      if (Array.isArray(memoizedSelectors)) {
        selectorResults = await Promise.allSettled(memoizedSelectors.map((selector, index) => selector(sliceState, props[index])));
        selectorResults = selectorResults.map(result => (result.status === 'rejected') ? undefined : result.value);

        return (selectorResults.some(result => typeof result === 'undefined'))
          ? undefined as U
          : memoizedProjection ? memoizedProjection(selectorResults, projectionProps) : selectorResults;
      } else {
        selectorResults = memoizedSelectors && await memoizedSelectors(sliceState, props);
        return (typeof selectorResults === 'undefined')
          ? undefined as U
          : memoizedProjection ? memoizedProjection(selectorResults, projectionProps) : selectorResults;
      }
    };

    const memoizedFn = (await fn) as MemoizedFn;
    // Implement a release method if your memoization functions require cleanup
    memoizedFn.release = () => {
      // Release logic here, if necessary
      memoizedSelectors !== selectors && (Array.isArray(memoizedSelectors)
        ? memoizedSelectors.forEach((ms: any) => ms?.release && ms.release())
        : (memoizedSelectors as any)?.release && (memoizedSelectors as any).release());
      projection && memoizedProjection.release && memoizedProjection.release();
    }

    return memoizedFn;
  };
}
