import { ModuleWithProviders, NgModule } from "@angular/core";
import { createEpicMiddleware } from "redux-observable";
import { applyMiddleware, compose, createStore } from "redux-replica";
import { supervisor } from "./supervisor";
import { EnhancedStore, FeatureModule, MainModule } from "./types";

@NgModule({})
export class StoreModule {
  static store: EnhancedStore | undefined = undefined;
  static modulesFn: Function[] = [];

  static forRoot(module: MainModule): ModuleWithProviders<StoreModule> {
    return {
      ngModule: StoreModule,
      providers: [
        {
          provide: 'Store',
          useFactory: () => {
            if (!StoreModule.store) {
              const enhancer = compose(applyMiddleware(createEpicMiddleware()), supervisor(module));
              StoreModule.store = createStore(module.reducer, enhancer) as EnhancedStore;
              StoreModule.modulesFn.forEach(fn => fn());
            }
            return StoreModule.store;
          }
        }
      ]
    };
  }
  static forFeature(module: FeatureModule): ModuleWithProviders<StoreModule> {
    const loadFeatureModule = () => {
      StoreModule.store!.loadModule(module);
    };

    if (!StoreModule.store) {
      StoreModule.modulesFn.push(loadFeatureModule);
    } else {
      loadFeatureModule();
    }

    return {
      ngModule: StoreModule,
    };
  }
}
