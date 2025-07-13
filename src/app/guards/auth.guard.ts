import { Injectable } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export function authGuard(role: string | string[] = ''): CanActivateFn {
  return (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);
    
    // Verificar si viene de un pago exitoso (caso especial)
    const urlParams = new URLSearchParams(state.url.split('?')[1] || '');
    const isReturnFromPayment = urlParams.get('returnFromPayment') === 'true' || 
                               urlParams.get('payment') === 'success' ||
                               sessionStorage.getItem('payment_success') === 'true';
    
    if (isReturnFromPayment) {
      // Verificar si la sesión está activa
      const isAuthenticated = authService.isAuthenticated();
      
      if (!isAuthenticated) {
        router.navigate(['/login']);
        return false;
      }
      
      return true;
    }
    
    // Verificación normal de autenticación
    const isAuthenticated = authService.isAuthenticated();
    const currentUser = authService.getCurrentUser();
    
    if (!isAuthenticated) {
      router.navigate(['/login']);
      return false;
    }
    
    // Verificar rol si se especificó
    if (role && role.length > 0) {
      const userRole = currentUser?.tipoUsuario;
      
      // Si es un array de roles, verificar si el usuario tiene alguno de ellos
      if (Array.isArray(role)) {
        if (!role.includes(userRole || '')) {
          router.navigate(['/unauthorized']);
          return false;
        }
      } else {
        // Si es un string, verificar si coincide exactamente
        if (userRole !== role) {
          router.navigate(['/unauthorized']);
          return false;
        }
      }
    }
    
    return true;
  };
}
