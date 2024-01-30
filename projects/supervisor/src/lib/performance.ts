import { Action } from "./types";

export const performance = () => (next: Function) => (action: Action<any>) => {
  const actionLabel = `action-processing-duration-${action.type.toLowerCase()}`;
  console.time(actionLabel);
  try {
    return next(action);
  } finally {
    console.timeEnd(actionLabel);
  }
}
