import { Component } from '@angular/core';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-privacy',
  templateUrl: './privacy.component.html',
  styleUrls: ['./privacy.component.css'],
  imports: [DatePipe],
  standalone: true
})
export class PrivacyComponent {
  fechaActual = new Date();
} 