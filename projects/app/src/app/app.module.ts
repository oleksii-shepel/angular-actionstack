import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { HeroDetailComponent } from './hero-detail/hero-detail.component';
import { HeroesComponent } from './heroes/heroes.component';
import { MessagesComponent } from './messages/messages.component';

import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import logger from 'redux-logger';
import { createEpicMiddleware } from 'redux-observable';
import { Action } from 'redux-replica';
import { sequential } from 'redux-sequential';
import { thunk } from 'redux-thunk';
import { StoreModule } from 'supervisor';
import { AppRoutingModule } from './app-routing.module';


const epic = createEpicMiddleware();


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
    reducer: (state: any, action: Action<any>) => state,
    effects: [],
  })],
  declarations: [
    AppComponent,
    DashboardComponent,
    HeroesComponent,
    HeroDetailComponent,
    MessagesComponent,
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}

