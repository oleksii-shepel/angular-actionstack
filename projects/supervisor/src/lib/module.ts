import { ModuleWithProviders, NgModule } from "@angular/core";
import logger from "redux-logger";
import { applyMiddleware, createStore } from "./supervisor";
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
              StoreModule.store = createStore(module, applyMiddleware(logger));
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
