import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { User } from '../../../interfaces';

@Component({
  selector: 'app-patient-navbar',
  imports: [CommonModule],
  templateUrl: './patient-navbar.component.html',
  styleUrl: './patient-navbar.component.css'
})
export class PatientNavbarComponent implements OnInit {
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
    if (!this.user) return 'Paciente';
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
    this.router.navigate(['/vistaPaciente']);
  }

  navigateToReservar(): void {
    const user = this.authService.getCurrentUser();
    console.log('[DEBUG] Estado del usuario antes de reservar:', user);
    if (!user) {
      alert('No hay usuario autenticado. Por favor, vuelve a iniciar sesión.');
      this.router.navigate(['/login']);
      return;
    }
    if (user.tipoUsuario !== 'paciente') {
      alert('Solo los pacientes pueden reservar turnos.');
      this.router.navigate(['/dashboard']);
      return;
    }
    if (!user.hasCompleteProfile) {
      alert('Debes completar tu perfil antes de reservar turnos.');
      this.router.navigate(['/complete-profile']);
      return;
    }
    // Si ya está en /reservarTurno, navegar primero a /vistaPaciente y luego a /reservarTurno
    if (this.router.url === '/reservarTurno') {
      this.router.navigate(['/vistaPaciente']).then(() => {
        setTimeout(() => {
          this.router.navigate(['/reservarTurno'], { replaceUrl: false }).then(success => {
            if (!success) {
              alert('No se pudo navegar a la página de reserva. Intenta recargar la página o vuelve a iniciar sesión.');
            } else {
              window.scrollTo(0, 0);
            }
          });
        }, 200);
      });
    } else {
      this.router.navigate(['/reservarTurno'], { replaceUrl: false }).then(success => {
        if (!success) {
          alert('No se pudo navegar a la página de reserva. Intenta recargar la página o vuelve a iniciar sesión.');
        } else {
          window.scrollTo(0, 0);
        }
      });
    }
  }

  navigateToTurnos(): void {
    this.router.navigate(['/misTurnos']);
  }

  isActiveRoute(route: string): boolean {
    return this.currentRoute.includes(route);
  }
} 