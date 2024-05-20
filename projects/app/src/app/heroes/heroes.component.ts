import { Store } from '@actioncrew/actionstack';
import { addEpics, removeEpics } from '@actioncrew/actionstack/epics';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { Hero } from '../hero';
import { HeroService } from './../hero.service';
import { getHeroesRequest, loadHeroes, selectHeroes } from './heroes.slice';

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
    this.store.dispatch(addEpics(loadHeroes));

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

    this.store.dispatch(removeEpics(loadHeroes));
  }
}
