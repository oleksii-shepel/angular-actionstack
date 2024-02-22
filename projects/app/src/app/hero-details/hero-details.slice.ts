import { Action, createAction, createSelector } from "actionstack";
import { firstValueFrom } from "rxjs";
import { Hero } from "../hero";

export const slice = "hero-details";

export const loadHeroRequest = createAction('LOAD_HERO_REQUEST');
export const loadHeroSuccess = createAction('LOAD_HERO_SUCCESS', (hero: Hero) => ({ hero }));
export const loadHeroFailure = createAction('LOAD_HERO_FAILURE', (error: Error) => ({ error }));

export const loadHero = createAction((id: number) => async (dispatch: Function, getState: Function, dependencies: any) => {
  dispatch(loadHeroRequest(id));
  try {
    const heroService = dependencies[slice].heroService;
    const hero = await firstValueFrom(heroService.getHero(id));
    dispatch(loadHeroSuccess(hero));
  } catch (error) {
    dispatch(loadHeroFailure(error));
  }
});

const initialState = { hero: undefined, loading: false, error: null };

export const reducer = (state = initialState, action: Action<any>) => {
  switch (action.type) {
    case loadHeroRequest.type:
      return { ...state, loading: true };
    case loadHeroSuccess.type:
      return { ...state, loading: false, hero: action.payload };
    case loadHeroFailure.type:
      return { ...state, loading: false, error: action.payload };
    default:
      return state;
  }
};

export const heroSelector = createSelector(state => state[slice].hero);
