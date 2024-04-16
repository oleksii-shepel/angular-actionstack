import { Action, action, effect, featureSelector, selector } from "@actioncrew/actionstack";
import { map } from "rxjs";
import { Hero } from "../hero";

export const slice = "heroes";

export const getHeroesRequest = action("GET_HEROES_REQUEST", (heroes: Hero[]) => ({heroes}));
export const getHeroesSuccess = action("GET_HEROES_SUCCESS", (heroes: Hero[]) => ({heroes}));

export const loadHeroes = effect(getHeroesRequest.type, (action, state, { heroService }: any) => {
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

export const feature = featureSelector(slice);
export const selectHeroes = selector(feature, state => state.heroes);
