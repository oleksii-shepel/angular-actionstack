import { Observable, concatMap, distinctUntilChanged, filter, map, shareReplay } from "rxjs";
import { ProjectionFunction, SelectorFunction } from "./types";

export {
  createFeatureSelector as featureSelector,
  createSelector as selector,
  createSelectorAsync as selectorAsync
};

function createFeatureSelector<U = any, T = any> (
  slice: keyof T | string[]): (state$: Observable<T>) => Observable<U> {
  return (state$: Observable<T>) => state$.pipe(
    map(state => (Array.isArray(slice))
      ? slice.reduce((acc, key) => (acc && Array.isArray(acc) ? acc[parseInt(key)] : (acc as any)[key]) || undefined, state)
      : state && state[slice]),
    distinctUntilChanged(),
    shareReplay({bufferSize: 1, refCount: false})
  ) as Observable<U>;
}

function createSelector<U = any, T = any> (
  featureSelector$: ((state: Observable<T>) => Observable<U>) | "@global",
  selectors: SelectorFunction | SelectorFunction[],
  projectionOrOptions?: ProjectionFunction): (props?: any[] | any, projectionProps?: any) => (store: Observable<T>) => Observable<U> {

  const isSelectorArray = Array.isArray(selectors);
  const projection = typeof projectionOrOptions === "function" ? projectionOrOptions : undefined;

  if (isSelectorArray && !projection) {
    throw new Error("Invalid parameters: When 'selectors' is an array, 'projection' function should be provided.");
  }

  return (props?: any[] | any, projectionProps?: any) => {
    if(Array.isArray(props) && Array.isArray(selectors) && props.length !== selectors.length) {
      throw new Error('Not all selectors are parameterized. The number of props does not match the number of selectors.');
    }

    return (state$: Observable<T>) => {
      return (featureSelector$ === "@global"
        ? state$ : (featureSelector$ as Function)(state$)).pipe(
        map(sliceState => {
          if (sliceState === undefined) { return sliceState; }
          let selectorResults;
          if (Array.isArray(selectors)) {
            selectorResults = selectors.map((selector, index) => selector(sliceState, props[index]))
            return (selectorResults.some(result => result === undefined))
              ? undefined as U
              : projection ? projection(selectorResults, projectionProps) : selectorResults;
          } else {
            selectorResults = selectors && selectors(sliceState, props);
            return (selectorResults === undefined)
              ? undefined as U
              : projection ? projection(selectorResults, projectionProps) : selectorResults;
          }
        })
      );
    };
  };
}

function createSelectorAsync<U = any, T = any> (
  featureSelector$: ((state: Observable<T>) => Observable<U>) | "@global",
  selectors: SelectorFunction | SelectorFunction[],
  projectionOrOptions?: ProjectionFunction
): (props?: any[] | any, projectionProps?: any) => (store: Observable<T>) => Observable<U> {

  const isSelectorArray = Array.isArray(selectors);
  const projection = typeof projectionOrOptions === "function" ? projectionOrOptions : undefined;

  if (isSelectorArray && !projection) {
    throw new Error("Invalid parameters: When 'selectors' is an array, 'projection' function should be provided.");
  }

  return (props?: any[] | any, projectionProps?: any) => {
    if(Array.isArray(props) && Array.isArray(selectors) && props.length !== selectors.length) {
      throw new Error('Not all selectors are parameterized. The number of props does not match the number of selectors.');
    }

    return (state$: Observable<T>) => {
      return (featureSelector$ === "@global"
        ? state$ : (featureSelector$ as Function)(state$)).pipe(
        concatMap(async sliceState => {
          if (sliceState === undefined) { return sliceState; }
          let selectorResults;
          if (Array.isArray(selectors)) {
            // Use Promise.all to wait for all async selectors to resolve
            selectorResults = await Promise.all(selectors.map((selector, index) => selector(sliceState, props[index])));
            return (selectorResults.some(result => result === undefined))
              ? undefined as U
              : projection ? projection(selectorResults, projectionProps) : selectorResults;
          } else {
            // If selectors is a single function, await its result
            selectorResults = await selectors(sliceState, props);
            return (selectorResults === undefined)
              ? undefined as U
              : projection ? projection(selectorResults, projectionProps) : selectorResults;
          }
        })
      );
    };
  };
}
