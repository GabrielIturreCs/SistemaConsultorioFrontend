import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Disponibilidad, DisponibilidadMensual } from '../interfaces';
import { environment } from '../environments/environment';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class DisponibilidadService {
  private apiUrl = `${environment.apiUrl}/disponibilidad`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  private getHeaders() {
    return this.authService.getAuthHeaders();
  }

  // Obtener configuración de disponibilidad del dentista
  getDisponibilidad(dentistaId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${dentistaId}`, { 
      headers: this.getHeaders() 
    });
  }

  // Actualizar configuración de disponibilidad
  actualizarDisponibilidad(dentistaId: string, configuracion: Partial<Disponibilidad>): Observable<any> {
    return this.http.put(`${this.apiUrl}/${dentistaId}`, configuracion, { 
      headers: this.getHeaders() 
    });
  }

  // Obtener horarios disponibles para una fecha
  getHorariosDisponibles(dentistaId: string, fecha: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${dentistaId}/horarios`, {
      headers: this.getHeaders(),
      params: { fecha }
    });
  }

  // Verificar disponibilidad de un horario específico
  verificarDisponibilidad(dentistaId: string, fecha: string, hora: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${dentistaId}/verificar`, {
      headers: this.getHeaders(),
      params: { fecha, hora }
    });
  }

  // Obtener disponibilidad mensual
  getDisponibilidadMensual(dentistaId: string, mes: number, anio: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${dentistaId}/mensual`, {
      headers: this.getHeaders(),
      params: { mes: mes.toString(), anio: anio.toString() }
    });
  }

  // Generar horarios basados en configuración
  generarHorarios(configuracion: Disponibilidad): string[] {
    const horarios: string[] = [];
    const inicio = new Date(`2000-01-01T${configuracion.horarioInicio}`);
    const fin = new Date(`2000-01-01T${configuracion.horarioFin}`);
    
    let horaActual = new Date(inicio);
    
    while (horaActual < fin) {
      horarios.push(horaActual.toTimeString().slice(0, 5));
      horaActual.setMinutes(horaActual.getMinutes() + configuracion.intervaloMinutos);
    }
    
    return horarios;
  }

  // Obtener nombres de días de la semana
  getNombreDia(diaSemana: number): string {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return dias[diaSemana];
  }

  // Verificar si un día es laborable
  esDiaLaborable(diaSemana: number, configuracion: Disponibilidad): boolean {
    return configuracion.diasLaborables.includes(diaSemana);
  }

  // Verificar si una fecha es un día no laborable
  esDiaNoLaborable(fecha: string, configuracion: Disponibilidad): boolean {
    return configuracion.diasNoLaborables.some(dia => dia.fecha === fecha);
  }

  // Obtener configuración por defecto
  getConfiguracionPorDefecto(): Disponibilidad {
    return {
      dentistaId: '',
      horarioInicio: '08:00',
      horarioFin: '18:00',
      intervaloMinutos: 20,
      diasLaborables: [1, 2, 3, 4, 5, 6], // Lunes a Sábado
      diasNoLaborables: [],
      franjasNoDisponibles: [],
      pausas: [],
      duracionTurnoDefault: 30,
      tiempoEntreTurnos: 0
    };
  }
} 