import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PacienteService } from '../../services/paciente.service';
import { DentistaService } from '../../services/dentista.service';
import { RegisterService } from '../../services/register.service';
import { AdminNavbarComponent } from '../layouts/admin-navbar/admin-navbar.component';

@Component({
  selector: 'app-admin',
  imports: [FormsModule, CommonModule, AdminNavbarComponent],
  templateUrl: './administrador.component.html',
  styleUrls: ['./administrador.component.css']
})
export class AdminComponent implements OnInit {
  currentView = 'admin';
  user = { tipoUsuario: 'administrador' };
  searchTerm = '';
  filterTipo = 'todos';
  usuarios = [
    { nombre: 'Juan', apellido: 'Pérez', tipoUsuario: 'paciente', nombreUsuario: 'jperez', dni: '12345678', telefono: '123-456-7890' },
    { nombre: 'María', apellido: 'González', tipoUsuario: 'dentista', nombreUsuario: 'mgonzalez', dni: '87654321', telefono: '987-654-3210' }
  ];
  usuarioAEliminar: any;
  showDeleteModal = false;
  showEditModal = false;
  toastMessage = '';
  editingUser = { nombre: '', apellido: '', tipoUsuario: 'paciente', nombreUsuario: '', dni: '', telefono: '' };

  constructor(
    private router: Router,
    private pacienteService: PacienteService,
    private dentistaService: DentistaService,
    private registerService: RegisterService
  ) {}

  ngOnInit(): void {
    this.cargarUsuarios();
  }

  cargarUsuarios(): void {
    this.usuarios = [];
    
    // Cargar pacientes
    this.pacienteService.getPacientes().subscribe(pacientes => {
      const pacientesMapped = pacientes.map((p: any) => ({
        ...p,
        tipoUsuario: 'paciente',
        nombreUsuario: (p as any).nombreUsuario || (p as any).email || '',
        telefono: p.telefono || ''
      }));
      this.usuarios = [...this.usuarios, ...pacientesMapped];
    });
    
    // Cargar dentistas
    this.dentistaService.getDentistas().subscribe((dentistas: any[]) => {
      const dentistasMapped = dentistas.map((d: any) => ({
        ...d,
        tipoUsuario: 'dentista',
        nombreUsuario: d.nombreUsuario || d.email || '',
        telefono: d.telefono || ''
      }));
      this.usuarios = [...this.usuarios, ...dentistasMapped];
    });
    
    // Cargar administradores
    this.registerService.getUsuarios().subscribe((admins: any[]) => {
      const adminsMapped = admins.map((a: any) => ({
        ...a,
        tipoUsuario: 'administrador',
        nombreUsuario: a.nombreUsuario || a.email || '',
        telefono: a.telefono || ''
      }));
      this.usuarios = [...this.usuarios, ...adminsMapped];
    });
  }

  getUserCardClass(tipoUsuario: string) {
    return `user-card ${tipoUsuario}`;
  }

  getUserBorderClass(tipoUsuario: string) {
    if (tipoUsuario === 'administrador') return 'border-danger';
    if (tipoUsuario === 'dentista') return 'border-primary';
    if (tipoUsuario === 'secretario') return 'border-success';
    return 'border-warning';
  }

  getTipoClass(tipoUsuario: string) {
    return `badge-${tipoUsuario}`;
  }

  openDeleteModal(usuario: any) {
    this.usuarioAEliminar = usuario;
    this.showDeleteModal = true;
  }

  closeDeleteModal() {
    this.showDeleteModal = false;
    this.usuarioAEliminar = null;
  }

  confirmarEliminarUsuario() {
    this.usuarios = this.usuarios.filter(u => u !== this.usuarioAEliminar);
    this.toastMessage = 'Usuario eliminado con éxito';
    this.closeDeleteModal();
    setTimeout(() => this.toastMessage = '', 3000);
    this.cargarUsuarios();
  }

  openEditModal(usuario: any) {
    this.editingUser = { ...usuario };
    this.showEditModal = true;
  }

  closeEditModal() {
    this.showEditModal = false;
    this.editingUser = { nombre: '', apellido: '', tipoUsuario: 'paciente', nombreUsuario: '', dni: '', telefono: '' };
  }

  updateUser() {
    const index = this.usuarios.findIndex(u => u.nombreUsuario === this.editingUser.nombreUsuario);
    if (index !== -1) {
      this.usuarios[index] = { ...this.editingUser };
    }
    this.toastMessage = 'Usuario actualizado con éxito';
    this.closeEditModal();
    setTimeout(() => this.toastMessage = '', 3000);
    this.cargarUsuarios();
  }

  navigateTo(view: string) {
    this.router.navigate([view]);
  }

  get filteredUsuarios() {
    return this.usuarios.filter(usuario =>
      (usuario.nombre.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
       usuario.apellido.toLowerCase().includes(this.searchTerm.toLowerCase())) &&
      (this.filterTipo === 'todos' || usuario.tipoUsuario === this.filterTipo)
    );
  }
}