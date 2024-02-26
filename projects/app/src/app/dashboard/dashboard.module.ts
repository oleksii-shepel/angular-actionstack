import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule, Routes } from '@angular/router';
import { StoreModule } from "actionstack";
import { HeroService } from "../hero.service";
import { DashboardComponent } from "./dashboard.component";
import { reducer, slice } from "./dashboard.slice";

const routes: Routes = [
  { path: '', component: DashboardComponent, pathMatch: 'full' },
];

@NgModule({
  imports: [CommonModule, FormsModule, RouterModule.forChild(routes), StoreModule.forFeature({
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

