import { Component } from '@angular/core';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-terms',
  templateUrl: './terms.component.html',
  styleUrls: ['./terms.component.css'],
  imports: [DatePipe],
  standalone: true
})
export class TermsComponent {
  fechaActual = new Date();
} 