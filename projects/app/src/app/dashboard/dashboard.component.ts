import { Slice } from '@actioncrew/actionstack';
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Subscribable } from 'rxjs';
import { Hero } from '../hero';
import { HeroService } from './../hero.service';
import { loadHeroes, reducer, selectTopHeroes, slice } from './dashboard.slice';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: [ './dashboard.component.css' ],
  standalone: true,
  imports: [CommonModule, RouterModule],
  providers: [Slice]
})
export class DashboardComponent implements OnInit {
  heroes$: Subscribable<Hero[]> = this.slice.select(selectTopHeroes());

  constructor(private slice: Slice) {
  }

  ngOnInit(): void {
    this.slice.setup({
      slice: slice,
      reducer: reducer, effects: [],
      dependencies: { heroService: HeroService },
      strategy: "persistent"
    });

    this.slice.dispatch(loadHeroes());
  }

  ngOnDestroy(): void {
  }
}
