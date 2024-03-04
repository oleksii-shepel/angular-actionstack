import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';

import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { Action, StoreModule, createEffect } from 'actionstack';
import logger from 'redux-logger';
import { AppRoutingModule } from './app-routing.module';
import { MessagesModule } from './messages/messages.module';


export const pingEpic = createEffect('PING', (action, state, dependencies) => ({ type: 'PONG' }));
export const pingEpic2 = createEffect('PING', action => action);
export const pingEpic3 = createEffect('PING', action => ({ type: 'PONG3' }));
export const pingEpic4 = createEffect('PING', action => ({ type: 'PONG4' }));
export const pingEpic5 = createEffect('PONG3', action => ({ type: 'PONG4' }));
export const pingEpic6 = createEffect('PONG3', action => ({ type: 'PONG5' }));


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
    BrowserModule,
    FormsModule,
    AppRoutingModule,
    StoreModule.forRoot({
      preloadedState: {},
      middlewares: [logger],
      reducer: (state: any = {}, action: Action<any>) => state,
      dependencies: {},
      strategy: "concurrent"
    }),
    MessagesModule
  ],
  declarations: [
    AppComponent
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}

