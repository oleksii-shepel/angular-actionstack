import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';

import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { Action, StoreModule, measure } from 'actionstack';
import { AppRoutingModule } from './app-routing.module';
import { MessagesModule } from './messages/messages.module';


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
      middlewares: [measure],
      reducer: (state: any = {}, action: Action<any>) => state,
      dependencies: {},
      strategy: "exclusive",
    }),
    MessagesModule
  ],
  declarations: [
    AppComponent
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}

