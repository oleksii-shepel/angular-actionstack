import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { Action, StoreModule, measure } from 'actionstack';
import { AppRoutingModule } from './app-routing.module';
import { MessagesModule } from './messages/messages.module';

@NgModule({
  imports: [
    BrowserModule,
    FormsModule,
    AppRoutingModule,
    StoreModule.forRoot({
      middlewares: [measure],
      reducer: (state: any = {}, action: Action<any>) => state,
      dependencies: {},
      strategy: "concurrent",
    }),
    MessagesModule
  ],
  declarations: [
    AppComponent
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}

