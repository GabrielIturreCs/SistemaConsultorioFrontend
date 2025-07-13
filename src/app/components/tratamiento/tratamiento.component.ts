import { Component, OnInit } from '@angular/core';
import { TratamientoService } from '../../services/tratamiento.service';
import { Tratamiento } from '../../interfaces';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../services/notification.service';
import { AdminNavbarComponent } from '../layouts/admin-navbar/admin-navbar.component';

@Component({
  selector: 'app-tratamiento',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, AdminNavbarComponent],
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

  constructor(
    private tratamientoService: TratamientoService, 
    private fb: FormBuilder,
    private notificationService: NotificationService
  ) {
    this.formulario = this.fb.group({
      nroTratamiento: ['', Validators.required],
      descripcion: ['', Validators.required],
      duracion: ['', Validators.required],
      precio: ['', [Validators.required, Validators.min(0)]]
    });
  }

  ngOnInit() {
    this.cargarTratamientos();
  }

  cargarTratamientos() {
    this.loading = true;
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
      this.tratamientoService.crearTratamiento(tratamientoData).subscribe({
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
}
