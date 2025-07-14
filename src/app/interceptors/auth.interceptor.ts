// src/app/interceptors/auth.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { HttpRequest, HttpHandlerFn, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

export const AuthInterceptor: HttpInterceptorFn = (request: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
  const router = inject(Router);
  const token = localStorage.getItem('token');
  const headers: { [key: string]: string } = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const authRequest = request.clone({
    setHeaders: headers,
    withCredentials: true
  });
  return next(authRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('rol');
        router.navigate(['/login']);
        return throwError(() => new Error('Sesión expirada. Por favor, inicie sesión nuevamente.'));
      }
      return throwError(() => error);
    })
  );
};