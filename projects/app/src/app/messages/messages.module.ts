import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule } from '@angular/router';
import { Action, StoreModule } from "actionstack";
import { MessagesComponent } from "./messages.component";


@NgModule({
  imports: [CommonModule, FormsModule, RouterModule, StoreModule.forFeature({
    slice: 'messages',
    reducer: (state: any = {}, action: Action<any>) => state,
    dependencies: {}
  })],
  declarations: [
    MessagesComponent,
  ],
  exports: [
    MessagesComponent
  ]
})
export class MessagesModule {}

