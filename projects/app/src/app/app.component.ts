import { Store } from '@actioncrew/actionstack';
import { addSagas, removeSagas } from '@actioncrew/actionstack/sagas';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { takeEvery } from 'redux-saga/effects';


function* helloSaga() {
  console.log('Hello from the Saga!');
}

function* watchHelloSaga() {
  yield takeEvery('*', helloSaga); // Listens for 'ACTION_NAME'
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Tour of Heroes';

  constructor(private store: Store) {
  }

  ngOnInit() {
    this.store.dispatch(addSagas(watchHelloSaga));
  }

  ngOnDestroy() {
    this.store.dispatch(removeSagas(watchHelloSaga));
  }
}
