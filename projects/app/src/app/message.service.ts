import { Inject, Injectable } from '@angular/core';
import { EnhancedStore } from 'actionstack';

@Injectable({ providedIn: 'root' })
export class MessageService {
  messages: string[] = [];

  constructor(@Inject('Store') private store: EnhancedStore) {
  }

  add(message: string) {
    this.messages.push(message);
  }

  clear() {
    this.messages = [];
  }
}
