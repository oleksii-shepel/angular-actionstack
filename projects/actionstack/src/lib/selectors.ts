import { CustomObservable, Subscribable } from "./observable";
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
 * @returns A function that takes an Subscribable of the entire state object and returns an Subscribable of the selected feature data.
 */
function createFeatureSelector<U = any, T = any> (
  slice: keyof T | string[]
): (state$: Subscribable<T>) => Subscribable<U> {
  let lastValue: U | undefined;
  return (source: Subscribable<T>) => new CustomObservable<U>(subscriber => {
    subscriber.next(lastValue!);
    const subscription = source.subscribe((state: T) => {
      const selectedValue = (Array.isArray(slice)
      ? slice.reduce((acc, key) => (acc && Array.isArray(acc) ? acc[parseInt(key)] : (acc as any)[key]) || undefined, state)
      : state && state[slice]) as U;
      if(lastValue !== selectedValue) {
        lastValue = selectedValue;
        subscriber.next(lastValue);
      }
    });

    return () => subscription.unsubscribe();
  });
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
function createSelector<U = any, T = any>(
  featureSelector$: ((state: Subscribable<T>) => Subscribable<U>) | "@global",
  selectors: SelectorFunction | SelectorFunction[],
  projectionOrOptions?: ProjectionFunction
): (props?: any[] | any, projectionProps?: any) => (store: Subscribable<T>) => Subscribable<U> {

  const isSelectorArray = Array.isArray(selectors);
  const projection = typeof projectionOrOptions === "function" ? projectionOrOptions : undefined;

  if (isSelectorArray && !projection) {
    throw new Error("Invalid parameters: When 'selectors' is an array, 'projection' function should be provided.");
  }

  return (props?: any[] | any, projectionProps?: any) => {
    if(Array.isArray(props) && Array.isArray(selectors) && props.length !== selectors.length) {
      throw new Error('Not all selectors are parameterized. The number of props does not match the number of selectors.');
    }

    return (state$: Subscribable<T>) => {
      return new CustomObservable(observer => {
        let sliceState$: Subscribable<U>;
        if (featureSelector$ === "@global") {
          sliceState$ = state$ as any;
        } else {
          sliceState$ = (featureSelector$ as Function)(state$);
        }

        const subscription = sliceState$.subscribe(sliceState => {
          if (sliceState === undefined) {
            observer.next(sliceState);
            return;
          }

          let selectorResults: U[] | U;

          if (Array.isArray(selectors)) {
            selectorResults = selectors.map((selector, index) => selector(sliceState, props[index]))

            if (selectorResults.some(result => result === undefined)) {
              observer.next(undefined as U);
              return;
            }

            observer.next(projection ? projection(selectorResults, projectionProps) : selectorResults);
          } else {
            selectorResults = selectors && selectors(sliceState, props);

            if (selectorResults === undefined) {
              observer.next(undefined as U);
              return;
            }

            observer.next(projection ? projection(projectionProps) : selectorResults);
          }
        });

        return () => subscription.unsubscribe();
      });
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
 *                    * A single selector function that takes the state slice and optional props as arguments and can return a Promise or Subscribable.
 *                    * An array of selector functions, each taking the state slice and a corresponding prop (from props argument) as arguments and can return a Promise or Subscribable.
 * @param projectionOrOptions - This can be either:
 *                             * A projection function that takes an array of results from the selector(s) and optional projection props as arguments and returns the final result.
 *                             * An options object (not currently implemented).
 * @returns A function that takes optional props and projection props as arguments and returns another function that takes the state observable as input and returns an observable of the projected data.
 */
function createSelectorAsync<U = any, T = any>(
  featureSelector$: ((state: Subscribable<T>) => Subscribable<U>) | "@global",
  selectors: SelectorFunction | SelectorFunction[],
  projectionOrOptions?: ProjectionFunction
): (props?: any[] | any, projectionProps?: any) => (store: Subscribable<T>) => Subscribable<U> {

  const isSelectorArray = Array.isArray(selectors);
  const projection = typeof projectionOrOptions === "function" ? projectionOrOptions : undefined;

  if (isSelectorArray && !projection) {
    throw new Error("Invalid parameters: When 'selectors' is an array, 'projection' function should be provided.");
  }

  return (props?: any[] | any, projectionProps?: any) => {
    if(Array.isArray(props) && Array.isArray(selectors) && props.length !== selectors.length) {
      throw new Error('Not all selectors are parameterized. The number of props does not match the number of selectors.');
    }

    return (state$: Subscribable<T>) => {
      const sliceState$ = new CustomObservable<U>((observer) => {
        let unsubscribed = false;
        let didCancel = false;

        const runSelectors = async (sliceState: any) => {
          if (sliceState === undefined) { return observer.next(undefined as any); }

          let selectorResults: U[] | U;

          if (Array.isArray(selectors)) {
            try {
              selectorResults = await Promise.all(
                selectors.map(async (selector, index) => {
                  if (unsubscribed || didCancel) return;
                  return selector(sliceState, props ? props[index] : undefined);
                })
              );

              if (unsubscribed || didCancel) return;

              const isUndefined = (selectorResults as U[]).some(result => result === undefined);

              observer.next(
                isUndefined
                  ? undefined
                  : projection
                  ? projection(selectorResults as U[], projectionProps)
                  : selectorResults
              );
            } catch (error) {
              if (!unsubscribed && !didCancel) {
                observer.error(error);
              }
            }
          } else {
            try {
              selectorResults = await selectors(sliceState, props);

              if (unsubscribed || didCancel) return;

              observer.next(
                selectorResults === undefined
                  ? undefined
                  : projection
                  ? projection(selectorResults, projectionProps)
                  : selectorResults
              );
            } catch (error) {
              if (!unsubscribed && !didCancel) {
                observer.error(error);
              }
            }
          }
        };

        const subscription = (featureSelector$ === "@global" ? state$ : (featureSelector$(state$)) as any).subscribe({
          next: (sliceState: any) => runSelectors(sliceState),
          error: (error: any) => {
            if (!unsubscribed && !didCancel) {
              observer.error(error);
            }
          },
          complete: () => {
            if (!unsubscribed && !didCancel) {
              observer.complete();
            }
          }
        });

        return () => {
          unsubscribed = true;
          subscription.unsubscribe();
        };
      });

      return sliceState$;
    };
  };
}
