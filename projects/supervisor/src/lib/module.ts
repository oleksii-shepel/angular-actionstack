import { ModuleWithProviders, NgModule } from "@angular/core";
import { Store, createStore } from "redux-replica";
import { actionCreators, supervisor } from "./supervisor";
import { FeatureModule, MainModule } from "./types";

@NgModule({})
export class StoreModule {
  static store: any = undefined;
  static modulesFn: Function[] = [];

  static forRoot(module: MainModule, initialize?: (module: MainModule) => Store): ModuleWithProviders<StoreModule> {
    return {
      ngModule: StoreModule,
      providers: [
        {
          provide: 'Store',
          useFactory: () => {
            if (!StoreModule.store) {
              StoreModule.store = createStore(module.reducer, supervisor(module));
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
      StoreModule.store.dispatch(actionCreators.loadModule(module));
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
