import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule } from '@angular/router';
import { provideModule } from "actionstack";
import { MessagesComponent } from "./messages.component";
import { reducer, slice } from "./messages.slice";


@NgModule({
  imports: [CommonModule, FormsModule, RouterModule, provideModule({
    slice: slice,
    reducer: reducer
  })],
  declarations: [
    MessagesComponent,
  ],
  exports: [
    MessagesComponent
  ]
})
export class MessagesModule {}

