import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule } from '@angular/router';
import { StoreModule } from "actionstack";
import { HeroService } from "../hero.service";
import { DashboardComponent } from "./dashboard.component";
import { reducer, slice } from "./dashboard.slice";

@NgModule({
  imports: [CommonModule, FormsModule, RouterModule, StoreModule.forFeature({
    slice: slice,
    reducer: reducer,
    dependencies: {heroService: HeroService}
  })],
  declarations: [
    DashboardComponent,
  ],
  exports: [
    DashboardComponent
  ]
})
export class DashboardModule {}

