// Interfaces compartidas para toda la aplicación

export interface User {
  id: string;
  nombreUsuario: string;
  nombre: string;
  apellido: string;
  tipoUsuario: string;
  dni?: string;
  telefono?: string;
  direccion?: string;
  obraSocial?: string;
  email?: string;
  hasCompleteProfile?: boolean;
  needsProfileCompletion?: boolean;
  patientId?: string;
  picture?: string;
}

export interface Turno {
  id?: number | string;
  _id?: string;
  nroTurno: string | number;
  fecha: string;
  hora: string;
  estado: string;
  tratamiento: string;
  precioFinal: number | string;
  nombre?: string;
  apellido?: string;
  dni?: string;
  telefono?: string;
  duracion?: number | string;
  pacienteId?: number | string;
  tratamientoId?: number | string;
  tipoUsuario?: string;
  // Campos de pago mejorados
  paymentStatus?: string; // Estado del pago (approved, pending, rejected, refunded, cancelled)
  paymentId?: string; // ID de pago de MercadoPago
  metodoPago?: string; // Método de pago seleccionado (efectivo, online)
  fechaPago?: string | Date; // Fecha cuando se procesó el pago
  montoRecibido?: number; // Monto realmente recibido
  paymentNotificationDate?: string | Date; // Fecha de notificación del webhook
  paymentDetails?: any; // Detalles adicionales del pago
  // Campos para rastrear reprogramaciones
  fueReprogramado?: boolean; // Indica si el turno fue reprogramado
  fechaOriginal?: string; // Fecha original antes de la reprogramación
  horaOriginal?: string; // Hora original antes de la reprogramación
  fechaReprogramacion?: string | Date; // Fecha cuando se realizó la reprogramación
  motivoReprogramacion?: string; // Motivo de la reprogramación (opcional)
}

export interface Tratamiento {
  _id?: string;
  id?: number;
  nroTratamiento: number;
  descripcion: string;
  duracion: string;
  precio: number;
}

export interface Paciente {
  id: number;
  _id?: string;
  nombre: string;
  apellido: string;
  dni: string;
  obraSocial: string;
  telefono?: string;
  userId?: string;
}

export interface LoginForm {
  nombreUsuario: string;
  password: string;
  email: string;
}

export interface RegisterForm {
  nombreUsuario: string;
  password: string;
  confirmPassword: string;
  nombre: string;
  apellido: string;
  telefono: string;
  direccion: string;
  dni: string;
  tipoUsuario: string;
  obraSocial: string;
  email: string;
  legajo?: string;
}

export interface TurnoForm {
  pacienteId: string;
  fecha: string;
  hora: string;
  tratamientoId: string;
}

export interface Estadisticas {
  total: number;
  reservados: number;
  completados: number;
  cancelados: number;
  ingresos: number;
}

// Tipos de estado de turno
export type EstadoTurno = 'reservado' | 'completado' | 'cancelado';

// Tipos de usuario
export type TipoUsuario = 'administrador' | 'dentista' | 'paciente';

// Tipos de alerta
export type TipoAlerta = 'success' | 'danger' | 'warning' | 'info';

export interface Dentista {
  _id?: string;
  legajo: string;
  email: string;
  nombre: string;
  apellido: string;
  telefono: string;
  direccion: string;
  dni: string;
  userId: string;
}

// Interfaces para configuración de disponibilidad
export interface DiaNoLaborable {
  fecha: string;
  motivo: string;
  tipo: 'feriado' | 'vacaciones' | 'personal' | 'otro';
}

export interface FranjaNoDisponible {
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
  motivo: string;
}

export interface Pausa {
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
  motivo: string;
}

export interface Disponibilidad {
  _id?: string;
  dentistaId: string;
  horarioInicio: string;
  horarioFin: string;
  intervaloMinutos: 15 | 20 | 30 | 45 | 60;
  diasLaborables: number[];
  diasNoLaborables: DiaNoLaborable[];
  franjasNoDisponibles: FranjaNoDisponible[];
  pausas: Pausa[];
  duracionTurnoDefault: number;
  tiempoEntreTurnos: number;
  fechaCreacion?: Date;
  fechaActualizacion?: Date;
  activo?: boolean;
}

export interface DiaDisponibilidad {
  fecha: string;
  diaSemana: number;
  nombreDia: string;
  esLaborable: boolean;
  horariosDisponibles: string[];
  esDiaNoLaborable: boolean;
}

export interface DisponibilidadMensual {
  mes: number;
  anio: number;
  disponibilidadMensual: DiaDisponibilidad[];
  configuracion: {
    horarioInicio: string;
    horarioFin: string;
    intervaloMinutos: number;
    diasLaborables: number[];
  };
} 