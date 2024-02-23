import { Component, Inject, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { Hero } from '../hero';
import { EnhancedStore } from './../../../../actionstack/src/lib/types';
import { loadHeroes, selectTopHeroes } from './dashboard.slice';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: [ './dashboard.component.css' ]
})
export class DashboardComponent implements OnInit {
  heroes$: Observable<Hero[]> = this.store.select(selectTopHeroes());

  constructor(@Inject('Store') private store: EnhancedStore) { }

  ngOnInit(): void {
    this.store.dispatch(loadHeroes());
  }

  ngOnDestroy(): void {
  }
}
