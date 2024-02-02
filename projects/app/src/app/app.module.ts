import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';

import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { Action, StoreModule, createEffect, measure } from 'actionstack';
import { AppRoutingModule } from './app-routing.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HeroDetailModule } from './hero-detail/hero-detail.module';
import { HeroesModule } from './heroes/heroes.module';
import { MessagesModule } from './messages/messages.module';


const pingEpic = createEffect('PING', (action, state, dependencies) => ({ type: 'PONG' }));
const pingEpic2 = createEffect('PING', action => action);
const pingEpic3 = createEffect('PING', action => ({ type: 'PONG3' }));
const pingEpic4 = createEffect('PONG3', action => ({ type: 'PONG4' }));

// const pingEpic = (action$: Observable<Action<any>>, state$: Observable<any>) => action$.pipe(
//   ofType('PING'),
//   withLatestFrom(state$),
//   tap(([action, state]) => {}),
//   map(() => ({ type: 'PONG' }))
// );

// const pingEpic2 = (action$: Observable<Action<any>>, state$: Observable<any>) => action$.pipe(
//   ofType('PING'),
//   withLatestFrom(state$),
//   tap(([action, state]) => {}),
//   ignoreElements()
// );

// const pingEpic3 = (action$: Observable<Action<any>>, state$: Observable<any>) => action$.pipe(
//   ofType('PING'),
//   withLatestFrom(state$),
//   tap(([action, state]) => {}),
//   map(() => ({ type: 'PONG3' }))
// );

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
      preloadedState: {},
      middlewares: [measure],
      reducer: (state: any = {}, action: Action<any>) => state,
      effects: [pingEpic, pingEpic2, pingEpic3, pingEpic4],
      dependencies: {},
      strategy: "concurrent"
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

