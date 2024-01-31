import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule } from '@angular/router';
import { Action, StoreModule } from "actionstack";
import { DashboardComponent } from "./dashboard.component";


@NgModule({
  imports: [CommonModule, FormsModule, RouterModule, StoreModule.forFeature({
    slice: 'dashboard',
    reducer: (state: any = {}, action: Action<any>) => state,
    effects: [],
    dependencies: {}
  })],
  declarations: [
    DashboardComponent,
  ],
  exports: [
    DashboardComponent
  ]
})
export class DashboardModule {}

