import { Component, Inject } from "@angular/core";
import { Store, createAction } from "actionstack";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'Tour of Heroes';

  constructor(@Inject('Store') store: Store) {
    store.subscribe((state) => console.log(state));
    store.dispatch({type: 'PING'});
    store.dispatch({type: 'PING'});

    let action = createAction('PONG', (...args: any[]) => async (dispatch, getState) => new Promise(resolve => setTimeout(() => resolve(1), 2000)));
    store.dispatch(action());

    let action2 = createAction('PONG2', (...args: any[]) => async (dispatch, getState) => 1);
    store.dispatch(action2());

  }
}
