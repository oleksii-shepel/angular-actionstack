import { Action, provideStore } from '@actioncrew/actionstack';
import { Rx, filter, map } from '@actioncrew/actionstack/rx';
import { perfmon } from '@actioncrew/actionstack/tools';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MessagesModule } from './messages/messages.module';

const numbers = Rx.Observable.create((observer) => {
  observer.next(1);
  observer.next(2);
  observer.next(3);
  observer.complete();

  return new Rx.Subscription(() => {});
});

numbers.pipe(map((a: number) => a + 1), filter((a: number) => a % 2 === 0)).subscribe({
  next: console.log,
  error: console.error,
  complete: () => {}
} as any);

@NgModule({
  imports: [
    BrowserModule,
    FormsModule,
    AppRoutingModule,
    provideStore({
      middleware: [perfmon],
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

