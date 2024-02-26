import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule, Routes } from "@angular/router";
import { StoreModule } from "actionstack";
import { HeroesComponent } from "./heroes.component";
import { reducer, slice } from "./heroes.slice";

const routes: Routes = [
  { path: '', component: HeroesComponent, pathMatch: 'full' },
];

@NgModule({
  imports: [CommonModule, FormsModule, RouterModule.forChild(routes), StoreModule.forFeature({
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

