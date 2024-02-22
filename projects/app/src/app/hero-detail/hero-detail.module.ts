import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { StoreModule } from "actionstack";
import { HeroService } from './../hero.service';
import { HeroDetailComponent } from "./hero-detail.component";
import { reducer, slice } from "./hero-detail.slice";

@NgModule({
  imports: [CommonModule, FormsModule, RouterModule, StoreModule.forFeature({
    slice: slice,
    reducer: reducer,
    dependencies: {heroService: HeroService}
  })],
  declarations: [
    HeroDetailComponent,
  ],
  exports: [
    HeroDetailComponent
  ]
})
export class HeroDetailModule {}

