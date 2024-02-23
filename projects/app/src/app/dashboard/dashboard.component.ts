import { Component, OnInit } from '@angular/core';
import { Store } from 'actionstack';
import { Observable } from 'rxjs';
import { Hero } from '../hero';
import { loadHeroes, selectTopHeroes } from './dashboard.slice';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: [ './dashboard.component.css' ]
})
export class DashboardComponent implements OnInit {
  heroes$: Observable<Hero[]> = this.store.select(selectTopHeroes());

  constructor(private store: Store) { }

  ngOnInit(): void {
    this.store.dispatch(loadHeroes());
  }

  ngOnDestroy(): void {
  }
}
