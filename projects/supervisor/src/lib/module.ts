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
            StoreModule.store = initialize ? initialize(module): createStore(module.reducer, supervisor(module));
            StoreModule.modulesFn.forEach(fn => fn());
            return StoreModule.store;
          }
        }
      ]
    };
  }
  static forFeature(module: FeatureModule, initialize?: (store: Store, module: FeatureModule) => void): ModuleWithProviders<StoreModule> {
    if(!StoreModule.store) {
      this.modulesFn.push(() => {
        StoreModule.store.dispatch(actionCreators.loadModule(module));
      });
    }
    return {
      ngModule: StoreModule,
    };
  }
}
