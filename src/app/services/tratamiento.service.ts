import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Tratamiento } from '../interfaces';
import { environment } from '../environments/environment';

// Interfaces para las respuestas del backend
interface ApiResponse<T> {
  status: string;
  msg: string;
  tratamiento?: T;
}

@Injectable({
  providedIn: 'root'
})
export class TratamientoService {
  private apiUrl = `${environment.apiUrl}/tratamiento`;

  constructor(private http: HttpClient) { }

  // Obtener todos los tratamientos (globales + del profesional si se especifica)
  getTratamientos(profesionalId?: string): Observable<Tratamiento[]> {
    console.log('🔄 Servicio getTratamientos() llamado');
    console.log('👨‍⚕️ ProfesionalId:', profesionalId);
    
    let url = this.apiUrl;
    if (profesionalId) {
      url += `?profesionalId=${profesionalId}`;
    }
    
    console.log('🌐 URL final:', url);
    return this.http.get<Tratamiento[]>(url);
  }

  // Obtener tratamientos de un profesional específico
  getTratamientosByProfesional(profesionalId: string): Observable<Tratamiento[]> {
    return this.http.get<Tratamiento[]>(`${this.apiUrl}/profesional/${profesionalId}`);
  }

  // Obtener un tratamiento por ID
  getTratamiento(id: string): Observable<Tratamiento> {
    return this.http.get<Tratamiento>(`${this.apiUrl}/${id}`);
  }

  // Crear un nuevo tratamiento
  crearTratamiento(tratamiento: Tratamiento, profesionalId?: string, esGlobal: boolean = false): Observable<ApiResponse<Tratamiento>> {
    console.log('🟢 Servicio crearTratamiento() llamado');
    console.log('📤 Tratamiento recibido:', tratamiento);
    console.log('👨‍⚕️ ProfesionalId:', profesionalId);
    console.log('🌍 EsGlobal:', esGlobal);
    
    const tratamientoData = {
      ...tratamiento,
      profesionalId: profesionalId,
      esGlobal: esGlobal
    };
    
    console.log('📤 Datos finales a enviar:', tratamientoData);
    console.log('🌐 URL de la API:', this.apiUrl);
    
    return this.http.post<ApiResponse<Tratamiento>>(this.apiUrl, tratamientoData);
  }

  // Actualizar un tratamiento existente
  actualizarTratamiento(id: string, tratamiento: Tratamiento): Observable<ApiResponse<Tratamiento>> {
    return this.http.put<ApiResponse<Tratamiento>>(`${this.apiUrl}/${id}`, tratamiento);
  }

  // Eliminar un tratamiento
  eliminarTratamiento(id: string): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${this.apiUrl}/${id}`);
  }
}
