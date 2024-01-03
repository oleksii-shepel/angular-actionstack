import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';

import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import logger from 'redux-logger';
import { createEpicMiddleware, ofType } from 'redux-observable';
import { Action } from 'redux-replica';
import { sequential } from 'redux-sequential';
import { thunk } from 'redux-thunk';
import { Observable, map } from 'rxjs';
import { StoreModule } from 'supervisor';
import { AppRoutingModule } from './app-routing.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HeroDetailModule } from './hero-detail/hero-detail.module';
import { HeroesModule } from './heroes/heroes.module';
import { MessagesModule } from './messages/messages.module';


const epic = createEpicMiddleware();

const pingEpic = (action$: Observable<any>) => action$.pipe(
  ofType('PING'),
  map(() => { type: 'PONG' })
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
  imports: [BrowserModule, FormsModule, AppRoutingModule, StoreModule.forRoot({
    middlewares: [sequential(thunk), logger, epic],
    reducer: (state: any = {}, action: Action<any>) => state,
    effects: [pingEpic],
  }),
    DashboardModule,
    HeroesModule,
    HeroDetailModule,
    MessagesModule
  ],
  declarations: [
    AppComponent
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}

