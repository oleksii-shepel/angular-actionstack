import { Injectable } from '@angular/core';

import { Observable, from } from 'rxjs';

import { Hero } from './hero';
import { MessageService } from './message.service';
import { HEROES } from './mock-heroes';

@Injectable({ providedIn: 'root' })
export class HeroService {
  timeout = 200;

  constructor(private messageService: MessageService) { }

  getHeroes(): Observable<Hero[]> {
    return from(new Promise<Hero[]>((resolve) => {
      setTimeout(() => {
        this.messageService.add('HeroService: fetched heroes');
        resolve(HEROES);
      }, this.timeout);
    }));
  }

  getHero(id: number): Observable<Hero> {
    return from(new Promise<Hero>((resolve) => {
      setTimeout(() => {
        const hero = HEROES.find(h => h.id === id)!;
        this.messageService.add(`HeroService: fetched hero id=${id}`);
        resolve(hero);
      }, this.timeout);
    }));
  }
}
