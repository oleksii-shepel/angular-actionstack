import { Injector, ModuleWithProviders, NgModule } from "@angular/core";
import { asapScheduler } from "rxjs";
import { Store } from "./store";
import { FeatureModule, MainModule } from "./types";

@NgModule({})
export class StoreModule {
  static store: Store | undefined = undefined;
  static modulesFn: Function[] = [];
  static injector: Injector;

  constructor(injector: Injector) {
    StoreModule.injector = injector;
  }

  static forRoot(module: MainModule): ModuleWithProviders<StoreModule> {
    return {
      ngModule: StoreModule,
      providers: [
        {
          provide: Store,
          useFactory: () => {
            if (!StoreModule.store) {
              StoreModule.store = Store.createStore(module) as Store;
            }

            asapScheduler.schedule(() => StoreModule.modulesFn.forEach(fn => fn()));
            return StoreModule.store;
          }
        }
      ]
    };
  }
  static forFeature(module: FeatureModule): ModuleWithProviders<StoreModule> {
    const loadFeatureModule = () => {
      StoreModule.store!.loadModule(module, StoreModule.injector);
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
