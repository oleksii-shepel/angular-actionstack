import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { StoreModule } from "actionstack";
import { HeroesComponent } from "./heroes.component";
import { reducer, slice } from "./heroes.slice";


@NgModule({
  imports: [CommonModule, FormsModule, RouterModule, StoreModule.forFeature({
    slice: slice,
    reducer: reducer
  })],
  declarations: [
    HeroesComponent,
  ],
  exports: [
    HeroesComponent
  ]
})
export class HeroesModule {}

