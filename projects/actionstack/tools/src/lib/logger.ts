/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/ban-types */

import differ from 'deep-diff';

interface Dictionary {
  [key: string]: {
    color: string;
    text: string;
  };
}

const dictionary: Dictionary = {
  E: {
    color: '#2196F3',
    text: 'CHANGED:',
  },
  N: {
    color: '#4CAF50',
    text: 'ADDED:',
  },
  D: {
    color: '#F44336',
    text: 'DELETED:',
  },
  A: {
    color: '#2196F3',
    text: 'ARRAY:',
  },
};

export function style(kind: string): string {
  return `color: ${dictionary[kind].color}; font-weight: bold`;
}

export function render(diff: any): any[] {
  const { kind, path, lhs, rhs, index, item } = diff;

  switch (kind) {
    case 'E':
      return [path.join('.'), lhs, '→', rhs];
    case 'N':
      return [path.join('.'), rhs];
    case 'D':
      return [path.join('.')];
    case 'A':
      return [`${path.join('.')}[${index}]`, item];
    default:
      return [];
  }
}

export function diffLogger(prevState: any, newState: any, logger: any, isCollapsed: boolean): void {
  const diff = differ(prevState, newState);

  try {
    if (isCollapsed) {
      logger.groupCollapsed('diff');
    } else {
      logger.group('diff');
    }
  } catch (e) {
    logger.log('diff');
  }

  if (diff) {
    diff.forEach((elem: any) => {
      const { kind } = elem;
      const output = render(elem);

      logger.log(`%c ${dictionary[kind].text}`, style(kind), ...output);
    });
  } else {
    logger.log('—— no diff ——');
  }

  try {
    logger.groupEnd();
  } catch (e) {
    logger.log('—— diff end —— ');
  }
}

export function getLogLevel(level: string | Function | object & any, action: object, payload: any[], type: string): string {
  switch (typeof level) {
    case 'object':
      return typeof level[type] === 'function' ? level[type](...payload) : level[type];
    case 'function':
      return level(action);
    default:
      return level;
  }
}

export function defaultTitleFormatter(options: any): Function {
  const { timestamp, duration } = options;

  return (action: any, time: any, took: any): string => {
    const parts = ['action'];

    parts.push(`%c${String(action.type)}`);
    if (timestamp) parts.push(`%c@ ${time}`);
    if (duration) parts.push(`%c(in ${took.toFixed(2)} ms)`);

    return parts.join(' ');
  };
}

export function printBuffer(buffer: any[], options: any): void {
  const {
    logger,
    actionTransformer,
    titleFormatter = defaultTitleFormatter(options),
    collapsed,
    colors,
    level,
    diff,
  } = options;

  const isUsingDefaultFormatter = typeof options.titleFormatter === 'undefined';

  buffer.forEach((logEntry: any, key: number) => {
    const { started, startedTime, action, prevState, error } = logEntry;
    let { took, nextState } = logEntry;
    const nextEntry = buffer[key + 1];

    if (nextEntry) {
      nextState = nextEntry.prevState;
      took = nextEntry.started - started;
    }

    // Message
    const formattedAction = actionTransformer(action);
    const isCollapsed = typeof collapsed === 'function'
      ? collapsed(() => nextState, action, logEntry)
      : collapsed;

    const formattedTime = formatTime(startedTime);
    const titleCSS = colors.title ? `color: ${colors.title(formattedAction)};` : '';
    const headerCSS = ['color: gray; font-weight: lighter;'];
    headerCSS.push(titleCSS);
    if (options.timestamp) headerCSS.push('color: gray; font-weight: lighter;');
    if (options.duration) headerCSS.push('color: gray; font-weight: lighter;');
    const title = titleFormatter(formattedAction, formattedTime, took);

    // Render
    try {
      if (isCollapsed) {
        if (colors.title && isUsingDefaultFormatter) {
          logger.groupCollapsed(`%c ${title}`, ...headerCSS);
        } else logger.groupCollapsed(title);
      } else if (colors.title && isUsingDefaultFormatter) {
        logger.group(`%c ${title}`, ...headerCSS);
      } else {
        logger.group(title);
      }
    } catch (e) {
      logger.log(title);
    }

    const prevStateLevel = getLogLevel(level, formattedAction, [prevState], 'prevState');
    const actionLevel = getLogLevel(level, formattedAction, [formattedAction], 'action');
    const errorLevel = getLogLevel(level, formattedAction, [error, prevState], 'error');
    const nextStateLevel = getLogLevel(level, formattedAction, [nextState], 'nextState');

    if (prevStateLevel) {
      if (colors.prevState) {
        const styles = `color: ${colors.prevState(prevState)}; font-weight: bold`;

        logger[prevStateLevel]('%c prev state', styles, prevState);
      } else logger[prevStateLevel]('prev state', prevState);
    }

    if (actionLevel) {
      if (colors.action) {
        const styles = `color: ${colors.action(formattedAction)}; font-weight: bold`;

        logger[actionLevel]('%c action    ', styles, formattedAction);
      } else logger[actionLevel]('action    ', formattedAction);
    }

    if (error && errorLevel) {
      if (colors.error) {
        const styles = `color: ${colors.error(error, prevState)}; font-weight: bold;`;

        logger[errorLevel]('%c error     ', styles, error);
      } else logger[errorLevel]('error     ', error);
    }

    if (nextStateLevel) {
      if (colors.nextState) {
        const styles = `color: ${colors.nextState(nextState)}; font-weight: bold`;

        logger[nextStateLevel]('%c next state', styles, nextState);
      } else logger[nextStateLevel]('next state', nextState);
    }

    if (diff) {
      diffLogger(prevState, nextState, logger, isCollapsed);
    }

    try {
      logger.groupEnd();
    } catch (e) {
      logger.log('—— log end ——');
    }
  });
}

export const repeat = (str: string, times: number): string => (new Array(times + 1)).join(str);

export const pad = (num: number, maxLength: number): string => repeat('0', maxLength - num.toString().length) + num;

export const formatTime = (time: Date): string => `${pad(time.getHours(), 2)}:${pad(time.getMinutes(), 2)}:${pad(time.getSeconds(), 2)}.${pad(time.getMilliseconds(), 3)}`;

// Use performance API if it's available in order to get better precision
export const timer =
(typeof performance !== 'undefined' && performance !== null) && typeof performance.now === 'function' ?
  performance :
  Date;

interface LoggerOptions {
  level?: string | Function | object;
  logger?: any;
  logErrors?: boolean;
  collapsed?: any;
  predicate?: any;
  duration?: boolean;
  timestamp?: boolean;
  stateTransformer?: Function;
  actionTransformer?: Function;
  errorTransformer?: Function;
  colors?: {
    title?: Function;
    prevState?: Function;
    action?: Function;
    nextState?: Function;
    error?: Function;
  };
  diff?: boolean;
  diffPredicate?: any;
  transformer?: any;
}

interface LogEntry {
  started: number;
  startedTime: Date;
  prevState: any;
  action: any;
  error?: any;
  took: number;
  nextState: any;
}

/**
 * Options for creating a logger.
 * @interface CreateLoggerOptions
 * @extends LoggerOptions
 */
interface CreateLoggerOptions extends LoggerOptions {
  getState?: Function;
  dispatch?: Function;
}

/**
 * Default logger options.
 * @const {LoggerOptions}
 * @default
 */
const defaults: LoggerOptions = {
  level: 'log',
  logger: console,
  logErrors: true,
  collapsed: undefined,
  predicate: undefined,
  duration: false,
  timestamp: true,
  stateTransformer: (state: any) => state,
  actionTransformer: (action: any) => action,
  errorTransformer: (error: any) => error,
  colors: {
    title: () => 'inherit',
    prevState: () => '#9E9E9E',
    action: () => '#03A9F4',
    nextState: () => '#4CAF50',
    error: () => '#F20404',
  },
  diff: false,
  diffPredicate: undefined,
  transformer: undefined,
};

/**
 * Creates a logger with the provided options.
 * @param {CreateLoggerOptions} [options={}] - Options for creating the logger.
 * @returns {Function} A function that acts as a logger middleware.
 */
const createLogger = (options: CreateLoggerOptions = {}) => {
  const loggerOptions = Object.assign({}, defaults, options);
  let loggerCreator: any = () => (next: any)  => (action: any) => next(action);

  const {
    logger,
    stateTransformer,
    errorTransformer,
    predicate,
    logErrors,
    diffPredicate,
  } = loggerOptions;

  if (logger !== 'undefined') {
    const logBuffer: LogEntry[] = [];

    loggerCreator = ({ getState }: any) => (next: any) => (action: any) => {
      // Exit early if predicate function returns 'false'
      if (typeof predicate === 'function' && !predicate(getState, action)) {
        return next(action);
      }

      const logEntry: LogEntry = {} as any;

      logBuffer.push(logEntry);

      logEntry.started = timer.now();
      logEntry.startedTime = new Date();
      logEntry.prevState = stateTransformer!(getState());
      logEntry.action = action;

      let returnedValue;
      if (logErrors) {
        try {
          returnedValue = next(action);
        } catch (e) {
          logEntry.error = errorTransformer!(e);
        }
      } else {
        returnedValue = next(action);
      }

      logEntry.took = timer.now() - logEntry.started;
      logEntry.nextState = stateTransformer!(getState());

      const diff = loggerOptions.diff && typeof diffPredicate === 'function'
        ? diffPredicate(getState, action)
        : loggerOptions.diff;

      printBuffer(logBuffer, Object.assign({}, loggerOptions, { diff }));
      logBuffer.length = 0;

      if (logEntry.error) throw logEntry.error;
      return returnedValue;
    };
  }

  loggerCreator.signature = '6.q.w.c.i.m.9.n.j.y';
  return loggerCreator;
}

const defaultLogger = createLogger();

export { defaults, defaultLogger as logger };

