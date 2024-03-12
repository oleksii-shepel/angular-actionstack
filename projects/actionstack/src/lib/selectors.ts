import { EMPTY, Observable, concatMap, distinctUntilChanged, map, of, shareReplay } from "rxjs";
import { Store } from './store';
import { AnyFn, ProjectionFunction } from "./types";

export function createFeatureSelector<U = any, T = any> (
  slice: keyof T | string[]): (state$: Observable<T>) => Observable<U> {
  return (state$: Observable<T>) => state$.pipe(
    map(state => (Array.isArray(slice))
      ? slice.reduce((acc, key) => (acc && Array.isArray(acc) ? acc[parseInt(key)] : (acc as any)[key]) || undefined, state)
      : state[slice]),
    concatMap(state => state === undefined ? EMPTY: of(state)),
    distinctUntilChanged(),
    shareReplay({bufferSize: 1, refCount: false})
  ) as Observable<U>;
}

export function createSelector<U = any, T = any> (
  featureSelector$: (store: Observable<T>) => Observable<U>,
  selectors: AnyFn | AnyFn[],
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
      return featureSelector$(state$).pipe(
        concatMap(sliceState => {
          let selectorResults;
          if (Array.isArray(selectors)) {
            selectorResults = selectors.map((selector, index) => selector(sliceState, props[index]))
            return of((selectorResults.some(result => typeof result === 'undefined'))
              ? undefined as U
              : projection ? projection(selectorResults, projectionProps) : selectorResults)
          } else {
            selectorResults = selectors && selectors(sliceState, props);
            return of((typeof selectorResults === 'undefined')
              ? undefined as U
              : projection ? projection(selectorResults, projectionProps) : selectorResults)
          }
        })
      );
    };
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
        selectorResults = selectors && await selectors(sliceState, props);
        return (typeof selectorResults === 'undefined')
          ? undefined as U
          : projection ? projection(selectorResults, projectionProps) : selectorResults;
      }
    };

    return fn;
  };
}
