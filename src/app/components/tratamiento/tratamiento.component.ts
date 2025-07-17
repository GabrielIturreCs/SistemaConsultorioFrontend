import { Component, OnInit } from '@angular/core';
import { TratamientoService } from '../../services/tratamiento.service';
import { Tratamiento } from '../../interfaces';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../services/notification.service';
import { AdminNavbarComponent } from '../layouts/admin-navbar/admin-navbar.component';
import { DentistNavbarComponent } from '../layouts/dentist-navbar/dentist-navbar.component';
import { DentistaService } from '../../services/dentista.service';
import { NavbarComponent } from '../layouts/navbar/navbar.component';
import { PatientNavbarComponent } from '../layouts/patient-navbar/patient-navbar.component';
import { MenuNavegacionComponent } from '../menu-navegacion/menu-navegacion.component';

@Component({
  selector: 'app-tratamiento',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, AdminNavbarComponent, DentistNavbarComponent, NavbarComponent, PatientNavbarComponent, MenuNavegacionComponent],
  templateUrl: './tratamiento.component.html',
  styleUrls: ['./tratamiento.component.css']
})
export class TratamientoComponent implements OnInit {
  tratamientos: Tratamiento[] = [];
  formulario: FormGroup;
  editando: boolean = false;
  nroEditando: number | null = null;
  showModal: boolean = false;
  showDeleteModal: boolean = false;
  tratamientoAEliminar: number | null = null;

  // Variables para búsqueda, loading y filtrado
  searchText: string = '';
  filteredTratamientos: Tratamiento[] = [];
  loading: boolean = false;

  // Variables para detectar tipo de usuario
  user: any = null;
  isAdmin: boolean = false;
  isProfesional: boolean = false;

  especialistas: any[] = [];

  constructor(
    private tratamientoService: TratamientoService, 
    private fb: FormBuilder,
    private notificationService: NotificationService,
    private dentistaService: DentistaService
  ) {
    this.formulario = this.fb.group({
      nroTratamiento: ['', Validators.required],
      descripcion: ['', Validators.required],
      duracion: ['', Validators.required],
      precio: ['', [Validators.required, Validators.min(0)]]
    });
  }

  ngOnInit(): void {
    this.loadUserData();
    // Esperar a que user esté bien cargado antes de cargar tratamientos
    setTimeout(() => {
      this.cargarTratamientos();
      this.loadEspecialistas();
    }, 0);
  }

  loadUserData() {
    // Intenta primero sessionStorage, luego localStorage
    let userData = sessionStorage.getItem('user');
    if (!userData) {
      userData = localStorage.getItem('user');
    }
    if (userData) {
      this.user = JSON.parse(userData);
      this.isAdmin = this.user?.tipoUsuario === 'administrador';
      this.isProfesional = this.user?.tipoUsuario !== 'paciente' && this.user?.tipoUsuario !== 'administrador';
    }
  }

  cargarTratamientos() {
    this.loading = true;
    console.log('Usuario actual:', this.user);

    if (this.isProfesional && this.user?.id) {
      this.tratamientoService.getTratamientos(this.user.id.toString()).subscribe({
        next: (data) => {
          this.tratamientos = data;
          this.filterTratamientos();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error al cargar tratamientos del profesional:', error);
          this.loading = false;
        }
      });
    } else if (this.isAdmin) {
      this.tratamientoService.getTratamientos().subscribe({
        next: (data) => {
          this.tratamientos = data;
          this.filterTratamientos();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error al cargar tratamientos:', error);
          this.loading = false;
        }
      });
    } else {
      // Si no es profesional ni admin, limpiar la lista
      this.tratamientos = [];
      this.filteredTratamientos = [];
      this.loading = false;
    }
  }

  // Función de filtrado
  filterTratamientos() {
    const text = this.searchText ? this.searchText.toLowerCase() : '';
    this.filteredTratamientos = this.tratamientos.filter(t =>
      t.descripcion.toLowerCase().includes(text) ||
      t.duracion.toLowerCase().includes(text) ||
      ('' + t.nroTratamiento).includes(text) ||
      ('' + t.precio).includes(text)
    );
  }

  guardar() {
    if (this.formulario.invalid) return;
    
    const tratamientoData = this.formulario.value;
    
    if (this.editando && this.nroEditando !== null) {
      // Buscar el tratamiento por nroTratamiento
      const t = this.tratamientos.find(x => x.nroTratamiento === this.nroEditando);
      if (t && t._id) {
        this.tratamientoService.actualizarTratamiento(t._id, tratamientoData).subscribe({
          next: (response) => {
            if (response.status === '1') {
              this.cargarTratamientos();
              this.cancelar();
              this.notificationService.showSuccess('Tratamiento actualizado correctamente');
            } else {
              this.notificationService.showError('Error: ' + response.msg);
            }
          },
          error: (error) => {
            console.error('Error al actualizar tratamiento:', error);
            this.notificationService.showError('Error al actualizar el tratamiento. Verifique los datos e intente nuevamente.');
          }
        });
      }
    } else {
      // Crear tratamiento SOLO para el profesional logueado (no global)
      const esGlobal = false;
      const profesionalId = this.isProfesional ? this.user?.id?.toString() : undefined;
      
      this.tratamientoService.crearTratamiento(tratamientoData, profesionalId, esGlobal).subscribe({
        next: (response) => {
          if (response.status === '1') {
            this.cargarTratamientos();
            this.cancelar();
            this.notificationService.showSuccess('Tratamiento creado correctamente');
          } else {
            this.notificationService.showError('Error: ' + response.msg);
          }
        },
        error: (error) => {
          console.error('Error al crear tratamiento:', error);
          this.notificationService.showError('Error al crear el tratamiento. Verifique los datos e intente nuevamente.');
        }
      });
    }
  }

  editarPorNro(nro: number) {
    const t = this.tratamientos.find(x => x.nroTratamiento === nro);
    if (t) {
      this.editando = true;
      this.nroEditando = nro;
      this.formulario.patchValue({
        nroTratamiento: t.nroTratamiento,
        descripcion: t.descripcion,
        duracion: t.duracion,
        precio: t.precio
      });
    }
  }

  eliminarPorNro(nro: number) {
    const t = this.tratamientos.find(x => x.nroTratamiento === nro);
    if (t && t._id) {
      this.tratamientoService.eliminarTratamiento(t._id).subscribe({
        next: (response) => {
          if (response.status === '1') {
            this.cargarTratamientos();
            this.notificationService.showSuccess('Tratamiento eliminado correctamente');
          } else {
            this.notificationService.showError('Error: ' + response.msg);
          }
        },
        error: (error) => {
          console.error('Error al eliminar tratamiento:', error);
          this.notificationService.showError('Error al eliminar el tratamiento.');
        }
      });
    }
  }

  cancelar() {
    this.editando = false;
    this.nroEditando = null;
    this.formulario.reset();
  }

  loadEspecialistas(): void {
    // Usar el mismo servicio que en reservas para traer todos los profesionales
    this.dentistaService.getDentistas().subscribe({
      next: (especialistas) => this.especialistas = especialistas,
      error: () => this.especialistas = []
    });
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('rol');
    sessionStorage.removeItem('user');
    window.location.href = '/login';
  }
}
