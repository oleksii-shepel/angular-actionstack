import { Store } from './store';
import { AnyFn, ProjectionFunction } from "./types";

export function createSelector<U = any, T = any> (
  slice: keyof T | string[],
  selectors: AnyFn | AnyFn[],
  projectionOrOptions?: ProjectionFunction): (props?: any[] | any, projectionProps?: any) => AnyFn {

  const isSelectorArray = Array.isArray(selectors);
  const projection = typeof projectionOrOptions === "function" ? projectionOrOptions : undefined;

  if (isSelectorArray && !projection) {
    throw new Error("Invalid parameters: When 'selectors' is an array, 'projection' function should be provided.");
  }

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
      if (Array.isArray(selectors)) {
        selectorResults = selectors.map((selector, index) => selector(sliceState, props[index]))
        return (selectorResults.some(result => typeof result === 'undefined'))
          ? undefined as U
          : projection ? projection(selectorResults, projectionProps) : selectorResults;
      } else {
        selectorResults = selectors && selectors(sliceState, props);
        return (typeof selectorResults === 'undefined')
          ? undefined as U
          : projection ? projection(selectorResults, projectionProps) : selectorResults;
      }
    };

    return fn;
  };
}

export function createSelectorAsync<U = any, T = any> (
  slice: keyof T | string[],
  selectors: ((...args: any) => any | Promise<any>) | ((...args: any) => any | Promise<any>)[],
  projectionOrOptions?: ProjectionFunction
): (props?: any[] | any, projectionProps?: any) => Promise<AnyFn> {

  const isSelectorArray = Array.isArray(selectors);
  const projection = typeof projectionOrOptions === "function" ? projectionOrOptions : undefined;

  if (isSelectorArray && !projection) {
    throw new Error("Invalid parameters: When 'selectors' is an array, 'projection' function should be provided.");
  }

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
      if (Array.isArray(selectors)) {
        selectorResults = await Promise.allSettled(selectors.map(async (selector, index) => selector && await selector(sliceState, props && props[index])));
        selectorResults = selectorResults.map(result => result.status === 'fulfilled' ? result.value : undefined);

        return (selectorResults.some(result => typeof result === 'undefined'))
          ? undefined as U
          : projection ? projection(selectorResults, projectionProps) : undefined;
      } else {
        selectorResults = selectors && selectors(sliceState, props);
        return (typeof selectorResults === 'undefined')
          ? undefined as U
          : projection ? projection(selectorResults, projectionProps) : selectorResults;
      }
    };

    return fn;
  };
}
