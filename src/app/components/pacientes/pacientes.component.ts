import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Paciente, RegisterForm, User } from '../../interfaces';
import { PacienteService } from '../../services/paciente.service';
import { RegisterService } from '../../services/register.service';
import { NotificationService } from '../../services/notification.service';
import { OdontogramaComponent } from '../odontograma/odontograma.component';
import { AdminNavbarComponent } from '../layouts/admin-navbar/admin-navbar.component';
import { DentistNavbarComponent } from '../layouts/dentist-navbar/dentist-navbar.component';
import { AuthService } from '../../services/auth.service';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TurnoService } from '../../services/turno.service';
import { Turno } from '../../interfaces';

@Component({
  selector: 'app-pacientes',
  standalone: true,
  imports: [CommonModule, FormsModule, OdontogramaComponent, AdminNavbarComponent, DentistNavbarComponent, MatIconModule, MatTooltipModule],
  templateUrl: './pacientes.component.html',
  styleUrl: './pacientes.component.css'
})
export class PacientesComponent implements OnInit {
  pacientes: Paciente[] = [];
  pacientesFiltrados: Paciente[] = [];
  isLoading: boolean = false;
  searchTerm: string = '';
  selectedPaciente: Paciente | null = null;
  user: User | null = null;
  
  // Filtros modernos
  filtroObraSocial: string = '';
  filtroEstado: string = '';

  // Modal y formulario para nuevo paciente
  showModal: boolean = false;
  isCreating: boolean = false;
  
  // Modal y formulario para editar paciente
  showEditModal: boolean = false;
  isUpdating: boolean = false;
  editPacienteForm: Partial<Paciente> = {};
  currentEditingPaciente: Paciente | null = null;
  
  pacienteForm = {
    // Datos de usuario (para autenticación)
    nombreUsuario: '',
    password: '',
    confirmPassword: '',
    tipoUsuario: 'paciente',
    email: '',
    // Datos del paciente
    nombre: '',
    apellido: '',
    dni: '',
    telefono: '',
    obraSocial: '',
    direccion: ''
  };

  // Datos de prueba para desarrollo
  testData = {
    pacientes: [
      { id: 1, nombre: 'Juan', apellido: 'Pérez', dni: '12345678', obraSocial: 'OSDE', telefono: '123456789' },
      { id: 2, nombre: 'María', apellido: 'García', dni: '87654321', obraSocial: 'Swiss Medical', telefono: '987654321' },
      { id: 3, nombre: 'Carlos', apellido: 'López', dni: '11223344', obraSocial: 'Galeno', telefono: '555666777' },
      { id: 4, nombre: 'Ana', apellido: 'Martínez', dni: '55667788', obraSocial: 'OSDE', telefono: '111222333' },
      { id: 5, nombre: 'Luis', apellido: 'Rodríguez', dni: '99887766', obraSocial: 'Swiss Medical', telefono: '444555666' }
    ]
  };

  odontogramaPaciente: any = null;
  pacienteSeleccionado: Paciente | null = null;
  showOdontograma: boolean = false;

  constructor(
    private pacienteService: PacienteService,
    private registerService: RegisterService,
    private router: Router,
    private notificationService: NotificationService,
    private authService: AuthService,
    private turnoService: TurnoService
  ) {}

  ngOnInit(): void {
    this.user = this.authService.getCurrentUser();
    this.loadPacientes();
  }

  loadPacientes(): void {
    this.isLoading = true;
    this.pacienteService.getPacientes().subscribe(
      (pacientes) => {
        this.pacientes = pacientes;
        this.pacientesFiltrados = pacientes;
        this.isLoading = false;
      },
      (error) => {
        console.error('Error cargando pacientes:', error);
        this.isLoading = false;
      }
    );
  }

  filterPacientes(): void {
    this.pacientesFiltrados = this.pacientes.filter(p => {
      const matchesSearch = !this.searchTerm ||
        (p.nombre + ' ' + p.apellido).toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        (p.dni && p.dni.toString().includes(this.searchTerm)) ||
        (p.obraSocial && p.obraSocial.toLowerCase().includes(this.searchTerm.toLowerCase()));
      const matchesObraSocial = !this.filtroObraSocial || p.obraSocial === this.filtroObraSocial;
      const matchesEstado = !this.filtroEstado || (p.estado ? p.estado === this.filtroEstado : true);
      return matchesSearch && matchesObraSocial && matchesEstado;
    });
  }

  getObraSocialClass(obraSocial: string): string {
    if (!obraSocial) return 'badge obra-social-default';
    const os = obraSocial.trim().toLowerCase();
    switch (os) {
      case 'osde': return 'badge obra-social-osde';
      case 'swiss medical': return 'badge obra-social-swiss';
      case 'galeno': return 'badge obra-social-galeno';
      case 'medicus': return 'badge obra-social-medicus';
      case 'pami': return 'badge obra-social-pami';
      case 'ioma': return 'badge obra-social-ioma';
      case 'particular': return 'badge obra-social-particular';
      default: return 'badge obra-social-default';
    }
  }

  editarPaciente(paciente: Paciente): void {
    this.currentEditingPaciente = paciente;
    this.editPacienteForm = {
      nombre: paciente.nombre,
      apellido: paciente.apellido,
      dni: paciente.dni,
      telefono: paciente.telefono || '',
      obraSocial: paciente.obraSocial
    };
    this.showEditModal = true;
  }

  eliminarPaciente(paciente: Paciente): void {
    if (confirm(`¿Estás seguro de que quieres eliminar a ${paciente.nombre} ${paciente.apellido}?`)) {
      // Usar _id de MongoDB o id dependiendo de lo que esté disponible
      const pacienteId = (paciente as any)._id || paciente.id;
      
      if (!pacienteId) {
        this.notificationService.showError('Error: No se puede identificar el paciente para eliminar');
        return;
      }

      console.log('Eliminando paciente con ID:', pacienteId);
      
      this.pacienteService.deletePaciente(pacienteId.toString()).subscribe({
        next: () => {
          console.log('Paciente eliminado exitosamente');
          this.notificationService.showSuccess('Paciente eliminado exitosamente');
          this.loadPacientes(); // Recargar la lista
        },
        error: (error) => {
          console.error('Error al eliminar paciente:', error);
          this.notificationService.showError('Error al eliminar el paciente. Por favor, intenta nuevamente.');
        }
      });
    }
  }

  // Métodos para el modal de nuevo paciente
  openCreateModal(): void {
    this.showModal = true;
    this.resetForm();
  }

  closeModal(): void {
    this.showModal = false;
    this.resetForm();
  }

  resetForm(): void {
    this.pacienteForm = {
      nombreUsuario: '',
      password: '',
      confirmPassword: '',
      tipoUsuario: 'paciente',
      email: '',
      nombre: '',
      apellido: '',
      dni: '',
      telefono: '',
      obraSocial: '',
      direccion: ''
    };
  }

  createPaciente(): void {
    if (!this.isValidForm()) {
      this.notificationService.showWarning('Por favor, completa todos los campos obligatorios');
      return;
    }

    if (this.pacienteForm.password !== this.pacienteForm.confirmPassword) {
      this.notificationService.showError('Las contraseñas no coinciden');
      return;
    }

    this.isCreating = true;

    // Preparar datos para el registro usando la estructura de RegisterForm
    const registerData: RegisterForm = {
      nombreUsuario: this.pacienteForm.nombreUsuario.trim(),
      password: this.pacienteForm.password,
      confirmPassword: this.pacienteForm.confirmPassword,
      nombre: this.pacienteForm.nombre.trim(),
      apellido: this.pacienteForm.apellido.trim(),
      telefono: this.pacienteForm.telefono.trim(),
      direccion: this.pacienteForm.direccion.trim(),
      dni: this.pacienteForm.dni.trim(),
      tipoUsuario: 'paciente',
      obraSocial: this.pacienteForm.obraSocial.trim(),
      email: this.pacienteForm.email.trim()
    };

    // Usar el RegisterService para crear el usuario completo (usuario + paciente)
    this.registerService.addUsuario(registerData).subscribe({
      next: (response) => {
        console.log('Usuario y paciente creados exitosamente:', response);
        this.isCreating = false;
        this.closeModal();
        this.notificationService.showSuccess('Paciente creado exitosamente. Se ha creado una cuenta de usuario para el paciente.');
        
        // Force page reload to ensure fresh data
        setTimeout(() => {
          window.location.reload();
        }, 500);
      },
      error: (error) => {
        console.error('Error al crear paciente:', error);
        this.isCreating = false;
        
        if (error.status === 400) {
          this.notificationService.showError('Error: Verifica que el nombre de usuario no esté en uso y que todos los datos sean válidos.');
        } else {
          this.notificationService.showError('Error al crear el paciente. Por favor, intenta nuevamente.');
        }
      }
    });
  }

  isValidForm(): boolean {
    return this.pacienteForm.nombreUsuario.trim() !== '' &&
           this.pacienteForm.password.trim() !== '' &&
           this.pacienteForm.confirmPassword.trim() !== '' &&
           this.pacienteForm.email.trim() !== '' &&
           this.pacienteForm.nombre.trim() !== '' &&
           this.pacienteForm.apellido.trim() !== '' &&
           this.pacienteForm.dni.trim() !== '' &&
           this.pacienteForm.obraSocial.trim() !== '' &&
           this.pacienteForm.password === this.pacienteForm.confirmPassword;
  }

  get canCreatePaciente(): boolean {
    return this.isValidForm() && !this.isCreating;
  }

  // Métodos para el modal de editar paciente
  closeEditModal(): void {
    this.showEditModal = false;
    this.editPacienteForm = {};
    this.currentEditingPaciente = null;
  }

  updatePaciente(): void {
    if (!this.isValidEditForm()) {
      this.notificationService.showWarning('Por favor, completa todos los campos obligatorios');
      return;
    }

    if (!this.currentEditingPaciente) {
      this.notificationService.showError('Error: No hay paciente seleccionado para editar');
      return;
    }

    this.isUpdating = true;

    // Usar _id de MongoDB o id dependiendo de lo que esté disponible
    const pacienteId = (this.currentEditingPaciente as any)._id || this.currentEditingPaciente.id;

    // Crear el objeto con los datos actualizados
    const updatedPaciente: Paciente = {
      ...this.currentEditingPaciente,
      ...this.editPacienteForm
    };

    this.pacienteService.updatePaciente(pacienteId.toString(), updatedPaciente).subscribe({
      next: (response) => {
        console.log('Paciente actualizado exitosamente:', response);
        this.isUpdating = false;
        this.closeEditModal();
        this.notificationService.showSuccess('Paciente actualizado exitosamente');
        this.loadPacientes(); // Recargar la lista
      },
      error: (error) => {
        console.error('Error al actualizar paciente:', error);
        this.isUpdating = false;
        this.notificationService.showError('Error al actualizar el paciente. Por favor, intenta nuevamente.');
      }
    });
  }

  isValidEditForm(): boolean {
    return (this.editPacienteForm.nombre?.trim() !== '' &&
           this.editPacienteForm.apellido?.trim() !== '' &&
           this.editPacienteForm.dni?.trim() !== '' &&
           this.editPacienteForm.obraSocial?.trim() !== '') || false;
  }

  get canUpdatePaciente(): boolean {
    return this.isValidEditForm() && !this.isUpdating;
  }

  abrirOdontograma(paciente: Paciente) {
    this.pacienteSeleccionado = paciente;
    const id = paciente._id || paciente.id;
    if (!id) return;
    this.pacienteService.getOdontograma(id as string).subscribe({
      next: (odonto) => {
        if (!odonto) {
          this.notificationService.showError('No se pudo cargar el odontograma del paciente.');
          return;
        }
        this.odontogramaPaciente = odonto;
        this.showOdontograma = true;
      },
      error: (err) => {
        this.notificationService.showError('Error al cargar el odontograma. Verifique su sesión o intente nuevamente.');
        this.odontogramaPaciente = null;
        this.showOdontograma = false;
      }
    });
  }

  cerrarOdontograma() {
    this.showOdontograma = false;
    this.odontogramaPaciente = null;
    this.pacienteSeleccionado = null;
  }

  verTurnosPaciente(paciente: Paciente) {
    // Aquí puedes abrir un modal, navegar o mostrar los turnos del paciente
    console.log('Ver turnos de paciente:', paciente);
  }

  goToDashboard(): void {
    const user = localStorage.getItem('user');
    let tipoUsuario = '';
    if (user) {
      try {
        tipoUsuario = JSON.parse(user).tipoUsuario;
      } catch {}
    }
    if (tipoUsuario === 'administrador') {
      this.router.navigate(['/dashboard']);
    } else if (tipoUsuario === 'dentista') {
      this.router.navigate(['/dashboard']);
    } else {
      this.router.navigate(['/dashboard']); // fallback
    }
  }

  isAdmin(): boolean {
    return this.user?.tipoUsuario === 'administrador';
  }

  isDentist(): boolean {
    return this.user?.tipoUsuario === 'dentista';
  }

  // Devuelve lista única de obras sociales para el filtro
  getObrasSociales(): string[] {
    const obras = this.pacientes.map(p => p.obraSocial).filter(Boolean);
    return Array.from(new Set(obras));
  }

  getFechaSimulada(offsetDias: number): string {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + offsetDias);
    return fecha.toISOString();
  }
}