import { Component, OnDestroy, OnInit } from '@angular/core';

import { Store } from 'actionstack';
import { Subscription } from 'rxjs';
import { Hero } from '../hero';
import { HeroService } from '../hero.service';
import { getHeroes, loadHeroes$, selectHeroes } from './heroes.slice';

@Component({
  selector: 'app-heroes',
  templateUrl: './heroes.component.html',
  styleUrls: ['./heroes.component.css']
})
export class HeroesComponent implements OnInit, OnDestroy {
  heroes: Hero[] = [];
  subscription!: Subscription;

  constructor(private store: Store, private heroService: HeroService) { }

  ngOnInit(): void {
    this.store.enable(loadHeroes$, { heroService: this.heroService });

    this.subscription = this.store.select(selectHeroes()).subscribe(value => {
      this.heroes = value;
    });

    this.getHeroes();
  }

  getHeroes(): void {
    this.store.dispatch(getHeroes(this.heroes));
  }

  ngOnDestroy(): void {
    this.store.disable(loadHeroes$);
    this.subscription.unsubscribe();
  }
}
