import { Action, createAction, createEffect, createSelector } from "actionstack";
import { concatMap, of } from "rxjs";
import { Hero } from "../hero";

export const slice = "heroes";

export const setHeroes = createAction("SET_HEROES", (heroes: Hero[]) => ({ heroes }));

export const loadHeroes$ = createEffect(setHeroes.type, (action, state, { heroService }) => {
  return heroService.getHeroes().pipe(
    concatMap(heroes => of(setHeroes(heroes)))
  );
});

const initialState = {
  heroes: [],
};

// Define the reducer
export function reducer(state = initialState, action: Action<any>) {
  switch (action.type) {
    case setHeroes.type:
      return {
        ...state,
        heroes: action.payload.heroes
      };
    default:
      return state;
  }
}

export const selectHeroes = createSelector((state) => state[slice].heroes);
