import { Location } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { EnhancedStore } from 'actionstack';
import { Observable } from 'rxjs';
import { Hero } from '../hero';
import { heroSelector, loadHeroRequest } from './hero-details.slice';

@Component({
  selector: 'app-hero-detail',
  templateUrl: './hero-details.component.html',
  styleUrls: [ './hero-details.component.css' ]
})
export class HeroDetailsComponent implements OnInit {
  hero$: Observable<Hero | undefined>;

  constructor(
    @Inject('Store') private store: EnhancedStore,
    private route: ActivatedRoute,
    private location: Location
  ) {
    this.hero$ = this.store.select(heroSelector);
  }

  ngOnInit(): void {
    this.loadHero();
  }

  loadHero(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.store.dispatch(loadHeroRequest(id));
  }

  goBack(): void {
    this.location.back();
  }
}
