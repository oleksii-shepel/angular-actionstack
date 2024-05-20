import { Action, action } from '@actioncrew/actionstack';
import { runSaga, Saga, SagaMiddlewareOptions, stdChannel, Task } from 'redux-saga';

export const createSagasMiddleware = ({
    context = {},
    sagaMonitor = undefined,
    onError = undefined,
    effectMiddlewares = [],
    channel = stdChannel()
  } : SagaMiddlewareOptions) => {
  let activeSagas = new Map();

  const sagaMiddleware = ({ dispatch, getState }: any) => (next: any) => async (action: Action<any>) => {
    // Proceed to the next action
    const result = await next(action);

    channel.put(action);

    if (action.type === 'ADD_SAGAS' || action.type === 'REMOVE_SAGAS') {
      if (action.type === 'ADD_SAGAS') {
        action.payload.sagas.forEach((saga: Saga) => {
          if (!activeSagas.has(saga)) {
            const task: Task = sagaMiddleware.run(saga); // Call saga only once
            activeSagas.set(saga, task);
          }
        });
      } else if (action.type === 'REMOVE_SAGAS') {
        action.payload.sagas.forEach((saga: any) => {
          const task = activeSagas.get(saga);
          if (task) {
            task.cancel();
            activeSagas.delete(saga);
          }
        });
      }
    }

    return result;
  };

  sagaMiddleware.run = (saga: Saga, ...args: any[]) => {
    if (typeof saga !== 'function') {
      throw new Error('saga argument must be a Generator function!');
    }
    return runSaga({ context, channel }, saga, ...args);
  };

  sagaMiddleware.setContext = (props: any) => {
    Object.assign(context, props);
  };

  return sagaMiddleware;
};

createSagasMiddleware.signature = "u.p.l.2.y.m.b.1.d.7";

export const sagas = createSagasMiddleware({});

export const addSagas = action('ADD_SAGAS', (...sagas: any[]) => ({sagas}));
export const removeSagas = action('REMOVE_SAGAS', (...sagas: any[]) => ({sagas}));
