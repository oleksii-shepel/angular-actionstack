import { Action, action, Operation, OperationType } from '@actioncrew/actionstack';
import { runSaga, Saga, SagaMiddlewareOptions, stdChannel, Task } from 'redux-saga';
import { call, cancelled } from 'redux-saga/effects';

export const createSagasMiddleware = ({
    context = {},
    sagaMonitor = undefined,
    onError = undefined,
    effectMiddlewares = [],
    channel = stdChannel()
  } : SagaMiddlewareOptions) => {
  let activeSagas = new Map();
  let middlewareDispatch: any;
  let middlewareGetState: any;

  const customDispatch = ({dispatch, stack }: any) => (saga: Saga) => (action: Action<any>) => {
    const sagaOp = stack.findLast((item: Operation) => item.source === saga);
    const actionWithSource = Object.assign({}, action, {source: sagaOp});
    dispatch(actionWithSource);
  };

  const sagaMiddleware = ({ dispatch, getState, stack }: any) => (next: any) => async (action: Action<any>) => {
    middlewareDispatch = dispatch; middlewareGetState = getState;

    // Proceed to the next action
    const result = await next(action);

    channel.put(action);

    if (action.type === 'ADD_SAGAS' || action.type === 'REMOVE_SAGAS') {
      if (action.type === 'ADD_SAGAS') {
        action.payload.sagas.forEach((saga: Saga) => {
          if (!activeSagas.has(saga)) {
            const op = {operation: OperationType.SAGA, instance: saga};
            stack.push(op);
            const task: Task = sagaMiddleware.run(function*(): Generator<any, void, any> {
              try {
                yield call(saga);
              } catch (error) {
                console.error('Saga error:', error);
              } finally {
                if (yield cancelled()) {
                  stack.pop(op);
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
    return runSaga({ context, channel, dispatch: customDispatch(middlewareDispatch)(saga), getState: middlewareGetState }, saga, ...args);
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
