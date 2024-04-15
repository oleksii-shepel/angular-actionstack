import { ElementRef, Injectable, OnDestroy, inject } from "@angular/core";
import { Observable, Subscription } from "rxjs";
import { StoreModule } from "./module";
import { Store } from "./store";
import { Action, Reducer, SideEffect, SliceStrategy } from "./types";


/**
 * Interface defining configuration options for a Slice.
 */
export interface SliceOptions {
  slice?: string;
  reducer?: Reducer;
  effects?: (SideEffect | any)[];
  dependencies?: any;
  strategy?: SliceStrategy;
}

/**
 * A class representing a slice of state within an Actionstack application.
 * A Slice instance provides methods for interacting with the Actionstack store to manage the state for a specific part of the application.
 *
 * @see {@link StoreModule} - for registering the Slice with the Actionstack store.
 * @see {@link Store} - for interacting with the global Actionstack state.
 * @see {@link Action} - for representing actions that can be dispatched to update the state.
 * @see {@link Reducer} - for defining how the state is updated in response to an action.
 * @see {@link SideEffect} - for handling side effects triggered by actions.
 */
@Injectable()
export class Slice implements OnDestroy {
  private opts: SliceOptions;
  private subscription = Subscription.EMPTY;
  private elRef!: ElementRef<HTMLElement>;

  /**
   * @param store - The Actionstack store instance.
   *
   * @throws Error if ElementRef injection fails, indicating the Slice is used in the wrong context.
   */
  constructor(private store: Store) {
    try {
      this.elRef = inject(ElementRef);
    } catch {
      throw new Error('Injection failed. The Slice is provided in the module providers list, but it is suitable to use within component provider list.')
    }

    this.opts = {
      slice: this.elRef.nativeElement.localName,
      reducer: (state: any = {}, action: Action<any>) => state,
      effects: [],
      dependencies: {},
      strategy: "persistent"
    };
  }

  setup(opts: SliceOptions): void {
    this.opts = Object.assign(this.opts, opts);
    this.opts.effects && this.opts.effects.length && (this.subscription = this.store.extend(...this.opts.effects as any).subscribe());
    this.opts.slice && this.opts.reducer && this.store.loadModule({
      slice: this.opts.slice,
      dependencies: this.opts.dependencies,
      reducer: this.opts.reducer
    }, StoreModule.injector);
  }

  dispatch(action: Action<any>): void {
    this.store.dispatch(action);
  }

  select<U = any, T = any>(selector: (obs: Observable<T>) => Observable<U>, defaultValue?: any): any {
    return this.store.select(selector, defaultValue);
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.opts.slice && this.opts.reducer && this.store.unloadModule({slice: this.opts.slice, reducer: this.opts.reducer}, this.opts.strategy === "temporary" ? true : false);
  }
}
