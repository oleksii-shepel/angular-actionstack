import { Action, createAction, createEffect, createSelector } from "actionstack";
import { map } from "rxjs";
import { Hero } from "../hero";

export const slice = "heroes";

export const setHeroes = createAction("SET_HEROES", (heroes: Hero[]) => ({heroes}));
export const setHeroesSuccess = createAction("SET_HEROES_SUCCESS", (heroes: Hero[]) => ({heroes}));

export const loadHeroes$ = createEffect(setHeroes.type, (action, state, { heroService }) => {
  return heroService.getHeroes().pipe(map(heroes => setHeroesSuccess(heroes)));
});

const initialState = {
  heroes: [],
};

// Define the reducer
export function reducer(state = initialState, action: Action<any>) {
  switch (action.type) {
    case setHeroes.type:
    case setHeroesSuccess.type:
      return {
        ...state,
        heroes: action.payload.heroes
      };
    default:
      return state;
  }
}

export const selectHeroes = createSelector((state) => state[slice].heroes);
