import { Injectable } from '@angular/core';

import { Observable, from } from 'rxjs';

import { Store } from '@actioncrew/actionstack';
import { Hero } from './hero';
import { addMessage } from './messages/messages.slice';
import { HEROES } from './mock-heroes';

@Injectable({ providedIn: 'root' })
export class HeroService {
  timeout = 200;

  constructor(private store: Store) { }

  getHeroes(): Observable<Hero[]> {
    return from(new Promise<Hero[]>((resolve) => {
      setTimeout(() => {
        this.store.dispatch(addMessage('HeroService: fetched heroes'));
        resolve(HEROES);
      }, this.timeout);
    }));
  }

  getHero(id: number): Observable<Hero> {
    return from(new Promise<Hero>((resolve) => {
      setTimeout(() => {
        const hero = HEROES.find(h => h.id === id)!;

        this.store.dispatch(addMessage(`HeroService: fetched hero id=${id}`));
        resolve(hero);
      }, this.timeout);
    }));
  }
}
