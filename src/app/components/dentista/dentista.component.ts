import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { User, Turno, Tratamiento, Paciente, Estadisticas, TipoAlerta, Dentista } from '../../interfaces';
import { Router } from '@angular/router';
import { TurnoService } from '../../services/turno.service';
import { PacienteService } from '../../services/paciente.service';
import { DentistaService } from '../../services/dentista.service';
import { Subject, takeUntil } from 'rxjs';
import { AdminNavbarComponent } from '../layouts/admin-navbar/admin-navbar.component';

@Component({
  selector: 'app-dentista',
  imports: [CommonModule, FormsModule, AdminNavbarComponent],
  templateUrl: './dentista.component.html',
  styleUrl: './dentista.component.css'
})
export class DentistaComponent implements OnInit, OnDestroy {

  // Estado de la aplicación
  currentView: string = 'dashboard';
  user: User | null = null;
  isLoading: boolean = false;
  isSubmitting: boolean = false;

  // Alertas
  alertVisible: boolean = false;
  currentAlertType: TipoAlerta = 'success';
  currentAlertMessage: string = '';

  // Formularios
  turnoForm = {
    pacienteId: '',
    fecha: '',
    hora: '',
    tratamientoId: ''
  };

  // Datos
  turnos: Turno[] = [];
  tratamientos: Tratamiento[] = [];
  pacientes: Paciente[] = [];
  usuarios: User[] = [];
  dentistas: Dentista[] = [];
  dentistaForm: Dentista = {
    nombre: '',
    apellido: '',
    nombreUsuario: '',
    email: '',
    especialidad: '',
    password: ''
  };
  isEditMode: boolean = false;

  // Filtros
  searchTerm: string = '';
  filterEstado: string = 'todos';
  filterTipo: string = 'todos';

  // Validación de formulario
  formErrors: { [key: string]: string } = {};

  // Para limpiar observables
  private destroy$ = new Subject<void>();

  // --- MODALES ---
  dentistaAEliminar: Dentista | null = null;
  feedbackType: 'success' | 'danger' | 'warning' = 'success';
  feedbackTitle: string = '';
  feedbackMessage: string = '';

  constructor(
    private http: HttpClient,
    private router: Router,
    private turnoService: TurnoService,
    private pacienteService: PacienteService,
    private dentistaService: DentistaService
  ) {}

  ngOnInit(): void {
    this.loadInitialData();
    this.setupUser();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadInitialData(): void {
    this.isLoading = true;
    Promise.all([
      this.loadDentistas(),
      this.loadTurnos(),
      this.loadPacientes(),
      this.loadTratamientos()
    ]).finally(() => {
      this.isLoading = false;
    });
  }

  private setupUser(): void {
    this.user = {
      id: '2',
      nombreUsuario: 'dentista1',
      nombre: 'Dr. María',
      apellido: 'González',
      tipoUsuario: 'dentista',
      dni: '12345678',
      telefono: '123456789'
    };
  }

  // Métodos de navegación
  navigateTo(view: string): void {
    this.currentView = view;
    this.clearForms();
  }

  navigateToTratamientos(): void {
    this.currentView = 'tratamientos';
  }

  // Métodos de turnos
  registrarTurno(): void {
    if (!this.canRegisterTurno) return;
    
    this.isSubmitting = true;
    const turnoData = {
      pacienteId: parseInt(this.turnoForm.pacienteId),
      fecha: this.turnoForm.fecha,
      hora: this.turnoForm.hora,
      tratamientoId: parseInt(this.turnoForm.tratamientoId)
    };

    this.turnoService.createTurno(turnoData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadTurnos();
          this.clearForms();
          this.navigateTo('dashboard');
          this.showAlert('¡Turno registrado exitosamente!', 'success');
        },
        error: (error) => {
          console.error('Error al registrar turno:', error);
          this.showAlert('Error al registrar el turno. Intente nuevamente.', 'danger');
        },
        complete: () => {
          this.isSubmitting = false;
        }
      });
  }

  cancelarTurno(turno: Turno): void {
    const turnoId = turno._id || turno.id?.toString() || '';
    if (!turnoId) {
      this.showAlert('ID de turno no válido', 'danger');
      return;
    }

    if (confirm('¿Está seguro de cancelar este turno?')) {
      this.turnoService.cambiarEstadoTurno(turnoId, 'cancelado')
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadTurnos();
            this.showAlert('Turno cancelado exitosamente.', 'warning');
          },
          error: (error) => {
            console.error('Error al cancelar turno:', error);
            this.showAlert('Error al cancelar el turno', 'danger');
          }
        });
    }
  }

  completarTurno(turno: Turno): void {
    const turnoId = turno._id || turno.id?.toString() || '';
    if (!turnoId) {
      this.showAlert('ID de turno no válido', 'danger');
      return;
    }

    this.turnoService.cambiarEstadoTurno(turnoId, 'completado')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadTurnos();
          this.showAlert('Turno completado exitosamente.', 'success');
        },
        error: (error) => {
          console.error('Error al completar turno:', error);
          this.showAlert('Error al completar el turno', 'danger');
        }
      });
  }

  clearForms(): void {
    this.turnoForm = {
      pacienteId: '',
      fecha: '',
      hora: '',
      tratamientoId: ''
    };
    this.clearFormErrors();
  }

  showAlert(message: string, type: TipoAlerta): void {
    this.currentAlertMessage = message;
    this.currentAlertType = type;
    this.alertVisible = true;
    setTimeout(() => this.closeAlert(), 5000);
  }

  closeAlert(): void {
    this.alertVisible = false;
  }

  getCurrentDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  // Validación de formulario de dentista
  validateDentistaForm(): boolean {
    this.clearFormErrors();
    let isValid = true;

    if (!this.dentistaForm.nombre?.trim()) {
      this.formErrors['nombre'] = 'El nombre es requerido';
      isValid = false;
    }

    if (!this.dentistaForm.apellido?.trim()) {
      this.formErrors['apellido'] = 'El apellido es requerido';
      isValid = false;
    }

    if (!this.dentistaForm.nombreUsuario?.trim()) {
      this.formErrors['nombreUsuario'] = 'El nombre de usuario es requerido';
      isValid = false;
    } else if (this.dentistas.some(d => d.nombreUsuario === this.dentistaForm.nombreUsuario && (!this.isEditMode || d._id !== (this.dentistaForm as any)._id))) {
      this.formErrors['nombreUsuario'] = 'El nombre de usuario ya está en uso';
      isValid = false;
    }

    if (!this.dentistaForm.email?.trim()) {
      this.formErrors['email'] = 'El email es requerido';
      isValid = false;
    } else if (!this.isValidEmail(this.dentistaForm.email)) {
      this.formErrors['email'] = 'El email no tiene un formato válido';
      isValid = false;
    }

    if (!this.dentistaForm.especialidad?.trim()) {
      this.formErrors['especialidad'] = 'La especialidad es requerida';
      isValid = false;
    }

    if (!this.dentistaForm.password?.trim()) {
      this.formErrors['password'] = 'La contraseña es requerida';
      isValid = false;
    } else {
      const pass = this.dentistaForm.password;
      if (pass.length < 6) {
        this.formErrors['password'] = 'La contraseña debe tener al menos 6 caracteres';
        isValid = false;
      } else if (!/[A-Za-z]/.test(pass)) {
        this.formErrors['password'] = 'La contraseña debe contener al menos una letra';
        isValid = false;
      } else if (!/\d/.test(pass)) {
        this.formErrors['password'] = 'La contraseña debe contener al menos un número';
        isValid = false;
      }
    }

    return isValid;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidDNI(dni: string): boolean {
    return /^\d{8}$/.test(dni);
  }

  private clearFormErrors(): void {
    this.formErrors = {};
  }

  // Getters para validaciones
  get canRegisterTurno(): boolean {
    return !!(
      this.turnoForm.pacienteId &&
      this.turnoForm.fecha &&
      this.turnoForm.hora &&
      this.turnoForm.tratamientoId
    );
  }

  // Getters para filtros
  get filteredTurnos(): Turno[] {
    let filtered = this.turnos;

    // Filtrar por búsqueda
    if (this.searchTerm) {
      const searchLower = this.searchTerm.toLowerCase();
      filtered = filtered.filter(turno =>
        String(turno.nroTurno).toLowerCase().includes(searchLower) ||
        turno.nombre?.toLowerCase().includes(searchLower) ||
        turno.apellido?.toLowerCase().includes(searchLower) ||
        turno.tratamiento.toLowerCase().includes(searchLower)
      );
    }

    // Filtrar por estado
    if (this.filterEstado !== 'todos') {
      filtered = filtered.filter(turno => turno.estado === this.filterEstado);
    }

    return filtered;
  }

  get filteredDentistas(): Dentista[] {
    let filtered = this.dentistas;
    if (this.searchTerm) {
      const searchLower = this.searchTerm.toLowerCase();
      filtered = filtered.filter(dentista =>
        (dentista.nombre?.toLowerCase().includes(searchLower) || '') ||
        (dentista.apellido?.toLowerCase().includes(searchLower) || '') ||
        (dentista.legajo?.toLowerCase().includes(searchLower) || '') ||
        (dentista.dni?.toLowerCase().includes(searchLower) || '') ||
        (dentista.email?.toLowerCase().includes(searchLower) || '')
      );
    }
    return filtered;
  }

  // Getters para estadísticas
  get totalTurnos(): number {
    return this.turnos.length;
  }

  get turnosHoy(): number {
    const today = new Date().toISOString().split('T')[0];
    return this.turnos.filter(t => t.fecha === today).length;
  }

  get proximoTurno(): Turno | null {
    const today = new Date().toISOString().split('T')[0];
    const turnosHoy = this.turnos.filter(t => t.fecha === today && t.estado === 'reservado');
    return turnosHoy.length > 0 ? turnosHoy[0] : null;
  }

  get estadisticas(): Estadisticas {
    const total = this.turnos.length;
    const reservados = this.turnos.filter(t => t.estado === 'reservado').length;
    const completados = this.turnos.filter(t => t.estado === 'completado').length;
    const cancelados = this.turnos.filter(t => t.estado === 'cancelado').length;
    const ingresos = this.turnos
      .filter(t => t.estado === 'completado')
      .reduce((sum, t) => sum + Number(t.precioFinal || 0), 0);

    return { total, reservados, completados, cancelados, ingresos };
  }

  // Métodos para clases CSS
  getStatusClass(estado: string): string {
    switch (estado) {
      case 'reservado': return 'badge bg-primary';
      case 'completado': return 'badge bg-success';
      case 'cancelado': return 'badge bg-danger';
      default: return 'badge bg-secondary';
    }
  }

  getTipoClass(tipo: string): string {
    switch (tipo) {
      case 'administrador': return 'badge bg-danger';
      case 'dentista': return 'badge bg-primary';
      case 'paciente': return 'badge bg-success';
      default: return 'badge bg-secondary';
    }
  }

  volverAlDashboardAdmin(): void {
    this.router.navigate(['/dashboard']);
  }

  // Métodos de carga de datos
  private loadTurnos(): Promise<void> {
    return new Promise((resolve) => {
      this.turnoService.getTurnosFromAPI()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => this.turnos = response.turnos,
          error: (error) => {
            console.error('Error al cargar turnos:', error);
            this.turnos = [];
          },
          complete: () => resolve()
        });
    });
  }

  private loadPacientes(): Promise<void> {
    return new Promise((resolve) => {
      this.pacienteService.getPacientes()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (pacientes) => this.pacientes = pacientes,
          error: (error) => {
            console.error('Error al cargar pacientes:', error);
            this.pacientes = [];
          },
          complete: () => resolve()
        });
    });
  }

  private loadTratamientos(): Promise<void> {
    return new Promise((resolve) => {
      this.turnoService.getTratamientos()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (tratamientos) => this.tratamientos = tratamientos,
          error: (error) => {
            console.error('Error al cargar tratamientos:', error);
            this.tratamientos = [];
          },
          complete: () => resolve()
        });
    });
  }

  // CRUD Dentistas
  private loadDentistas(): Promise<void> {
    return new Promise((resolve) => {
      this.dentistaService.getDentistas()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (dentistas) => this.dentistas = dentistas,
          error: (error) => {
            console.error('Error al cargar dentistas:', error);
            this.dentistas = [];
          },
          complete: () => resolve()
        });
    });
  }

  saveDentista(): void {
    console.log('Intentando guardar dentista:', this.dentistaForm);
    if (!this.validateDentistaForm()) {
      this.showAlert('Por favor, corrija los errores en el formulario', 'warning');
      console.warn('Validación fallida:', this.formErrors);
      return;
    }
    // Copia segura del formulario solo con los campos requeridos
    const { nombre, apellido, nombreUsuario, email, especialidad, password } = this.dentistaForm;
    const dentistaData = { nombre, apellido, nombreUsuario, email, especialidad, password };
    this.isSubmitting = true;
    console.log('Enviando datos al backend:', dentistaData);
    if (this.isEditMode) {
      this.dentistaService.updateDentista((this.dentistaForm as any)._id, dentistaData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadDentistas();
            this.showAlert('Dentista actualizado correctamente', 'success');
            this.clearDentistaForm();
          },
          error: (error: any) => {
            this.showAlert(error?.error?.msg || 'Error al actualizar dentista', 'danger');
            console.error('Error al actualizar dentista:', error);
          },
          complete: () => {
            this.isSubmitting = false;
          }
        });
    } else {
      this.dentistaService.createDentista(dentistaData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadDentistas();
            this.showAlert('Dentista creado correctamente', 'success');
            this.clearDentistaForm();
          },
          error: (error: any) => {
            this.showAlert(error?.error?.msg || 'Error al crear dentista', 'danger');
            console.error('Error al crear dentista:', error);
          },
          complete: () => {
            this.isSubmitting = false;
          }
        });
    }
  }

  editDentista(dentista: Dentista): void {
    this.dentistaForm = { ...dentista };
    this.isEditMode = true;
    this.clearFormErrors();
  }

  deleteDentista(dentista: Dentista): void {
    this.openDeleteDentistaModal(dentista);
  }

  clearDentistaForm(): void {
    this.dentistaForm = {
      nombre: '',
      apellido: '',
      nombreUsuario: '',
      email: '',
      especialidad: '',
      password: ''
    };
    this.isEditMode = false;
    this.clearFormErrors();
  }

  // --- MODAL: Confirmar eliminación ---
  openDeleteDentistaModal(dentista: Dentista): void {
    this.dentistaAEliminar = dentista;
    const modal = document.getElementById('deleteDentistaModal');
    if (modal) {
      // @ts-ignore
      const bsModal = new window.bootstrap.Modal(modal);
      bsModal.show();
    }
  }

  confirmDeleteDentista(): void {
    if (!this.dentistaAEliminar || !this.dentistaAEliminar._id) return;
    this.dentistaService.deleteDentista(this.dentistaAEliminar._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadDentistas();
          this.showFeedbackModal('success', 'Dentista eliminado', 'Dentista eliminado correctamente.');
        },
        error: (error) => {
          console.error('Error al eliminar dentista:', error);
          this.showFeedbackModal('danger', 'Error', 'Error al eliminar el dentista.');
        }
      });
    this.dentistaAEliminar = null;
    // Cerrar modal
    const modal = document.getElementById('deleteDentistaModal');
    if (modal) {
      // @ts-ignore
      window.bootstrap.Modal.getInstance(modal)?.hide();
    }
  }

  // --- MODAL: Feedback (éxito/error) ---
  showFeedbackModal(type: 'success' | 'danger' | 'warning', title: string, message: string): void {
    this.feedbackType = type;
    this.feedbackTitle = title;
    this.feedbackMessage = message;
    const modal = document.getElementById('feedbackModal');
    if (modal) {
      // @ts-ignore
      const bsModal = new window.bootstrap.Modal(modal);
      bsModal.show();
    }
  }

  // Método para obtener el nombre completo del paciente
  getPacienteNombre(pacienteId: number): string {
    const paciente = this.pacientes.find(p => p.id === pacienteId);
    return paciente ? `${paciente.nombre} ${paciente.apellido}` : 'N/A';
  }

  // Método para obtener el nombre del tratamiento
  getTratamientoNombre(tratamientoId: number): string {
    const tratamiento = this.tratamientos.find(t => t.id === tratamientoId);
    return tratamiento ? tratamiento.descripcion : 'N/A';
  }

  getUserGreeting(): string {
    if (!this.user) return 'Usuario';
    let nombre = '';
    if (this.user.nombre && this.user.apellido) {
      nombre = `${this.user.nombre} ${this.user.apellido}`;
    } else if (this.user.nombre) {
      nombre = this.user.nombre;
    } else {
      // Si no hay nombre, mostrar solo el tipo de usuario capitalizado
      nombre = this.capitalizeFirstLetter(this.user.tipoUsuario || 'Usuario');
    }
    // Mostrar el rol entre paréntesis
    return `${nombre} (${this.user.tipoUsuario})`;
  }

  capitalizeFirstLetter(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
} 