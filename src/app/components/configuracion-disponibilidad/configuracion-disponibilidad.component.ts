import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DisponibilidadService } from '../../services/disponibilidad.service';
import { NotificationService } from '../../services/notification.service';
import { Disponibilidad, DiaNoLaborable, FranjaNoDisponible, Pausa } from '../../interfaces';
import { DentistNavbarComponent } from '../layouts/dentist-navbar/dentist-navbar.component';

@Component({
  selector: 'app-configuracion-disponibilidad',
  templateUrl: './configuracion-disponibilidad.component.html',
  styleUrls: ['./configuracion-disponibilidad.component.css'],
  imports: [CommonModule, FormsModule, DentistNavbarComponent],
  standalone: true
})
export class ConfiguracionDisponibilidadComponent implements OnInit {
  user: any = null;
  configuracion: Disponibilidad;
  isLoading: boolean = false;
  isSaving: boolean = false;
  
  // Opciones para intervalos
  intervalos = [
    { valor: 15, texto: '15 minutos' },
    { valor: 20, texto: '20 minutos' },
    { valor: 30, texto: '30 minutos' },
    { valor: 45, texto: '45 minutos' },
    { valor: 60, texto: '1 hora' }
  ];

  // Días de la semana
  diasSemana = [
    { valor: 0, nombre: 'Domingo', checked: false },
    { valor: 1, nombre: 'Lunes', checked: true },
    { valor: 2, nombre: 'Martes', checked: true },
    { valor: 3, nombre: 'Miércoles', checked: true },
    { valor: 4, nombre: 'Jueves', checked: true },
    { valor: 5, nombre: 'Viernes', checked: true },
    { valor: 6, nombre: 'Sábado', checked: true }
  ];

  // Nuevos elementos
  nuevoDiaNoLaborable: DiaNoLaborable = {
    fecha: '',
    motivo: '',
    tipo: 'otro'
  };

  nuevaFranjaNoDisponible: FranjaNoDisponible = {
    diaSemana: 1,
    horaInicio: '',
    horaFin: '',
    motivo: ''
  };

  nuevaPausa: Pausa = {
    diaSemana: 1,
    horaInicio: '',
    horaFin: '',
    motivo: ''
  };

  // Vista previa de horarios
  horariosPreview: string[] = [];

  constructor(
    private disponibilidadService: DisponibilidadService,
    private notificationService: NotificationService
  ) {
    this.configuracion = this.disponibilidadService.getConfiguracionPorDefecto();
  }

  ngOnInit(): void {
    this.loadUserData();
    this.loadConfiguracion();
  }

  loadUserData(): void {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      this.user = JSON.parse(userStr);
      if (this.user?.tipoUsuario !== 'dentista') {
        this.notificationService.showError('Solo los dentistas pueden configurar disponibilidad');
        return;
      }
    } else {
      this.notificationService.showError('Usuario no autenticado');
      return;
    }
  }

  loadConfiguracion(): void {
    if (!this.user?.id) return;

    this.isLoading = true;
    this.disponibilidadService.getDisponibilidad(this.user.id.toString()).subscribe({
      next: (response) => {
        if (response.status === '1' && response.disponibilidad) {
          this.configuracion = response.disponibilidad;
          this.actualizarDiasSemana();
          this.generarHorariosPreview();
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error cargando configuración:', error);
        this.notificationService.showError('Error al cargar la configuración');
        this.isLoading = false;
      }
    });
  }

  actualizarDiasSemana(): void {
    this.diasSemana.forEach(dia => {
      dia.checked = this.configuracion.diasLaborables.includes(dia.valor);
    });
  }

  onDiaSemanaChange(): void {
    this.configuracion.diasLaborables = this.diasSemana
      .filter(dia => dia.checked)
      .map(dia => dia.valor);
    this.generarHorariosPreview();
  }

  generarHorariosPreview(): void {
    this.horariosPreview = this.disponibilidadService.generarHorarios(this.configuracion);
  }

  agregarDiaNoLaborable(): void {
    if (!this.nuevoDiaNoLaborable.fecha || !this.nuevoDiaNoLaborable.motivo) {
      this.notificationService.showWarning('Por favor complete fecha y motivo');
      return;
    }

    this.configuracion.diasNoLaborables.push({ ...this.nuevoDiaNoLaborable });
    this.nuevoDiaNoLaborable = { fecha: '', motivo: '', tipo: 'otro' };
    this.notificationService.showSuccess('Día no laborable agregado');
  }

  eliminarDiaNoLaborable(index: number): void {
    this.configuracion.diasNoLaborables.splice(index, 1);
    this.notificationService.showSuccess('Día no laborable eliminado');
  }

  agregarFranjaNoDisponible(): void {
    if (!this.nuevaFranjaNoDisponible.horaInicio || !this.nuevaFranjaNoDisponible.horaFin) {
      this.notificationService.showWarning('Por favor complete las horas');
      return;
    }

    this.configuracion.franjasNoDisponibles.push({ ...this.nuevaFranjaNoDisponible });
    this.nuevaFranjaNoDisponible = { diaSemana: 1, horaInicio: '', horaFin: '', motivo: '' };
    this.notificationService.showSuccess('Franja no disponible agregada');
  }

  eliminarFranjaNoDisponible(index: number): void {
    this.configuracion.franjasNoDisponibles.splice(index, 1);
    this.notificationService.showSuccess('Franja no disponible eliminada');
  }

  agregarPausa(): void {
    if (!this.nuevaPausa.horaInicio || !this.nuevaPausa.horaFin) {
      this.notificationService.showWarning('Por favor complete las horas');
      return;
    }

    this.configuracion.pausas.push({ ...this.nuevaPausa });
    this.nuevaPausa = { diaSemana: 1, horaInicio: '', horaFin: '', motivo: '' };
    this.notificationService.showSuccess('Pausa agregada');
  }

  eliminarPausa(index: number): void {
    this.configuracion.pausas.splice(index, 1);
    this.notificationService.showSuccess('Pausa eliminada');
  }

  guardarConfiguracion(): void {
    if (!this.user?.id) return;

    this.isSaving = true;
    this.disponibilidadService.actualizarDisponibilidad(this.user.id.toString(), this.configuracion).subscribe({
      next: (response) => {
        if (response.status === '1') {
          this.notificationService.showSuccess('✅ Configuración guardada exitosamente');
          this.configuracion = response.disponibilidad;
        } else {
          this.notificationService.showError('Error al guardar la configuración');
        }
        this.isSaving = false;
      },
      error: (error) => {
        console.error('Error guardando configuración:', error);
        this.notificationService.showError('Error al guardar la configuración');
        this.isSaving = false;
      }
    });
  }

  getNombreDia(diaSemana: number): string {
    return this.disponibilidadService.getNombreDia(diaSemana);
  }

  getTipoDiaNoLaborable(tipo: string): string {
    const tipos = {
      'feriado': 'Feriado',
      'vacaciones': 'Vacaciones',
      'personal': 'Personal',
      'otro': 'Otro'
    };
    return tipos[tipo as keyof typeof tipos] || tipo;
  }

  getColorTipo(tipo: string): string {
    const colores = {
      'feriado': 'danger',
      'vacaciones': 'warning',
      'personal': 'info',
      'otro': 'secondary'
    };
    return colores[tipo as keyof typeof colores] || 'secondary';
  }
} 