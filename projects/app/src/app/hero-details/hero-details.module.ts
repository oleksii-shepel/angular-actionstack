import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule, Routes } from "@angular/router";
import { provideModule } from "actionstack";
import { HeroService } from '../hero.service';
import { HeroDetailsComponent } from './hero-details.component';
import { reducer, slice } from "./hero-details.slice";

const routes: Routes = [
  { path: '', component: HeroDetailsComponent, pathMatch: 'full' },
];

@NgModule({
  imports: [CommonModule, FormsModule, RouterModule.forChild(routes), provideModule({
    slice: slice,
    reducer: reducer,
    dependencies: {heroService: HeroService}
  })],
  declarations: [
    HeroDetailsComponent,
  ],
  exports: [
    HeroDetailsComponent
  ]
})
export class HeroDetailsModule {}

