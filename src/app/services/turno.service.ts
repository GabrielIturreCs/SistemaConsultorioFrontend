import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { Turno, Tratamiento, Paciente } from '../interfaces';
import { tap } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { NotificationService } from './notification.service';
import { AuthService } from './auth.service';
import { LoggerService, LogCategory } from '../utils/logger.service';

@Injectable({
  providedIn: 'root'
})
export class TurnoService {
  private apiUrl = `${environment.apiUrl}/turno`;
  private turnosSubject = new BehaviorSubject<Turno[]>([]);
  public turnos$ = this.turnosSubject.asObservable();

  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
    private authService: AuthService,
    private logger: LoggerService
  ) {
    this.loadTurnos();
  }

  private getHeaders(): HttpHeaders {
    // Usar headers de autenticación del AuthService
    return this.authService.getAuthHeaders();
  }

  private loadTurnos(): void {
    this.getTurnosFromAPI().subscribe({
      next: (response) => {
        this.turnosSubject.next(response.turnos);
      },
      error: (error) => {
        this.logger.error('Error cargando turnos', LogCategory.API, error);
        this.turnosSubject.next([]);
      }
    });
  }

  // Obtener turnos paginados y filtrados desde el backend
  getTurnosFromAPI(params?: {
    page?: number;
    limit?: number;
    pacienteId?: string;
    dentistaId?: string;
    estado?: string;
    fecha?: string;
  }): Observable<{
    turnos: Turno[];
    total: number;
    page: number;
    totalPages: number;
    limit: number;
  }> {
    const queryParams = new URLSearchParams();
    
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.pacienteId) queryParams.append('pacienteId', params.pacienteId);
    if (params?.dentistaId) queryParams.append('dentistaId', params.dentistaId);
    if (params?.estado) queryParams.append('estado', params.estado);
    if (params?.fecha) queryParams.append('fecha', params.fecha);

    const url = `${this.apiUrl}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    return this.http.get<{
      turnos: Turno[];
      total: number;
      page: number;
      totalPages: number;
      limit: number;
    }>(url, { headers: this.getHeaders() });
  }

  // Obtener turnos (para compatibilidad con el componente)
  getTurnos(): Observable<Turno[]> {
    return this.turnos$;
  }

  // Obtener turno por ID
  getTurnoById(id: string): Observable<Turno> {
    return this.http.get<Turno>(`${this.apiUrl}/${id}`, { headers: this.getHeaders() });
  }

  // Obtener turnos por fecha
  getTurnosByDate(fecha: string): Observable<Turno[]> {
    return this.http.get<Turno[]>(`${this.apiUrl}/fecha/${fecha}`, { headers: this.getHeaders() });
  }

  // Obtener turnos por paciente
  getTurnosByPaciente(pacienteId: string): Observable<Turno[]> {
    return this.http.get<Turno[]>(`${this.apiUrl}/paciente/${pacienteId}`, { headers: this.getHeaders() });
  }

  // Obtener turnos por dentista
  getTurnosByDentista(dentistaId: string): Observable<Turno[]> {
    const url = `${this.apiUrl}/dentista/${dentistaId}`;
    this.logger.debug('getTurnosByDentista - URL llamada', LogCategory.API, { url, dentistaId });
    
    return this.http.get<Turno[]>(url, { headers: this.getHeaders() });
  }

  // Crear nuevo turno
  createTurno(turnoData: Partial<Turno>): Observable<Turno> {
    return this.http.post<Turno>(this.apiUrl, turnoData, { headers: this.getHeaders() })
      .pipe(
        // Actualizar la lista local después de crear
        tap((newTurno) => {
          const currentTurnos = this.turnosSubject.value;
          this.turnosSubject.next([...currentTurnos, newTurno]);
        })
      );
  }

  // Actualizar turno
  updateTurno(id: string, updates: Partial<Turno>): Observable<Turno> {
    return this.http.put<Turno>(`${this.apiUrl}/${id}`, updates, { headers: this.getHeaders() })
      .pipe(
        // Actualizar la lista local después de actualizar
        tap((updatedTurno) => {
          const currentTurnos = this.turnosSubject.value;
          const updatedTurnos = currentTurnos.map(turno => 
            String(turno.id) === String(updatedTurno.id) ? updatedTurno : turno
          );
          this.turnosSubject.next(updatedTurnos);
        })
      );
  }

  // Eliminar turno
  deleteTurno(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`, { headers: this.getHeaders() })
      .pipe(
        // Actualizar la lista local después de eliminar
        tap(() => {
          const currentTurnos = this.turnosSubject.value;
          const filteredTurnos = currentTurnos.filter(turno => String(turno.id) !== id);
          this.turnosSubject.next(filteredTurnos);
        })
      );
  }

  /**
   * Cambia el estado de un turno existente
   * @param id ID del turno
   * @param nuevoEstado Estado a establecer (ej: 'pendiente', 'reservado', 'cancelado')
   */
  cambiarEstadoTurno(id: string, nuevoEstado: string): Observable<Turno> {
    return this.updateTurno(id, { estado: nuevoEstado });
  }

  /**
   * Cancela un turno y gestiona el reembolso/cancelación del pago en MercadoPago
   */
  cancelarTurnoYReembolso(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}/cancelar`, { headers: this.getHeaders() });
  }

  // Obtener estadísticas
  getEstadisticas(fechaDesde?: string, fechaHasta?: string): Observable<any> {
    let url = `${this.apiUrl}/estadisticas`;
    const params: any = {};
    
    if (fechaDesde) params.fechaDesde = fechaDesde;
    if (fechaHasta) params.fechaHasta = fechaHasta;
    
    return this.http.get(url, { 
      headers: this.getHeaders(),
      params 
    });
  }

  // Obtener tratamientos disponibles
  getTratamientos(): Observable<Tratamiento[]> {
    // Sin headers de autenticación para simplificar
    return this.http.get<Tratamiento[]>(`${environment.apiUrl}/tratamiento`);
  }

  // Obtener pacientes
  getPacientes(): Observable<Paciente[]> {
    return this.http.get<Paciente[]>(`${environment.apiUrl}/paciente`, { 
      headers: this.getHeaders() 
    });
  }

  // Verificar disponibilidad de horario
  verificarDisponibilidad(fecha: string, hora: string, dentistaId?: string): Observable<boolean> {
    const params: any = { fecha, hora };
    if (dentistaId) params.dentistaId = dentistaId;
    
    return this.http.get<boolean>(`${this.apiUrl}/disponibilidad`, {
      headers: this.getHeaders(),
      params
    });
  }

  // Obtener horarios disponibles para una fecha
  getHorariosDisponibles(fecha: string, dentistaId?: string): Observable<string[]> {
    const params: any = { fecha };
    if (dentistaId) params.dentistaId = dentistaId;
    
    return this.http.get<string[]>(`${this.apiUrl}/horarios-disponibles`, {
      headers: this.getHeaders(),
      params
    });
  }

  // Refrescar datos desde el backend
  refreshTurnos(): void {
    this.loadTurnos();
  }

  // Obtener solo los turnos del paciente autenticado (usando JWT)
  getMisTurnos(): Observable<Turno[]> {
    return this.http.get<Turno[]>(`${this.apiUrl}/mis-turnos`, { headers: this.getHeaders() });
  }

  // Obtener horarios ocupados para una fecha específica
  getHorariosOcupados(fecha: string, dentistaId?: string): Observable<any> {
    const params: any = { fecha };
    if (dentistaId) params.dentistaId = dentistaId;
    
    return this.http.get<any>(`${this.apiUrl}/horarios-ocupados`, {
      headers: this.getHeaders(),
      params
    });
  }

  // Obtener disponibilidad de fechas para un mes
  getDisponibilidadFechas(mes: string, anio: string, dentistaId?: string): Observable<any> {
    const params: any = { mes, anio };
    if (dentistaId) params.dentistaId = dentistaId;
    
    return this.http.get<any>(`${this.apiUrl}/disponibilidad-fechas`, {
      headers: this.getHeaders(),
      params
    });
  }

  // Obtener agenda de un dentista específico
  getAgendaDentista(dentistaId: string, fecha?: string): Observable<any> {
    let url = `${this.apiUrl}/agenda-dentista/${dentistaId}`;
    const params: any = {};
    
    if (fecha) params.fecha = fecha;
    
    return this.http.get(url, { 
      headers: this.getHeaders(),
      params 
    });
  }

  // Reprogramar turno usando el endpoint específico
  reprogramarTurno(id: string, nuevaFecha: string, nuevaHora: string, motivo?: string): Observable<Turno> {
    const datos = {
      nuevaFecha,
      nuevaHora,
      motivo: motivo || 'Reprogramación solicitada'
    };
    
    return this.http.put<Turno>(`${this.apiUrl}/${id}/reprogramar`, datos, { 
      headers: this.getHeaders() 
    }).pipe(
      // Actualizar la lista local después de reprogramar
      tap((turnoReprogramado) => {
        const currentTurnos = this.turnosSubject.value;
        const updatedTurnos = currentTurnos.map(turno => 
          String(turno.id) === String(turnoReprogramado.id) ? turnoReprogramado : turno
        );
        this.turnosSubject.next(updatedTurnos);
      })
    );
  }
} 