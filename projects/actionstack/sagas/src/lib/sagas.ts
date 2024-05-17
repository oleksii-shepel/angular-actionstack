import { action } from '@actioncrew/actionstack';
import { call, cancelled } from 'redux-saga/effects';
import { Action } from '@actioncrew/actionstack';
import { stdChannel, runSaga, Task, Saga } from 'redux-saga';

const sagasMiddleware = () => {
  let activeSagas = new Map();
  let channel = stdChannel();
  let context = {};

  const sagaMiddleware = ({ dispatch, getState }: any) => (next: any) => async (action: Action<any>) => {
    // Proceed to the next action
    const result = await next(action);

    channel.put(action);

    if (action.type === 'ADD_SAGAS' || action.type === 'REMOVE_SAGAS') {
      if (action.type === 'ADD_SAGAS') {
        action.payload.sagas.forEach((saga: Saga) => {
          if (!activeSagas.has(saga)) {
            const task: Task = sagaMiddleware.run(function*(): Generator<any, void, any> {
              while (true) {
                try {
                  yield call(saga);
                } catch (e) {
                  if (yield cancelled()) {
                    break;
                  }
                }
              }
            });
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

sagasMiddleware.signature = "u.p.l.2.y.m.b.1.d.7";

export const sagas = sagasMiddleware();

export const addSagas = action('ADD_SAGAS', (...sagas: any[]) => ({sagas}));
export const removeSagas = action('REMOVE_SAGAS', (...sagas: any[]) => ({sagas}));