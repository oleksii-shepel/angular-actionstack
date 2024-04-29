import { Component, OnDestroy, OnInit } from '@angular/core';

import { ISubscription, Store } from '@actioncrew/actionstack';
import { Hero } from '../hero';
import { getHeroesRequest, loadHeroes, selectHeroes } from './heroes.slice';

@Component({
  selector: 'app-heroes',
  templateUrl: './heroes.component.html',
  styleUrls: ['./heroes.component.css']
})
export class HeroesComponent implements OnInit, OnDestroy {
  heroes: Hero[] = [];
  subscriptionA!: ISubscription;
  subscriptionB!: ISubscription;

  constructor(private store: Store) { }

  ngOnInit(): void {
    this.subscriptionA = this.store.extend(loadHeroes()).subscribe();

    this.subscriptionB = this.store.select(selectHeroes()).subscribe(value => {
      this.heroes = value;
    });

    this.getHeroes();
  }

  getHeroes(): void {
    this.store.dispatch(getHeroesRequest(this.heroes));
  }

  ngOnDestroy(): void {
    this.subscriptionA.unsubscribe();
    this.subscriptionB.unsubscribe();
  }
}
