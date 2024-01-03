import { Action, AnyFn, Middleware, Reducer } from "redux-replica";
import { BehaviorSubject, Observable, Observer, ReplaySubject, Subscription, merge, of } from "rxjs";

import { concatMap, mergeMap } from 'rxjs/operators';

type Saga = (action: any) => Generator<any>;

// export function runSaga(saga: Saga) {
//   sagaMiddleware.run(saga);
// }

const runSagasSequentially = (sagas: Saga[]) => concatMap((action: any) =>
  sagas.reduce(
    (acc: Observable<any>, saga: Saga) => acc.pipe(concatMap(() => saga(action))),
    of(action)
  )
);

const runSagasInParallel = (sagas: Saga[]) => mergeMap((action: any) =>
  merge(...sagas.map((saga: Saga) => saga(action)))
);

type Epic = (action: any) => Observable<any>;

const runEpicsSequentially = (epics: Epic[]) => concatMap((action: any) =>
  epics.reduce(
    (acc: Observable<any>, epic: Epic) => acc.pipe(concatMap(() => epic(action))),
    of(action)
  )
);

const runEpicsInParallel = (epics: Epic[]) => mergeMap((action: any) =>
  epics.map((epic: Epic) => epic(action))
);


export type SideEffect = (action: any) => Observable<any>;

const runSideEffectsSequentially = (sideEffects: SideEffect[]) => concatMap((action: any) =>
  sideEffects.reduce(
    (acc: Observable<any>, sideEffect: SideEffect) => acc.pipe(concatMap(() => sideEffect(action))),
    of(action)
  )
);

const runSideEffectsInParallel = (sideEffects: SideEffect[]) => mergeMap((action: any) =>
  sideEffects.map((sideEffect: SideEffect) => sideEffect(action))
);

function isGenerator(fn: Function) {
  return fn.constructor.name === 'GeneratorFunction';
}

function isEpic(fn: Function) {
  return fn.length === 2;
}


// Store enhancer
const createStoreWithSideEffects = (mode: string, sideEffects: SideEffect[], createStore: Function) => (...args: any[]) => {
  const store = createStore.apply(null, args);
  const runSideEffects = mode === 'sequential' ? runSideEffectsSequentially : runSideEffectsInParallel;

  return store;
};
// Choose the mode based on your needs
//const runSideEffects = mode === 'sequential' ? runSideEffectsSequentially : runSideEffectsInParallel;

// const subscription = store.actionStream.pipe(
//   concatMap(action => from(store.pipeline.transformers(action))),
//   concatMap(action => store.pipeline.processors(action)),
//   tap(() => store.isDispatching = true),
//   scan((state, action: any) => store.pipeline.reducer(state, action), store.currentState.value),
//   tap(() => store.isDispatching = false),
//   concatMap((state: any) => from(store.currentState.next(state))),
//   runSideEffects(sideEffects), // Run the side effects
// ).subscribe();
// export interface SideEffect {
//   run(): void;
// }

export interface FeatureModule {
  slice: string;
  reducer: Reducer;
  effects: SideEffect[];
}

export interface MainModule {
  middlewares: Middleware[];
  reducer: Reducer;
  effects: SideEffect[];
}

export interface Store {
  dispatch: (action: Action<any>) => any;
  getState: () => any;
  addReducer: (featureKey: string, reducer: Reducer) => void;
  subscribe: (next?: AnyFn | Observer<any>, error?: AnyFn, complete?: AnyFn) => Subscription;
}


export interface EnhancedStore {
  dispatch: (action: Action<any>) => any;
  getState: () => any;
  addReducer: (featureKey: string, reducer: Reducer) => void;
  subscribe: (next?: AnyFn | Observer<any>, error?: AnyFn, complete?: AnyFn) => Subscription;
  subscription: Subscription;
  pipeline: {
    middlewares: Middleware[];
    reducer: Reducer;
    effects: SideEffect[];
  };
  mainModule: MainModule;
  modules: FeatureModule[];
  actionStream: ReplaySubject<Observable<Action<any>>>;
  currentState: BehaviorSubject<any>;
  isDispatching: boolean;
}


export type StoreCreator = (reducer: Reducer, preloadedState?: any, enhancer?: StoreEnhancer) => Store;
export type StoreEnhancer = (next: StoreCreator) => StoreCreator;
