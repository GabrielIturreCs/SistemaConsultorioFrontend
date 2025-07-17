import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TurnoService } from '../../services/turno.service';
import { NotificationService } from '../../services/notification.service';
import { PdfExportService } from '../../services/pdf-export.service';
import { Turno } from '../../interfaces';
import { Tratamiento } from '../../interfaces';
import { DataRefreshService } from '../../services/data-refresh.service';
import { DentistNavbarComponent } from '../layouts/dentist-navbar/dentist-navbar.component';

@Component({
  selector: 'app-agenda',
  templateUrl: './agenda.component.html',
  styleUrls: ['./agenda.component.css'],
  imports: [CommonModule, FormsModule, DentistNavbarComponent],
  standalone: true
})
export class AgendaComponent implements OnInit {
  user: any | null = null; // Changed type to any as User interface is removed
  turnos: Turno[] = [];
  selectedDate: string = '';
  searchTerm: string = '';
  filterEstado: string = 'todos';
  modalTitle: string = '';
  modalMessage: string = '';
  isLoading: boolean = false;
  
  // Variables para reprogramación
  turnoSeleccionado: Turno | null = null;
  nuevaFecha: string = '';
  nuevaHora: string = '';
  horariosDisponibles: string[] = [];
  horariosOcupados: string[] = [];
  todosLosHorarios: string[] = [
    '08:00', '08:20', '08:40', '09:00', '09:20', '09:40',
    '10:00', '10:20', '10:40', '11:00', '11:20', '11:40',
    '12:00', '12:20', '12:40', '13:00', '13:20', '13:40',
    '14:00', '14:20', '14:40', '15:00', '15:20', '15:40',
    '16:00', '16:20', '16:40', '17:00', '17:20', '17:40',
    '18:00'
  ];
  isCheckingAvailability: boolean = false;
  isReprogramando: boolean = false;
  errorDisponibilidad: string = '';
  
  private refreshSubscription: any;

  constructor(
    private router: Router, 
    private turnoService: TurnoService, 
    private notificationService: NotificationService,
    private dataRefreshService: DataRefreshService,
    private pdfExportService: PdfExportService
  ) { }

  ngOnInit(): void {
    this.loadUserData();
    this.selectedDate = new Date().toISOString().split('T')[0];
    this.loadTurnosData();
    // Suscribirse a refresh global de turnos
    this.refreshSubscription = this.dataRefreshService.refresh$.subscribe((component) => {
      if (component === 'all' || component === 'agenda') {
        this.loadTurnosData();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
  }

  loadUserData(): void {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      this.router.navigate(['/login']);
      return;
    }
    this.user = JSON.parse(userStr);
    // Antes: solo dentista podía ver agenda
    // if (this.user?.tipoUsuario !== 'dentista') {
    //   this.router.navigate(['/dashboard']);
    // }
    // Ahora: cualquier profesional puede ver su agenda
    if (!this.user || this.user.tipoUsuario === 'paciente') {
      this.router.navigate(['/dashboard']);
    }
  }

  loadTurnosData(): void {
    this.isLoading = true;
    
    // Para secretarios, cargar TODOS los turnos
    if (this.user?.tipoUsuario === 'secretario') {
      console.log('👥 Secretario: Cargando TODOS los turnos');
      this.turnoService.getTurnosFromAPI().subscribe({
        next: (response) => {
          this.turnos = response.turnos;
          this.isLoading = false;
          console.log('✅ Todos los turnos cargados para secretario:', this.turnos.length);
        },
        error: (error) => {
          console.error('❌ Error cargando todos los turnos:', error);
          this.turnos = [];
          this.isLoading = false;
          this.notificationService.showError('Error al cargar todos los turnos');
        }
      });
    }
    // Para cualquier otro profesional (no secretario, no paciente), cargar solo sus turnos
    else if (this.user && this.user.tipoUsuario !== 'paciente' && this.user.tipoUsuario !== 'secretario' && this.user.id) {
      console.log('🦷 Profesional: Cargando turnos del especialista:', this.user.id);
      this.turnoService.getTurnosFromAPI({ profesionalId: this.user.id.toString() }).subscribe({
        next: (response) => {
          this.turnos = response.turnos;
          this.isLoading = false;
          console.log('✅ Turnos del especialista cargados:', this.turnos.length);
        },
        error: (error) => {
          console.error('❌ Error cargando turnos del especialista:', error);
          this.turnos = [];
          this.isLoading = false;
          this.notificationService.showError('Error al cargar los turnos');
        }
      });
    }
  }

  // Método para refrescar datos manualmente
  refreshData(): void {
    this.loadTurnosData();
    this.notificationService.showInfo('🔄 Datos actualizados');
  }

  onDateChange(): void {
    this.loadTurnosData();
  }

  navigateToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  navigateToReservar(): void {
    this.router.navigate(['/reservarTurno']);
  }

  navigateToConfiguracion(): void {
    this.router.navigate(['/configuracion-disponibilidad']);
  }

  navigateToPacientes(): void {
    this.router.navigate(['/pacientes']);
  }

  completarTurno(turno: Turno): void {
    if (confirm(`¿Marcar como completado el turno de ${turno.nombre} ${turno.apellido}?\n\nTratamiento: ${turno.tratamiento}\nPrecio: $${turno.precioFinal}`)) {
      const turnoId = turno._id || turno.id?.toString() || '';
      if (turnoId) {
        this.turnoService.cambiarEstadoTurno(turnoId, 'completado').subscribe({
          next: () => {
            this.loadTurnosData();
            this.dataRefreshService.triggerRefresh('all'); // Notificar a otros componentes
            this.notificationService.showSuccess('✅ Turno marcado como completado exitosamente');
          },
          error: (error) => {
            console.error('Error al completar turno:', error);
            this.notificationService.showError('❌ Error al completar el turno');
          }
        });
      }
    }
  }

  marcarComoPagado(turno: Turno): void {
    if (confirm(`¿Marcar como pagado el turno de ${turno.nombre} ${turno.apellido}?\n\nTratamiento: ${turno.tratamiento}\nPrecio: $${turno.precioFinal}`)) {
      const turnoId = turno._id || turno.id?.toString() || '';
      if (turnoId) {
        this.turnoService.cambiarEstadoTurno(turnoId, 'pagado').subscribe({
          next: () => {
            this.loadTurnosData();
            this.dataRefreshService.triggerRefresh('all'); // Notificar a otros componentes
            this.notificationService.showSuccess('✅ Turno marcado como pagado exitosamente');
          },
          error: (error) => {
            console.error('Error al marcar como pagado:', error);
            this.notificationService.showError('❌ Error al marcar como pagado');
          }
        });
      }
    }
  }

  marcarComoReservado(turno: Turno): void {
    if (confirm(`¿Marcar como reservado el turno de ${turno.nombre} ${turno.apellido}?\n\nTratamiento: ${turno.tratamiento}\nPrecio: $${turno.precioFinal}`)) {
      const turnoId = turno._id || turno.id?.toString() || '';
      if (turnoId) {
        this.turnoService.cambiarEstadoTurno(turnoId, 'reservado').subscribe({
          next: () => {
            this.loadTurnosData();
            this.dataRefreshService.triggerRefresh('all'); // Notificar a otros componentes
            this.notificationService.showSuccess('✅ Turno marcado como reservado exitosamente');
          },
          error: (error) => {
            console.error('Error al marcar como reservado:', error);
            this.notificationService.showError('❌ Error al marcar como reservado');
          }
        });
      }
    }
  }

  reprogramarTurno(turno: Turno): void {
    this.turnoSeleccionado = turno;
    this.nuevaFecha = '';
    this.nuevaHora = '';
    this.horariosDisponibles = [];
    this.errorDisponibilidad = '';
    this.isCheckingAvailability = false;
    this.isReprogramando = false;
    
    // Abrir el modal de reprogramación
    const modal = document.getElementById('reprogramarModal');
    if (modal) {
      const bootstrapModal = new (window as any).bootstrap.Modal(modal);
      bootstrapModal.show();
    }
  }

  // Getter para fecha mínima (hoy)
  get fechaMinima(): string {
    return new Date().toISOString().split('T')[0];
  }

  // Cargar horarios disponibles cuando se selecciona una fecha
  onFechaChange(): void {
    if (this.nuevaFecha && this.turnoSeleccionado) {
      this.cargarHorariosDisponibles();
    }
  }

  // Cargar horarios disponibles y ocupados para la fecha seleccionada
  cargarHorariosDisponibles(): void {
    if (!this.nuevaFecha || !this.turnoSeleccionado) return;

    this.isCheckingAvailability = true;
    this.errorDisponibilidad = '';
    this.horariosDisponibles = [];
    this.horariosOcupados = [];

    const dentistaId = this.user?.id?.toString() || '';
    
    // Cargar horarios ocupados y calcular disponibles
    this.turnoService.getHorariosOcupados(this.nuevaFecha, dentistaId).subscribe({
      next: (response) => {
        const horasOcupadas = response?.horasOcupadas || [];
        this.horariosOcupados = horasOcupadas;
        
        // Calcular horarios disponibles
        this.horariosDisponibles = this.todosLosHorarios.filter(hora => 
          !horasOcupadas.includes(hora)
        );
        
        this.isCheckingAvailability = false;
        console.log('Horarios disponibles:', this.horariosDisponibles);
        console.log('Horarios ocupados:', this.horariosOcupados);
      },
      error: (error) => {
        console.error('Error cargando horarios:', error);
        this.errorDisponibilidad = 'Error al cargar horarios';
        this.isCheckingAvailability = false;
        
        // Fallback: mostrar todos los horarios como disponibles
        this.horariosDisponibles = [...this.todosLosHorarios];
        this.horariosOcupados = [];
      }
    });
  }



  // Confirmar la reprogramación
  confirmarReprogramacion(): void {
    if (!this.turnoSeleccionado || !this.nuevaFecha || !this.nuevaHora) {
      this.notificationService.showError('❌ Por favor complete todos los campos');
      return;
    }

    // Verificar que el horario seleccionado no esté ocupado
    if (this.horariosOcupados.includes(this.nuevaHora)) {
      this.notificationService.showError('❌ El horario seleccionado ya está ocupado. Por favor elija otro horario.');
      return;
    }

    // Verificar que no sea el mismo horario actual
    if (this.nuevaFecha === this.turnoSeleccionado.fecha && this.nuevaHora === this.turnoSeleccionado.hora) {
      this.notificationService.showError('❌ El nuevo horario es igual al actual. No es necesario reprogramar.');
      return;
    }

    const confirmacion = confirm(
      `¿Confirmar reprogramación del turno?\n\n` +
      `Paciente: ${this.turnoSeleccionado.nombre} ${this.turnoSeleccionado.apellido}\n` +
      `Nueva fecha: ${this.nuevaFecha}\n` +
      `Nueva hora: ${this.nuevaHora}\n\n` +
      `Esta acción actualizará el turno con el nuevo horario.`
    );

    if (confirmacion) {
      this.ejecutarReprogramacion();
    }
  }

  // Ejecutar la reprogramación
  ejecutarReprogramacion(): void {
    if (!this.turnoSeleccionado) return;

    this.isReprogramando = true;
    const turnoId = this.turnoSeleccionado._id || this.turnoSeleccionado.id?.toString() || '';

    this.turnoService.reprogramarTurno(turnoId, this.nuevaFecha, this.nuevaHora).subscribe({
      next: (turnoActualizado) => {
        this.isReprogramando = false;
        
        // Cerrar el modal
        const modal = document.getElementById('reprogramarModal');
        if (modal) {
          const bootstrapModal = (window as any).bootstrap.Modal.getInstance(modal);
          if (bootstrapModal) {
            bootstrapModal.hide();
          }
        }

        // Recargar datos y notificar
        this.loadTurnosData();
        this.dataRefreshService.triggerRefresh('all');
        
        this.notificationService.showSuccess(
          `✅ Turno reprogramado exitosamente\n` +
          `Nuevo horario: ${this.nuevaFecha} a las ${this.nuevaHora}`
        );

        // Limpiar variables
        this.turnoSeleccionado = null;
        this.nuevaFecha = '';
        this.nuevaHora = '';
        this.horariosDisponibles = [];
      },
      error: (error) => {
        console.error('Error al reprogramar turno:', error);
        this.isReprogramando = false;
        this.notificationService.showError('❌ Error al reprogramar el turno');
      }
    });
  }

  cancelarTurno(turno: Turno): void {
    if (confirm(`¿Cancelar el turno de ${turno.nombre} ${turno.apellido}?\n\nFecha: ${turno.fecha} - ${turno.hora}\nTratamiento: ${turno.tratamiento}\n\nEsta acción se puede revertir.`)) {
      const turnoId = turno._id || turno.id?.toString() || '';
      if (turnoId) {
        this.turnoService.cambiarEstadoTurno(turnoId, 'cancelado').subscribe({
          next: () => {
            this.loadTurnosData();
            this.dataRefreshService.triggerRefresh('all'); // Notificar a otros componentes
            this.notificationService.showSuccess('✅ Turno cancelado exitosamente');
          },
          error: (error) => {
            console.error('Error al cancelar turno:', error);
            this.notificationService.showError('❌ Error al cancelar el turno');
          }
        });
      }
    }
  }

  verDetalles(turno: Turno): void {
    let detalles = `
📅 DETALLES DEL TURNO #${turno.nroTurno}

👤 PACIENTE:
   • Nombre: ${turno.nombre} ${turno.apellido}
   • Teléfono: ${turno.telefono || 'No especificado'}

🦷 TRATAMIENTO:
   • Descripción: ${turno.tratamiento}
   • Duración: ${turno.duracion || '30'} minutos
   • Precio: $${turno.precioFinal}

⏰ HORARIO:
   • Fecha: ${turno.fecha}
   • Hora: ${turno.hora}

📋 ESTADO: ${this.getStatusText(turno.estado).toUpperCase()}
💰 MÉTODO DE PAGO: ${turno.metodoPago || 'No especificado'}
    `.trim();

    // Agregar información de reprogramación si aplica
    if (turno.fueReprogramado) {
      detalles += `

🔄 INFORMACIÓN DE REPROGRAMACIÓN:
   • Fecha Original: ${turno.fechaOriginal || 'No disponible'}
   • Hora Original: ${turno.horaOriginal || 'No disponible'}
   • Fecha de Reprogramación: ${turno.fechaReprogramacion ? new Date(turno.fechaReprogramacion).toLocaleDateString() : 'No disponible'}
   • Motivo: ${turno.motivoReprogramacion || 'No especificado'}
      `.trim();
    }
    
    this.mostrarModal('Detalles del turno', detalles);
  }

  exportarAgenda(): void {
    try {
      // Obtener estadísticas del día actualizadas
      const turnosDelDia = this.filteredTurnos; // Usar los turnos filtrados del día
      
      const estadisticas = {
        total: turnosDelDia.length,
        completados: turnosDelDia.filter(t => t.estado === 'completado').length,
        pendientes: turnosDelDia.filter(t => t.estado === 'reservado' || t.estado === 'pendiente_pago_efectivo' || t.estado === 'pendiente_pago_online').length,
        cancelados: turnosDelDia.filter(t => t.estado === 'cancelado').length,
        ingresos: turnosDelDia.filter(t => t.estado === 'completado' || t.estado === 'pagado').reduce((total, t) => total + Number(t.precioFinal || 0), 0)
      };

      // Determinar qué turnos exportar según el filtro actual
      let turnosAExportar: Turno[];
      
      if (this.filterEstado === 'todos') {
        // Exportar todos los turnos del día
        turnosAExportar = turnosDelDia;
      } else {
        // Exportar solo los turnos del estado seleccionado
        turnosAExportar = turnosDelDia.filter(t => t.estado === this.filterEstado);
      }

      // Ordenar por hora
      turnosAExportar.sort((a, b) => a.hora.localeCompare(b.hora));
      
      // Verificar si hay turnos para exportar
      if (turnosAExportar.length === 0) {
        this.notificationService.showWarning('No hay turnos para exportar con los filtros seleccionados');
        return;
      }
      
      console.log('📊 Estadísticas para PDF:', estadisticas);
      console.log('📅 Fecha seleccionada:', this.selectedDate);
      console.log('📋 Turnos a exportar:', turnosAExportar.length);
      
      this.pdfExportService.exportarAgendaPDF(turnosAExportar, this.selectedDate, estadisticas, this.filterEstado);
      
      const mensaje = this.filterEstado === 'todos' 
        ? `Agenda completa exportada exitosamente (${turnosAExportar.length} turnos)`
        : `Agenda de turnos ${this.filterEstado} exportada exitosamente (${turnosAExportar.length} turnos)`;
      
      this.notificationService.showSuccess(mensaje);
    } catch (error) {
      console.error('Error al exportar agenda:', error);
      this.notificationService.showError('Error al exportar la agenda');
    }
  }

  mostrarModal(titulo: string, mensaje: string) {
    this.modalTitle = titulo;
    this.modalMessage = mensaje;
    const modal = new (window as any).bootstrap.Modal(document.getElementById('agendaAlertModal'));
    modal.show();
  }

  reservarTurno(turno: Turno): void {
    if (confirm('¿Confirmar que el turno ha sido reservado nuevamente?')) {
      const turnoId = turno._id || turno.id?.toString() || '';
      if (turnoId) {
        this.turnoService.cambiarEstadoTurno(turnoId, 'reservado').subscribe({
          next: () => {
            this.loadTurnosData();
            this.mostrarModal('Éxito', 'Turno marcado como reservado');
          },
          error: () => this.mostrarModal('Error', 'Error al reservar el turno')
        });
      }
    }
  }

  get filteredTurnos(): Turno[] {
    // Normalizar la fecha seleccionada a YYYY-MM-DD
    const selected = this.selectedDate.slice(0, 10);
    let filtered = this.turnos.filter(turno => {
      // Normalizar la fecha del turno a YYYY-MM-DD
      const turnoFecha = (turno.fecha || '').slice(0, 10);
      return turnoFecha === selected;
    });

    // Filtrar por búsqueda
    if (this.searchTerm.trim() !== '') {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(turno => 
        (turno.nombre?.toLowerCase().includes(search) ||
        turno.apellido?.toLowerCase().includes(search) ||
        turno.tratamiento?.toLowerCase().includes(search))
      );
    }

    // Filtrar por estado
    if (this.filterEstado !== 'todos') {
      filtered = filtered.filter(turno => turno.estado === this.filterEstado);
    }

    // Ordenar por hora
    return filtered.sort((a, b) => a.hora.localeCompare(b.hora));
  }

  get turnosHoy(): number {
    const selected = this.selectedDate.slice(0, 10);
    return this.turnos.filter(t => (t.fecha || '').slice(0, 10) === selected).length;
  }

  get turnosCompletados(): number {
    const selected = this.selectedDate.slice(0, 10);
    return this.turnos.filter(t => (t.fecha || '').slice(0, 10) === selected && t.estado === 'completado').length;
  }

  get turnosPendientes(): number {
    const selected = this.selectedDate.slice(0, 10);
    return this.turnos.filter(t => 
      (t.fecha || '').slice(0, 10) === selected && 
      (t.estado === 'reservado' || t.estado === 'pendiente_pago_efectivo' || t.estado === 'pendiente_pago_online')
    ).length;
  }

  get ingresosHoy(): number {
    const selected = this.selectedDate.slice(0, 10);
    return this.turnos
      .filter(t => (t.fecha || '').slice(0, 10) === selected && t.estado === 'completado')
      .reduce((total, t) => total + Number(t.precioFinal || 0), 0);
  }

  getStatusClass(estado: string): string {
    switch (estado) {
      case 'reservado':
        return 'badge bg-primary';
      case 'pagado':
        return 'badge bg-success';
      case 'completado':
        return 'badge bg-success';
      case 'cancelado':
        return 'badge bg-danger';
      case 'pendiente_pago_efectivo':
        return 'badge bg-warning';
      case 'pendiente_pago_online':
        return 'badge bg-info';
      default:
        return 'badge bg-secondary';
    }
  }

  getStatusIcon(estado: string): string {
    switch (estado) {
      case 'reservado':
        return 'fas fa-calendar-check';
      case 'pagado':
        return 'fas fa-money-bill-wave';
      case 'completado':
        return 'fas fa-check-circle';
      case 'cancelado':
        return 'fas fa-times-circle';
      case 'pendiente_pago_efectivo':
        return 'fas fa-clock';
      case 'pendiente_pago_online':
        return 'fas fa-credit-card';
      default:
        return 'fas fa-question-circle';
    }
  }

  getStatusText(estado: string): string {
    const estados: { [key: string]: string } = {
      'reservado': 'Reservado',
      'pagado': 'Pagado',
      'completado': 'Completado',
      'cancelado': 'Cancelado',
      'pendiente': 'Pendiente',
      'pendiente_pago_efectivo': 'Pendiente Pago Efectivo',
      'pendiente_pago_online': 'Pendiente Pago Online'
    };
    return estados[estado] || estado;
  }

  // Método para obtener el texto del estado de reprogramación
  getReprogramacionText(turno: Turno): string {
    if (turno.fueReprogramado) {
      return '🔄 Reprogramado';
    }
    return '';
  }

  // Método para obtener la clase CSS del estado de reprogramación
  getReprogramacionClass(turno: Turno): string {
    if (turno.fueReprogramado) {
      return 'badge bg-warning text-dark';
    }
    return '';
  }

  // Método para obtener información detallada de reprogramación
  getReprogramacionInfo(turno: Turno): string {
    if (turno.fueReprogramado && turno.fechaOriginal && turno.horaOriginal) {
      return `Original: ${turno.fechaOriginal} ${turno.horaOriginal}`;
    }
    return '';
  }

  // Función para calcular el tiempo restante del turno
  getTurnoTimeRemaining(turno: Turno): string {
    const now = new Date();
    const turnoDate = new Date(turno.fecha);
    const [hourStr, minuteStr] = turno.hora.split(':');
    turnoDate.setHours(parseInt(hourStr), parseInt(minuteStr), 0, 0);
    
    const diff = turnoDate.getTime() - now.getTime();
    
    if (diff < 0) {
      return 'Pasado';
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return 'Ahora';
    }
  }

  // Función para obtener el método de pago
  getPaymentMethod(turno: Turno): string {
    if (turno.metodoPago) {
      switch (turno.metodoPago) {
        case 'efectivo':
          return 'Efectivo';
        case 'tarjeta':
          return 'Tarjeta';
        case 'transferencia':
          return 'Transferencia';
        case 'mercadopago':
          return 'MercadoPago';
        default:
          return 'No especificado';
      }
    }
    return 'No especificado';
  }
}

