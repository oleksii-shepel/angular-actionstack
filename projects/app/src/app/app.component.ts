import { Component, Inject } from '@angular/core';
import { Store } from 'redux-replica';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'Tour of Heroes';

  constructor(@Inject('Store') store: Store) {
    store.dispatch({type: 'PING'});
  }
}
