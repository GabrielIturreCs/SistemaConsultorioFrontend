import { Injectable } from '@angular/core';
import { environment } from '../environments/environment';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export enum LogCategory {
  AUTH = 'auth',
  TURNOS = 'turnos',
  CHAT = 'chat',
  PAYMENT = 'payment',
  NAVIGATION = 'navigation',
  API = 'api',
  GENERAL = 'general'
}

@Injectable({
  providedIn: 'root'
})
export class LoggerService {
  private readonly isProduction = environment.production;
  private readonly logLevel = this.isProduction ? LogLevel.ERROR : LogLevel.DEBUG;
  
  // Configuración de logs por categoría
  private readonly categoryConfig: Record<LogCategory, boolean> = {
    [LogCategory.AUTH]: !this.isProduction,
    [LogCategory.TURNOS]: !this.isProduction,
    [LogCategory.CHAT]: false, // Deshabilitado por defecto
    [LogCategory.PAYMENT]: !this.isProduction,
    [LogCategory.NAVIGATION]: false, // Deshabilitado por defecto
    [LogCategory.API]: !this.isProduction,
    [LogCategory.GENERAL]: !this.isProduction
  };

  // Contador de logs para evitar spam
  private logCounters: Record<string, number> = {};
  private readonly MAX_LOGS_PER_MINUTE = 10;

  error(message: string, category: LogCategory = LogCategory.GENERAL, data?: any): void {
    if (this.shouldLog(LogLevel.ERROR, category)) {
      console.error(`[${category.toUpperCase()}] ${message}`, data || '');
    }
  }

  warn(message: string, category: LogCategory = LogCategory.GENERAL, data?: any): void {
    if (this.shouldLog(LogLevel.WARN, category)) {
      console.warn(`[${category.toUpperCase()}] ${message}`, data || '');
    }
  }

  info(message: string, category: LogCategory = LogCategory.GENERAL, data?: any): void {
    if (this.shouldLog(LogLevel.INFO, category)) {
      console.info(`[${category.toUpperCase()}] ${message}`, data || '');
    }
  }

  debug(message: string, category: LogCategory = LogCategory.GENERAL, data?: any): void {
    if (this.shouldLog(LogLevel.DEBUG, category)) {
      console.log(`[${category.toUpperCase()}] ${message}`, data || '');
    }
  }

  // Método para logs críticos que siempre se muestran
  critical(message: string, data?: any): void {
    console.error(`[CRITICAL] ${message}`, data || '');
  }

  // Método para logs de rendimiento
  performance(operation: string, duration: number): void {
    if (duration > 1000) { // Solo log si toma más de 1 segundo
      console.warn(`[PERFORMANCE] ${operation} took ${duration}ms`);
    }
  }

  // Método para logs de API
  api(method: string, url: string, status?: number, duration?: number): void {
    if (this.shouldLog(LogLevel.INFO, LogCategory.API)) {
      const statusIcon = status ? (status >= 400 ? '❌' : '✅') : '🔄';
      const durationText = duration ? ` (${duration}ms)` : '';
      console.log(`[API] ${statusIcon} ${method} ${url} ${status || ''}${durationText}`);
    }
  }

  private shouldLog(level: LogLevel, category: LogCategory): boolean {
    // Verificar nivel de log
    if (level > this.logLevel) {
      return false;
    }

    // Verificar si la categoría está habilitada
    if (!this.categoryConfig[category]) {
      return false;
    }

    // Verificar límite de logs por minuto
    const key = `${category}_${level}`;
    const now = Date.now();
    const minuteAgo = now - 60000;
    
    if (!this.logCounters[key]) {
      this.logCounters[key] = 0;
    }

    // Limpiar contadores antiguos
    if (now - minuteAgo > 60000) {
      this.logCounters[key] = 0;
    }

    // Incrementar contador
    this.logCounters[key]++;

    // Verificar límite
    if (this.logCounters[key] > this.MAX_LOGS_PER_MINUTE) {
      return false;
    }

    return true;
  }

  // Método para habilitar/deshabilitar categorías dinámicamente
  setCategoryEnabled(category: LogCategory, enabled: boolean): void {
    this.categoryConfig[category] = enabled;
  }

  // Método para obtener estadísticas de logs
  getLogStats(): Record<string, number> {
    return { ...this.logCounters };
  }

  // Método para limpiar contadores
  clearCounters(): void {
    this.logCounters = {};
  }
} 