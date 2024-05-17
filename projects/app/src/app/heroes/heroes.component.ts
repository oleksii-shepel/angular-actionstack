import { HeroService } from './../hero.service';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { Store } from '@actioncrew/actionstack';
import { Hero } from '../hero';
import { getHeroesRequest, loadHeroes, selectHeroes } from './heroes.slice';
import { addEffects, removeEffects } from '@actioncrew/actionstack/epics';

@Component({
  selector: 'app-heroes',
  templateUrl: './heroes.component.html',
  styleUrls: ['./heroes.component.css']
})
export class HeroesComponent implements OnInit, OnDestroy {
  heroes: Hero[] = [];
  subscriptionA!: Subscription;
  subscriptionB!: Subscription;

  constructor(private store: Store, private heroService: HeroService) { }

  ngOnInit(): void {
    this.store.dispatch(addEffects(loadHeroes));

    this.subscriptionB = this.store.select(selectHeroes()).subscribe(value => {
      this.heroes = value;
    });

    this.getHeroes();
  }

  getHeroes(): void {
    this.store.dispatch(getHeroesRequest(this.heroes));
  }

  ngOnDestroy(): void {
    //this.subscriptionA.unsubscribe();
    this.subscriptionB.unsubscribe();

    this.store.dispatch(removeEffects(loadHeroes));
  }
}
