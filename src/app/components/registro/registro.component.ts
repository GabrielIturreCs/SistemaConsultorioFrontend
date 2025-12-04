import { Component, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { RegisterForm } from '../../interfaces';
import { RegisterService } from '../../services/register.service';
import { NotificationService } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../environments/environment';

declare var google: any;

@Component({
  selector: 'app-registro',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './registro.component.html',
  styleUrl: './registro.component.css',
})
export class RegistroComponent implements AfterViewInit {
  currentView: string = 'register';
  isLoading: boolean = false;
  registerForm: FormGroup;

  constructor(
    private router: Router,
    private registerService: RegisterService,
    private fb: FormBuilder,
    private notificationService: NotificationService,
    private authService: AuthService
  ) {
    this.registerForm = this.fb.group({
      nombreUsuario: ['', [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(20),
        Validators.pattern(/^[a-zA-Z0-9_]+$/)
      ]],
      password: ['', [
        Validators.required,
        Validators.minLength(8),
        this.passwordStrengthValidator()
      ]],
      confirmPassword: ['', [Validators.required]],
      nombre: ['', [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(50),
        Validators.pattern(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
      ]],
      apellido: ['', [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(50),
        Validators.pattern(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
      ]],
      legajo: [''],
      telefono: ['', [
        Validators.required,
        Validators.pattern(/^[0-9]{10,11}$/),
        Validators.minLength(10),
        Validators.maxLength(11)
      ]],
      direccion: ['', [
        Validators.required,
        Validators.minLength(10),
        Validators.maxLength(100)
      ]],
      dni: ['', [
        Validators.required,
        Validators.pattern(/^[0-9]{7,8}$/)
      ]],
      tipoUsuario: ['paciente', [Validators.required]],
      obraSocial: [''],
      email: ['', [
        Validators.required,
        Validators.email
      ]]
    }, { validators: this.passwordMatchValidator });

    this.registerForm.get('tipoUsuario')?.valueChanges.subscribe(tipo => {
      const obraSocialControl = this.registerForm.get('obraSocial');
      const legajoControl = this.registerForm.get('legajo');
      if (tipo === 'paciente') {
        obraSocialControl?.setValidators([Validators.required]);
        legajoControl?.clearValidators();
      } else if (tipo === 'dentista') {
        legajoControl?.setValidators([Validators.required, Validators.pattern(/^[a-zA-Z0-9]+$/)]);
        obraSocialControl?.clearValidators();
      } else {
        obraSocialControl?.clearValidators();
        legajoControl?.clearValidators();
      }
      obraSocialControl?.updateValueAndValidity();
      legajoControl?.updateValueAndValidity();
    });
  }

  ngAfterViewInit(): void {
    this.initializeGoogleButton();
  }

  initializeGoogleButton(): void {
    if (typeof google === 'undefined' || !google.accounts) {
      setTimeout(() => this.initializeGoogleButton(), 100);
      return;
    }

    try {
      const clientId = environment.googleClientId;

      // @ts-ignore
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: any) => this.handleGoogleCallback(response)
      });

      // @ts-ignore
      google.accounts.id.renderButton(
        document.getElementById('google-btn-wrapper-register'),
        {
          theme: 'outline',
          size: 'large',
          width: '100%',
          text: 'signup_with',
          shape: 'rectangular',
          logo_alignment: 'left'
        }
      );
    } catch (error) {
      console.error('❌ Error initializing Google button:', error);
    }
  }

  handleGoogleCallback(response: any): void {
    console.log('🔍 Google response recibido:', response);

    if (response.credential) {
      console.log('✅ Credencial recibida, enviando al backend...');

      this.authService.googleLogin(response.credential).subscribe(
        (res) => {
          console.log('✅ Respuesta del backend:', res);

          if (res.success) {
            this.authService.setToken(res.token);
            this.authService.setCurrentUser(res.user);
            this.notificationService.showSuccess(`¡Bienvenido ${res.user.nombre || res.user.nombreUsuario || 'Usuario'}!`);
            this.authService.redirectByUserType();
          } else {
            console.error('❌ Error en respuesta del backend:', res);
            this.notificationService.showError(res.message || 'Error al iniciar sesión con Google.');
          }
        },
        (error) => {
          console.error('❌ Error de conexión con el servidor:', error);
          this.notificationService.showError('Error de conexión con el servidor al intentar Google Login.');
        }
      );
    } else {
      console.error('❌ No se recibió credencial de Google');
      this.notificationService.showError('No se recibió credencial de Google.');
    }
  }

  passwordStrengthValidator(): Validators {
    return (control: AbstractControl): ValidationErrors | null => {
      const password = control.value;
      if (!password) return null;

      const hasUpperCase = /[A-Z]/.test(password);
      const hasLowerCase = /[a-z]/.test(password);
      const hasNumbers = /\d/.test(password);
      const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

      const valid = hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar;

      return !valid ? { passwordStrength: true } : null;
    };
  }

  passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
    const password = group.get('password');
    const confirmPassword = group.get('confirmPassword');

    if (!password || !confirmPassword) return null;

    return password.value === confirmPassword.value ? null : { passwordMismatch: true };
  }

  get f() {
    return this.registerForm.controls;
  }

  get passwordStrengthMessage(): string {
    const password = this.registerForm.get('password')?.value;
    if (!password) return '';

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    const requirements = [];
    if (!hasUpperCase) requirements.push('mayúscula');
    if (!hasLowerCase) requirements.push('minúscula');
    if (!hasNumbers) requirements.push('número');
    if (!hasSpecialChar) requirements.push('carácter especial');

    return requirements.length > 0
      ? `Falta: ${requirements.join(', ')}`
      : 'Contraseña segura';
  }

  register(): void {
    if (this.registerForm.invalid) {
      this.markFormGroupTouched();
      this.notificationService.showWarning('Por favor, complete todos los campos correctamente.');
      return;
    }

    this.isLoading = true;
    const formData: RegisterForm = this.registerForm.value;

    this.registerService.addUsuario(formData).subscribe({
      next: (result: any) => {
        console.log(result);
        this.notificationService.showSuccess('¡Usuario registrado exitosamente! Ahora puede iniciar sesión.');
        this.router.navigate(['/login']);
      },
      error: (error: any) => {
        console.log(error);
        const errorMessage = error.error?.msg || error.error?.message || 'Error desconocido al registrar usuario';
        this.notificationService.showError('Error al registrar usuario: ' + errorMessage);
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  markFormGroupTouched(): void {
    Object.keys(this.registerForm.controls).forEach(key => {
      const control = this.registerForm.get(key);
      control?.markAsTouched();
    });
  }

  navigateToLogin(): void {
    this.router.navigate(['/login']);
  }

  navigateToHome(): void {
    this.router.navigate(['/']);
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.registerForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(fieldName: string): string {
    const field = this.registerForm.get(fieldName);
    if (!field || !field.errors) return '';

    if (field.errors['required']) return 'Este campo es obligatorio';
    if (field.errors['email']) return 'Formato de email inválido';
    if (field.errors['minlength']) return `Mínimo ${field.errors['minlength'].requiredLength} caracteres`;
    if (field.errors['maxlength']) return `Máximo ${field.errors['maxlength'].requiredLength} caracteres`;
    if (field.errors['pattern']) {
      switch (fieldName) {
        case 'nombreUsuario': return 'Solo letras, números y guiones bajos';
        case 'nombre':
        case 'apellido': return 'Solo letras y espacios';
        case 'telefono': return 'Formato: 3884472423 (10-11 dígitos, sin código de país)';
        case 'dni': return 'Solo números (7-8 dígitos)';
        default: return 'Formato inválido';
      }
    }
    if (field.errors['passwordStrength']) return 'La contraseña debe tener mayúscula, minúscula, número y carácter especial';

    return 'Campo inválido';
  }
}
