import { Action } from '@actioncrew/actionstack';
import { stdChannel, runSaga, Task, Saga } from 'redux-saga';

// Define the sagaMiddleware function as a string
const sagaMiddlewareCode = `
return function (_temp, runSaga, channel) {
  var _ref = _temp === void 0 ? {} : _temp,
    _ref$context = _ref.context,
    context = _ref$context === void 0 ? {} : _ref$context,
    _ref$channel = _ref.channel,
    channel = _ref$channel === void 0 ? channel() : _ref$channel,
    options = Object.assign({}, _ref, {
      context: context,
      channel: channel
    });

  var sagaMiddleware = (middlewareAPI) => {
    var getState = middlewareAPI.getState,
      dispatch = middlewareAPI.dispatch;

    return (next) => {
      return async (action) => {
        var result = await next(action); // hit reducers
        channel.put(action);
        return result;
      };
    };
  };

  sagaMiddleware.run = (saga, ...args) => {
    if (typeof saga !== 'function') {
      throw new Error('saga argument must be a Generator function!');
    }
    return runSaga({ ..._temp, context, channel }, saga, ...args);
  };

  sagaMiddleware.setContext = (props) => {
    Object.assign(context, props);
  };

  sagaMiddleware.signature = "u.p.l.2.y.m.b.1.d.7";

  return sagaMiddleware;
}
`;

// Create a new Function from the sagaMiddleware function string
export const sagaMiddleware = new Function(
  '_temp',
  'runSaga',
  'channel',
  sagaMiddlewareCode
)()({}, runSaga, stdChannel) as {
	(): (next: Function) => (action: Action<any>) => Promise<any>;
	run: (saga: Saga, ...args: any[]) => Task;
  setContext: (props: any) => void;
  signature: string;
};
