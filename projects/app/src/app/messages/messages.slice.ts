import { Action, createAction, createSelector } from "actionstack";

export const slice = "messages";

// Define the actions using createAction
export const addMessage = createAction("ADD_MESSAGE", (message: string) => ({ message }));
export const clearMessages = createAction('CLEAR_MESSAGES');

// Define the initial state
const initialState = {
  messages: []
};

export function reducer(state = initialState, action: Action<any>) {
  switch (action.type) {
    case addMessage.type:
      return {
        ...state,
        messages: [...state.messages, action.payload.message]
      };
    case clearMessages.type:
      return {
        ...state,
        messages: []
      };
    default:
      return state;
  }
}

export const selectMessages = createSelector(state => state[slice].messages);
export const selectMessageCount = createSelector(selectMessages, (messages) => messages.length);
