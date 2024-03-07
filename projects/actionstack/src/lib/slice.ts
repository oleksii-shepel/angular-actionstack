import { ElementRef, Injectable, OnDestroy } from "@angular/core";
import { StoreModule } from "./module";
import { Store } from "./store";
import { Action, AnyFn, MemoizedFn, Reducer, SideEffect } from "./types";

export interface SliceOptions {
  slice?: string;
  reducer?: Reducer;
  effects?: (SideEffect | any)[];
  dependencies?: any;
  strategy?: "persistent" | "temporary";
}

@Injectable()
export class Slice implements OnDestroy {
  private _opts: SliceOptions;

  constructor(private store: Store, private elRef: ElementRef) {
    this._opts = {
      slice: elRef.nativeElement.localName,
      reducer: (state: any = {}, action: Action<any>) => state,
      effects: [],
      dependencies: {},
      strategy: "persistent"
    };
  }

  setup(opts: SliceOptions): void {
    this._opts = Object.assign(this._opts, opts);
    opts.effects && opts.effects.length && this.store.extend(...opts.effects as any);
    opts.slice && opts.reducer && this.store.loadModule({slice: opts.slice, dependencies: opts.dependencies, reducer: opts.reducer}, StoreModule.injector);
  }

  dispatch(action: Action<any>): void {
    this.store.dispatch(action);
  }

  select(selector: Promise<MemoizedFn<any>> | AnyFn, defaultValue?: any): any {
    return this.store.select(selector, defaultValue);
  }

  ngOnDestroy(): void {
    this._opts.effects && this._opts.effects.length && this.store.revoke(...this._opts.effects);
    this._opts.slice && this._opts.reducer && this.store.unloadModule({slice: this._opts.slice, reducer: this._opts.reducer}, this._opts.strategy === "temporary" ? true : false);
  }
}
