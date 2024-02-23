import { Injectable } from '@angular/core';
import { Store } from 'actionstack';

@Injectable({ providedIn: 'root' })
export class MessageService {
  messages: string[] = [];

  constructor(private store: Store) {
  }

  add(message: string) {
    this.messages.push(message);
  }

  clear() {
    this.messages = [];
  }
}
