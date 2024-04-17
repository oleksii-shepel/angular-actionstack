import { Observable, distinctUntilChanged, map, shareReplay } from "rxjs";
import { sequential } from "./lock";
import { ProjectionFunction, SelectorFunction } from "./types";

export {
  createFeatureSelector as featureSelector,
  createSelector as selector,
  createSelectorAsync as selectorAsync
};

/**
 * Creates a selector function that selects a specific feature slice from a larger state object.
 *
 * This function is generic, allowing you to specify the types of the state object (T) and the selected feature data (U).
 *
 * @param slice - This can be either:
 *                 * A string key representing the property name of the feature slice within the state object.
 *                 * An array of strings representing a path of keys to navigate within the state object to reach the desired feature slice.
 * @returns A function that takes an Observable of the entire state object and returns an Observable of the selected feature data.
 */
function createFeatureSelector<U = any, T = any> (
  slice: keyof T | string[]
): (state$: Observable<T>) => Observable<U> {
  return (state$: Observable<T>) => state$.pipe(
    /**
     * Applies the map operator to transform the state object.
     * - Checks if the slice is an array (representing a path of keys).
     *   - If it's an array, uses reduce to navigate through the state object using each key.
     *   - If it's not an array (a single key), retrieves the value of that key from the state object.
     */
    map(state => (Array.isArray(slice))
      ? slice.reduce((acc, key) => (acc && Array.isArray(acc) ? acc[parseInt(key)] : (acc as any)[key]) || undefined, state)
      : state && state[slice]),
    /**
     * Applies the distinctUntilChanged operator to ensure the observable only emits a new value if it's different from the previous value.
     */
    distinctUntilChanged(),
    /**
     * Applies the shareReplay operator to share a single subscription to the state observable and replay the latest value to multiple subscribers.
     * - Options used:
     *   - bufferSize: 1 - Limits the replay buffer to hold only the latest value.
     *   - refCount: false - Keeps the observable running as long as there's at least one subscriber (be cautious, consider using takeUntil to avoid memory leaks).
     */
    shareReplay({bufferSize: 1, refCount: false})
  ) as Observable<U>;
}

/**
 * Creates a selector function for composing smaller selectors and projecting their results.
 *
 * This function is generic, allowing you to specify the types of the state object (T) and the selected feature data (U).
 *
 * @param featureSelector$ - This can be either:
 *                             * A selector function that retrieves a slice of the state based on the entire state object.
 *                             * The string "@global" indicating the entire state object should be used.
 * @param selectors - This can be either:
 *                    * A single selector function that takes the state slice and optional props as arguments.
 *                    * An array of selector functions, each taking the state slice and a corresponding prop (from props argument) as arguments.
 * @param projectionOrOptions - This can be either:
 *                             * A projection function that takes an array of results from the selector(s) and optional projection props as arguments and returns the final result.
 *                             * An options object (not currently implemented).
 * @returns A function that takes optional props and projection props as arguments and returns another function that takes the state observable as input and returns an observable of the projected data.
 */
function createSelector<U = any, T = any> (
  featureSelector$: ((state: Observable<T>) => Observable<U>) | "@global",
  selectors: SelectorFunction | SelectorFunction[],
  projectionOrOptions?: ProjectionFunction
): (props?: any[] | any, projectionProps?: any) => (store: Observable<T>) => Observable<U> {

  // Check if selectors is an array
  const isSelectorArray = Array.isArray(selectors);

  // Extract the projection function if provided
  const projection = typeof projectionOrOptions === "function" ? projectionOrOptions : undefined;

  // Validate arguments when selectors is an array
  if (isSelectorArray && !projection) {
    throw new Error("Invalid parameters: When 'selectors' is an array, 'projection' function should be provided.");
  }

  // Return a function that takes props and projectionProps as arguments
  return (props?: any[] | any, projectionProps?: any) => {

    // Validate prop lengths if using multiple selectors
    if(Array.isArray(props) && Array.isArray(selectors) && props.length !== selectors.length) {
      throw new Error('Not all selectors are parameterized. The number of props does not match the number of selectors.');
    }

    // Return a function that takes the state observable as input
    return (state$: Observable<T>) => {

      // Apply the feature selector or use the entire state
      const sliceState$ = (featureSelector$ === "@global" ? state$ : (featureSelector$ as Function)(state$)).pipe(

        // Map over the slice state
        map(sliceState => {

          // Handle undefined slice state
          if (sliceState === undefined) { return sliceState; }

          let selectorResults: U[] | U;

          // Handle array of selectors
          if (Array.isArray(selectors)) {
            // Apply each selector to the slice state and corresponding prop
            selectorResults = selectors.map((selector, index) => selector(sliceState, props[index]))

            // Check if any selector result is undefined
            return (selectorResults.some(result => result === undefined))
              ? undefined as U  // Return undefined if any selector result is undefined
              : projection ? projection(selectorResults, projectionProps) : selectorResults; // Apply projection or return results

          } else {
            // Handle single selector
            selectorResults = selectors && selectors(sliceState, props);

            // Check if single selector result is undefined
            return (selectorResults === undefined)
              ? undefined as U  // Return undefined if single selector result is undefined
              : projection ? projection(projectionProps) : selectorResults; // Apply projection or return result
          }
        })
      );

      // Return the observable with projected or selected data
      return sliceState$;
    };
  };
}

/**
 * Creates a selector function for composing smaller selectors and projecting their results, handling asynchronous operations within selectors.
 *
 * This function is similar to `createSelector` but allows asynchronous operations within the selector functions.
 *
 * @param featureSelector$ - This can be either:
 *                             * A selector function that retrieves a slice of the state based on the entire state object.
 *                             * The string "@global" indicating the entire state object should be used.
 * @param selectors - This can be either:
 *                    * A single selector function that takes the state slice and optional props as arguments and can return a Promise or Observable.
 *                    * An array of selector functions, each taking the state slice and a corresponding prop (from props argument) as arguments and can return a Promise or Observable.
 * @param projectionOrOptions - This can be either:
 *                             * A projection function that takes an array of results from the selector(s) and optional projection props as arguments and returns the final result.
 *                             * An options object (not currently implemented).
 * @returns A function that takes optional props and projection props as arguments and returns another function that takes the state observable as input and returns an observable of the projected data.
 */
function createSelectorAsync<U = any, T = any> (
  featureSelector$: ((state: Observable<T>) => Observable<U>) | "@global",
  selectors: SelectorFunction | SelectorFunction[],
  projectionOrOptions?: ProjectionFunction
): (props?: any[] | any, projectionProps?: any) => (store: Observable<T>) => Observable<U> {

  // Check if selectors is an array
  const isSelectorArray = Array.isArray(selectors);

  // Extract the projection function if provided
  const projection = typeof projectionOrOptions === "function" ? projectionOrOptions : undefined;

  // Validate arguments when selectors is an array
  if (isSelectorArray && !projection) {
    throw new Error("Invalid parameters: When 'selectors' is an array, 'projection' function should be provided.");
  }

  // Return a function that takes props and projectionProps as arguments
  return (props?: any[] | any, projectionProps?: any) => {

    // Validate prop lengths if using multiple selectors
    if(Array.isArray(props) && Array.isArray(selectors) && props.length !== selectors.length) {
      throw new Error('Not all selectors are parameterized. The number of props does not match the number of selectors.');
    }

    // Return a function that takes the state observable as input
    return (state$: Observable<T>) => {

      // Apply the feature selector or use the entire state
      const sliceState$ = (featureSelector$ === "@global" ? state$ : (featureSelector$ as Function)(state$)).pipe(

        // Use concatMap to handle asynchronous operations within selectors
        sequential(async sliceState => {

          // Handle undefined slice state
          if (sliceState === undefined) { return sliceState; }

          let selectorResults: U[] | U;

          // Handle array of selectors
          if (Array.isArray(selectors)) {
            // Use Promise.all to wait for all async selectors to resolve
            selectorResults = await Promise.all(selectors.map((selector, index) => selector(sliceState, props[index])));

            // Check if any selector result is undefined
            return (selectorResults.some(result => result === undefined))
              ? undefined as U  // Return undefined if any selector result is undefined
              : projection ? projection(selectorResults, projectionProps) : selectorResults; // Apply projection or return results

          } else {
            // Handle single selector
            // Await the result of the single selector function (can be Promise or Observable)
            selectorResults = await selectors(sliceState, props);

            // Check if single selector result is undefined
            return (selectorResults === undefined)
              ? undefined as U  // Return undefined if single selector result is undefined
              : projection ? projection(selectorResults, projectionProps) : selectorResults; // Apply projection or return result
          }
        })
      );

      // Return the observable with projected or selected data
      return sliceState$;
    };
  };
}
