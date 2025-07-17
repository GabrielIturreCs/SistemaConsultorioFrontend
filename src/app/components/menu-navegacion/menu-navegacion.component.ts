import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { User } from '../../interfaces';

@Component({
  selector: 'app-menu-navegacion',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './menu-navegacion.component.html',
  styleUrl: './menu-navegacion.component.css'
})
export class MenuNavegacionComponent {
  @Input() user: User | null = null;
  @Input() currentView: string = 'dashboard';

  constructor(private router: Router) {}

  navigateTo(view: string): void {
    
    switch (view) {
      case 'dashboard':
        // Redirigir según el tipo de usuario
        if (this.user?.tipoUsuario === 'paciente') {
          this.router.navigate(['/vistaPaciente']);
        } else {
          this.router.navigate(['/dashboard']);
        }
        break;
      case 'vistaPaciente':
        this.router.navigate(['/vistaPaciente']);
        break;
      case 'registrar-turno':
        this.router.navigate(['/reservarTurno']);
        break;
      case 'mis-turnos':
        this.router.navigate(['/misTurnos']);
        break;
      case 'admin':
        this.router.navigate(['/admin']);
        break;
      case 'agenda':
        this.router.navigate(['/agenda']);
        break;
      case 'estadistica':
        this.router.navigate(['/estadistica']);
        break;
      case 'pacientes':
        this.router.navigate(['/pacientes']);
        break;
      case 'dentista':
        this.router.navigate(['/dentista']);
        break;
      case 'tratamiento':
        this.router.navigate(['/tratamiento']);
        break;
      default:
        this.router.navigate([`/${view}`]);
    }
  }
}
