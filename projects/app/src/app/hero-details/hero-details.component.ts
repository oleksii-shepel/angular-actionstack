import { Location } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { map, tap } from 'rxjs';

import { IObservable, ISubscription, Store } from '@actioncrew/actionstack';
import { Hero } from '../hero';
import { heroSelector, loadHero } from './hero-details.slice';

@Component({
  selector: 'app-hero-details',
  templateUrl: './hero-details.component.html',
  styleUrls: [ './hero-details.component.css' ]
})
export class HeroDetailsComponent implements OnInit {
  hero$!: IObservable<Hero | undefined>;
  subscription: ISubscription | undefined;
  subscriptionA: ISubscription | undefined;

  constructor(
    private store: Store,
    private route: ActivatedRoute,
    private location: Location
  ) {

    this.hero$ = this.store.select(heroSelector());

    this.subscriptionA = this.store.select(heroSelector()).subscribe(
      (value) => console.log(value));
  }

  ngOnInit(): void {
    this.subscription = this.route.paramMap.pipe(
      map(params => Number(params.get('id'))),
      tap(id => this.store.dispatch(loadHero(id)))
    ).subscribe();
  }

  goBack(): void {
    this.location.back();
  }

  ngOnDestroy() {
    if(this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}
