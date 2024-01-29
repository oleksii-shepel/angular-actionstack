import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { Action } from "redux-replica";
import { StoreModule } from "supervisor";
import { HeroDetailComponent } from "./hero-detail.component";


@NgModule({
  imports: [CommonModule, FormsModule, RouterModule, StoreModule.forFeature({
    slice: 'hero-detail',
    reducer: (state: any = {}, action: Action<any>) => state,
    effects: [],
    dependencies: {}
  })],
  declarations: [
    HeroDetailComponent,
  ],
  exports: [
    HeroDetailComponent
  ]
})
export class HeroDetailModule {}

