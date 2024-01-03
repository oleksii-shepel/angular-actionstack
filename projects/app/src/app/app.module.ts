import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { CustomRouter } from 'custom-router';

import { AppComponent } from './app.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { HeroDetailComponent } from './hero-detail/hero-detail.component';
import { HeroesComponent } from './heroes/heroes.component';
import { MessagesComponent } from './messages/messages.component';

import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { Router } from '@angular/router';
import { AppRoutingModule } from './app-routing.module';

export function getBaseHref(platformLocation: PlatformLocation): string {
  return platformLocation.getBaseHrefFromDOM();
}


@NgModule({
    providers: [
      { provide: Router, useClass: CustomRouter },
      {
          provide: APP_BASE_HREF,
          useFactory: getBaseHref,
          deps: [PlatformLocation]
      }
  ],
  imports: [
    BrowserModule,
    FormsModule,
    AppRoutingModule
  ],
  declarations: [
    AppComponent,
    DashboardComponent,
    HeroesComponent,
    HeroDetailComponent,
    MessagesComponent
  ],
  bootstrap: [ AppComponent ]
})
export class AppModule { }

