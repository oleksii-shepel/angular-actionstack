import { Component, Inject } from '@angular/core';
import { EnhancedStore } from 'actionstack';
import { addMessage, clearMessages, selectMessages } from './messages.slice';

@Component({
  selector: 'app-messages',
  templateUrl: './messages.component.html',
  styleUrls: ['./messages.component.css']
})
export class MessagesComponent {
  messages$ = this.store.select(selectMessages());

  constructor(@Inject('Store') private store: EnhancedStore) {}

  addMessage(message: string) {
    this.store.dispatch(addMessage(message));
  }

  clearMessages() {
    this.store.dispatch(clearMessages());
  }
}
