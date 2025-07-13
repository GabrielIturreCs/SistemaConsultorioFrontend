import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { User } from '../../../interfaces';

@Component({
  selector: 'app-dentist-navbar',
  imports: [CommonModule],
  templateUrl: './dentist-navbar.component.html',
  styleUrl: './dentist-navbar.component.css'
})
export class DentistNavbarComponent implements OnInit {
  user: User | null = null;
  currentRoute: string = '';

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.user = this.authService.getCurrentUser();
    this.currentRoute = this.router.url;
  }

  getUserGreeting(): string {
    if (!this.user) return 'Dentista';
    return `${this.user.nombre} ${this.user.apellido}`;
  }

  getTipoClass(tipo: string): string {
    switch (tipo) {
      case 'administrador':
        return 'badge bg-danger';
      case 'dentista':
        return 'badge bg-primary';
      case 'paciente':
        return 'badge bg-success';
      default:
        return 'badge bg-secondary';
    }
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  navigateToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  navigateToPacientes(): void {
    this.router.navigate(['/pacientes']);
  }

  navigateToAgenda(): void {
    this.router.navigate(['/agenda']);
  }

  navigateToReservar(): void {
    this.router.navigate(['/reservarTurno']);
  }

  navigateToConfiguracion(): void {
    this.router.navigate(['/configuracion-disponibilidad']);
  }

  isActiveRoute(route: string): boolean {
    return this.currentRoute.includes(route);
  }
} 