import { ModuleWithProviders, NgModule } from "@angular/core";
import { Store, createStore } from "redux-replica";
import { loadModule, supervisor } from "./supervisor";
import { FeatureModule, MainModule } from "./types";

@NgModule({})
export class StoreModule {
  static store: any = undefined;
  static forRoot(module: MainModule, initialize?: (module: MainModule) => Store): ModuleWithProviders<StoreModule> {
    return {
      ngModule: StoreModule,
      providers: [
        {
          provide: 'Store',
          useFactory: () => (StoreModule.store = StoreModule.store ?? (initialize ? initialize(module): createStore(module.reducer, supervisor(module))), StoreModule.store)
        }
      ]
    };
  }
  static forFeature(module: FeatureModule, initialize?: (store: Store, module: FeatureModule) => void): ModuleWithProviders<StoreModule> {
    if(!StoreModule.store) {
      throw new Error('Store is not initialized. Have you forgot to call forRoot method?');
    }
    initialize? initialize(StoreModule.store, module) : loadModule(StoreModule.store, module);
    return {
      ngModule: StoreModule,
    };
  }
}
