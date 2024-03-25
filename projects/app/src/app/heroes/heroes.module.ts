import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule, Routes } from "@angular/router";
import { provideModule } from "actionstack";
import { HeroService } from "../hero.service";
import { HeroesComponent } from "./heroes.component";
import { reducer, slice } from "./heroes.slice";

const routes: Routes = [
  { path: '', component: HeroesComponent, pathMatch: 'full' },
];

@NgModule({
  imports: [CommonModule, FormsModule, RouterModule.forChild(routes), provideModule({
    slice: slice,
    reducer: reducer,
    dependencies: {heroService: HeroService}
  })],
  declarations: [
    HeroesComponent,
  ],
  exports: [
    HeroesComponent
  ]
})
export class HeroesModule {}

