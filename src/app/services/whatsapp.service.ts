import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface WhatsAppMessage {
  telefono: string;
  mensaje: string;
}

export interface TurnoConfirmation {
  turnoId: string;
}

@Injectable({
  providedIn: 'root'
})
export class WhatsAppService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  /**
   * Enviar mensaje de confirmación de turno
   */
  sendTurnoConfirmation(turnoId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/whatsapp/send-turno-confirmation/${turnoId}`, {});
  }

  /**
   * Enviar mensaje de recordatorio
   */
  sendReminder(turnoId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/whatsapp/send-reminder/${turnoId}`, {});
  }

  /**
   * Enviar mensaje personalizado
   */
  sendCustomMessage(telefono: string, mensaje: string): Observable<any> {
    const data: WhatsAppMessage = { telefono, mensaje };
    return this.http.post(`${this.apiUrl}/whatsapp/send-custom-message`, data);
  }

  /**
   * Verificar si un número de teléfono es válido para WhatsApp
   */
  isValidPhoneNumber(phone: string): boolean {
    if (!phone) return false;
    
    // Eliminar todos los caracteres no numéricos
    const cleanNumber = phone.replace(/\D/g, '');
    
    // Debe tener al menos 10 dígitos (código de país + número)
    return cleanNumber.length >= 10;
  }

  /**
   * Formatear número de teléfono para mostrar
   */
  formatPhoneForDisplay(phone: string): string {
    if (!phone) return '';
    
    // Eliminar todos los caracteres no numéricos
    let cleanNumber = phone.replace(/\D/g, '');
    
    // Si empieza con 54, quitarlo para mostrar
    if (cleanNumber.startsWith('54')) {
      cleanNumber = cleanNumber.substring(2);
    }
    
    // Si empieza con 0, quitarlo
    if (cleanNumber.startsWith('0')) {
      cleanNumber = cleanNumber.substring(1);
    }
    
    // Formatear como XXX-XXX-XXXX
    if (cleanNumber.length === 10) {
      return `${cleanNumber.substring(0, 3)}-${cleanNumber.substring(3, 6)}-${cleanNumber.substring(6)}`;
    }
    
    return cleanNumber;
  }
} 