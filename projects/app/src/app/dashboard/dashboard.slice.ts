import { createAction, createSelector } from "actionstack";
import { firstValueFrom } from 'rxjs';
import { Hero } from "../hero";

export const slice = "dashboard";

export const loadHeroesRequest = createAction('LOAD_HEROES_REQUEST');
export const loadHeroesSuccess = createAction('LOAD_HEROES_SUCCESS', (heroes: Hero[]) => ({ heroes }));
export const loadHeroesFailure = createAction('LOAD_HEROES_FAILURE', (error: Error) => ({ error }));

export const loadHeroes = createAction(() => async (dispatch: Function, getState: Function, dependencies: any) => {
  dispatch(loadHeroesRequest());
  try {
    const heroService = dependencies[slice].heroService;
    const heroes = await firstValueFrom(heroService.getHeroes());
    dispatch(loadHeroesSuccess(heroes));
  } catch (error) {
    dispatch(loadHeroesFailure(error));
  }
});

const initialState = { heroes: undefined, loading: false, error: null };

export function reducer(state = initialState, action: any): any {
  switch (action.type) {
    case loadHeroesRequest.type:
      return { ...state, loading: true };
    case loadHeroesSuccess.type:
      return { ...state, loading: false, heroes: action.payload.heroes };
    case loadHeroesFailure.type:
      return { ...state, loading: false, error: action.payload.error };
    default:
      return state;
  }
}

export const selectHeroes = createSelector(state => state[slice].heroes);
export const selectTopHeroes = createSelector(selectHeroes, (heroes: Hero[]) => heroes ? heroes.slice(1, 5) : []);
