import { Component, Inject, OnDestroy } from "@angular/core";
import { EnhancedStore, createAction, createSelector } from "actionstack";
import { pingEpic, pingEpic2, pingEpic3, pingEpic4, pingEpic5, pingEpic6 } from "./app.module";


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnDestroy {
  title = 'Tour of Heroes';

  constructor(@Inject('Store') private store: EnhancedStore) {
    store.enable({}, pingEpic, pingEpic2, pingEpic3, pingEpic4, pingEpic5, pingEpic6);
    let selector = createSelector((state, props) => state, (state, props) => state);
    store.select(selector({}, {})).subscribe((value) => {
      console.log(value);
    });
    //store.subscribe(async (state, props) => console.log(state, props));
    store.dispatch({type: 'PING'});
    store.dispatch({type: 'PING'});

    let action = createAction('PONG', (...args: any[]) => async (dispatch, getState) => new Promise(resolve => setTimeout(() => resolve(1), 2000)));
    store.dispatch(action());

    let action2 = createAction('PONG2', (...args: any[]) => async (dispatch, getState) => 1);
    store.dispatch(action2());
  }

  ngOnDestroy(): void {
    this.store.disable(pingEpic, pingEpic2, pingEpic3, pingEpic4, pingEpic5, pingEpic6);
  }
}
