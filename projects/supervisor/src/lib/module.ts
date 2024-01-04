import { ModuleWithProviders, NgModule } from "@angular/core";
import { applyMiddleware, compose, createStore } from "redux-replica";
import { loadModule, supervisor } from "./supervisor";
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
              const enhancer = compose(applyMiddleware(...module.middlewares), supervisor(module));
              StoreModule.store = createStore(module.reducer, undefined, enhancer) as EnhancedStore;
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
      loadModule(StoreModule.store!, module);
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
