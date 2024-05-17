import { sideEffects } from '@actioncrew/actionstack/epics';
import { Action, Tracker, provideStore } from '@actioncrew/actionstack';
import { logger, perfmon } from '@actioncrew/actionstack/tools';
import { NgModule, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MessagesModule } from './messages/messages.module';
import { sagas } from '@actioncrew/actionstack/sagas';



@NgModule({
  imports: [
    BrowserModule,
    FormsModule,
    AppRoutingModule,
    provideStore({
      middleware: [sagas, sideEffects, logger, perfmon],
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

