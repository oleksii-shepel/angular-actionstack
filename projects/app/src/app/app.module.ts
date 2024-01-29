import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';

import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import logger from 'redux-logger';
import { ofType } from 'redux-observable';
import { Action } from 'redux-replica';
import { thunk } from 'redux-thunk';
import { Observable, ignoreElements, map, tap, withLatestFrom } from 'rxjs';
import { StoreModule, bufferize } from 'supervisor';
import { AppRoutingModule } from './app-routing.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HeroDetailModule } from './hero-detail/hero-detail.module';
import { HeroesModule } from './heroes/heroes.module';
import { MessagesModule } from './messages/messages.module';


const pingEpic = (action$: Observable<Action<any>>, state$: Observable<any>) => action$.pipe(
  ofType('PING'),
  withLatestFrom(state$),
  tap(([action, state]) => {}),
  map(() => ({ type: 'PONG' }))
);

const pingEpic2 = (action$: Observable<Action<any>>, state$: Observable<any>) => action$.pipe(
  ofType('PING'),
  withLatestFrom(state$),
  tap(([action, state]) => {}),
  ignoreElements()
);

const pingEpic3 = (action$: Observable<Action<any>>, state$: Observable<any>) => action$.pipe(
  ofType('PING'),
  withLatestFrom(state$),
  tap(([action, state]) => {}),
  map(() => ({ type: 'PONG3' }))
);

export function getBaseHref(platformLocation: PlatformLocation): string {
  return platformLocation.getBaseHrefFromDOM();
}


@NgModule({
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: getBaseHref,
      deps: [PlatformLocation],
    },
  ],
  imports: [
    StoreModule.forRoot({
      middlewares: [bufferize, thunk, logger],
      reducer: (state: any = {}, action: Action<any>) => state,
      effects: [pingEpic, pingEpic2, pingEpic3],
      dependencies: {}
    }),
    BrowserModule,
    FormsModule,
    AppRoutingModule,
    DashboardModule,
    HeroesModule,
    HeroDetailModule,
    MessagesModule,

  ],
  declarations: [
    AppComponent
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}

