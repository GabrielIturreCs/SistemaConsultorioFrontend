import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class ProfileCompleteGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(): boolean {
    const user = this.authService.getCurrentUser();
    
    if (!user) {
      this.router.navigate(['/login']);
      return false;
    }

    // Solo redirigir si es paciente, necesita completar perfil y NO tiene nombreUsuario (usuario Google)
    if (user.tipoUsuario === 'paciente' && user.needsProfileCompletion && !user.nombreUsuario) {
      this.router.navigate(['/complete-profile']);
      return false;
    }

    return true;
  }
}
