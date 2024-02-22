import { Component, Inject } from "@angular/core";
import { EnhancedStore } from "actionstack";


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'Tour of Heroes';
  constructor(@Inject('Store') private store: EnhancedStore) {

  }
}
