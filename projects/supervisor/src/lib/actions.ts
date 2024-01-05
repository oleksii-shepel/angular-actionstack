import { Action } from "redux-replica";
import { Observable, catchError, concat, concatMap, from, of } from "rxjs";

export function createAction<T>(
  type: string,
  operation?: (...args: any[]) => (dispatch: Function, getState?: Function) => T | Promise<T> | Observable<T>
) {
  return (...args: any[]) => (dispatch: Function, getState?: Function): Observable<Action<T>> => {
    // If no operation is provided or the operation is synchronous, create an Observable of a simple action
    if (!operation) {
      const action = of({ type, payload: args.length === 1 ? args[0] : args });
      return action as Observable<Action<T>>;
    }

    // Execute the operation and handle the result
    const operationResult = operation(...args)(dispatch, getState);

    // If the operation is asynchronous, create an Observable of the request action
    if (operationResult instanceof Promise || operationResult instanceof Observable) {
      const requestAction = of({ type: `${type}_REQUEST` });

      // Convert the operation result to an Observable if it's not already one
      let resultObservable: Observable<T>;
      if (operationResult instanceof Promise) {
        resultObservable = from(operationResult);
      } else {
        resultObservable = operationResult;
      }

      // Map the result to an Observable of Action<T>
      const actionObservable = resultObservable.pipe(
        concatMap(result => of({
          type: `${type}_SUCCESS`,
          payload: result
        })),
        catchError(error => of({
          type: `${type}_FAILURE`,
          error: true,
          payload: error
        }))
      );

      // Combine the request action with the action Observable
      return concat(requestAction, actionObservable);
    }

    // If the operation is synchronous, create an Observable of a simple action
    const action = of({ type, payload: operationResult });
    return action as Observable<Action<T>>;
  };
}
