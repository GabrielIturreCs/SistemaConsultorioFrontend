import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { PacienteService } from '../../services/paciente.service';

@Component({
  selector: 'app-complete-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './complete-profile.component.html',
  styleUrls: ['./complete-profile.component.css']
})
export class CompleteProfileComponent implements OnInit {
  profileForm: FormGroup;
  currentUser: any;
  loading = false;

  obrasSociales = [
    'OSDE',
    'Swiss Medical',
    'PAMI',
    'Medicus',
    'Galeno',
    'Sancor Salud',
    'Omint',
    'Accord Salud',
    'Federada Salud',
    'Prevención Salud',
    'Instituto de Seguros de Jujuy',
    'Otra'
  ];

  constructor(
    private fb: FormBuilder,
    private pacienteService: PacienteService,
    private router: Router,
    private notificationService: NotificationService,
    private authService: AuthService
  ) {
    this.profileForm = this.fb.group({
      telefono: ['', [Validators.required, Validators.pattern(/^\d{8,15}$/)]],
      dni: ['', [Validators.required, Validators.pattern(/^\d{7,8}$/)]],
      direccion: ['', [Validators.required, Validators.minLength(5)]],
      obraSocial: ['', [Validators.required]]
    });
  }

  ngOnInit(): void {
    // Verificar si ya existe un paciente asociado al usuario
    const user = this.authService.getCurrentUser();
    if (user && user.id) {
      this.pacienteService.getPacientes().subscribe({
        next: (pacientes) => {
          const paciente = pacientes.find((p: any) => p.userId === user.id.toString());
          if (paciente) {
            // Ya existe, actualizar hasCompleteProfile y redirigir
            user.hasCompleteProfile = true;
            this.authService.setCurrentUser(user);
            this.notificationService.showInfo('Tu perfil ya está completo. Redirigiendo a tu panel...');
            this.router.navigate(['/vistaPaciente']).then(() => {
              window.location.reload();
            });
          }
          // Si no existe, mostrar el formulario normalmente
        },
        error: () => {
          // Si hay error, mostrar el formulario normalmente
        }
      });
    }
  }

  async onSubmit(): Promise<void> {
    if (this.profileForm.valid) {
      this.loading = true;
      
      try {
        // Crear el perfil de paciente
        const patientData = {
          nombre: this.currentUser.nombre || 'Usuario',
          apellido: this.currentUser.apellido || 'Google', 
          email: this.currentUser.email || '',
          telefono: this.profileForm.value.telefono,
          dni: this.profileForm.value.dni,
          direccion: this.profileForm.value.direccion,
          obraSocial: this.profileForm.value.obraSocial,
          userId: this.currentUser.id
        };

        console.log('Datos del paciente a enviar:', patientData);
        console.log('Usuario actual:', this.currentUser);
        console.log('Formulario válido:', this.profileForm.valid);
        console.log('Valores del formulario:', this.profileForm.value);
        
        // Validar que todos los campos requeridos estén presentes
        const requiredFields: (keyof typeof patientData)[] = ['nombre', 'apellido', 'email', 'telefono', 'dni', 'direccion', 'obraSocial', 'userId'];
        for (const field of requiredFields) {
          if (!patientData[field] || patientData[field].toString().trim() === '') {
            console.error(`❌ Campo faltante o vacío: ${field}`, patientData[field]);
            this.notificationService.showError(`El campo ${field} es requerido y no puede estar vacío`);
            this.loading = false;
            return;
          }
        }

        this.authService.createPatientProfile(patientData).subscribe(
          (response: any) => {
            console.log('Respuesta del servidor:', response);
            if (response.success || response._id || response.paciente) {
              // Actualizar el usuario actual
              this.currentUser.hasCompleteProfile = true;
              this.currentUser.needsProfileCompletion = false;
              this.currentUser.patientId = response._id || response.paciente?._id;
              this.currentUser.telefono = patientData.telefono;
              this.currentUser.dni = patientData.dni;
              this.currentUser.direccion = patientData.direccion;
              this.currentUser.obraSocial = patientData.obraSocial;

              // Actualizar en el servicio y localStorage
              this.authService.setCurrentUser(this.currentUser);
              
              this.notificationService.showSuccess('¡Perfil completado exitosamente!');
              this.authService.redirectByUserType();
            } else {
              this.notificationService.showError('Error al completar el perfil. Intenta nuevamente.');
            }
          },
          (error) => {
            console.error('Error creando perfil de paciente:', error);
            console.error('Error details:', error.error);
            const errorMessage = error.error?.msg || error.error?.message || 'Error al completar el perfil. Intenta nuevamente.';
            this.notificationService.showError(errorMessage);
          }
        );
      } catch (error) {
        console.error('Error en completar perfil:', error);
        this.notificationService.showError('Error al completar el perfil. Intenta nuevamente.');
      } finally {
        this.loading = false;
      }
    } else {
      this.notificationService.showError('Por favor, completa todos los campos requeridos.');
    }
  }

  // Getters para validaciones
  get telefono() { return this.profileForm.get('telefono'); }
  get dni() { return this.profileForm.get('dni'); }
  get direccion() { return this.profileForm.get('direccion'); }
  get obraSocial() { return this.profileForm.get('obraSocial'); }
}
