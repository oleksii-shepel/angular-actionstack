import { Action, createAction, createEffect, createSelector } from "actionstack";
import { map } from "rxjs";
import { Hero } from "../hero";

export const slice = "heroes";

export const getHeroesRequest = createAction("GET_HEROES_REQUEST", (heroes: Hero[]) => ({heroes}));
export const getHeroesSuccess = createAction("GET_HEROES_SUCCESS", (heroes: Hero[]) => ({heroes}));

export const loadHeroes = createEffect(getHeroesRequest.type, (action, state, { heroService }) => {
  return heroService.getHeroes().pipe(map(heroes => getHeroesSuccess(heroes)));
});

const initialState = {
  heroes: [],
};

// Define the reducer
export function reducer(state = initialState, action: Action<any>) {
  switch (action.type) {
    case getHeroesRequest.type:
    case getHeroesSuccess.type:
      return {
        ...state,
        heroes: action.payload.heroes
      };
    default:
      return state;
  }
}

export const featureSelector = createSelector<typeof initialState>(state => state[slice]);
export const selectHeroes = createSelector(featureSelector(), state => state.heroes);
