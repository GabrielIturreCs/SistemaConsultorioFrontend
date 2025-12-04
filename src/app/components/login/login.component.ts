import { Component, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { User } from '../../interfaces';
import { LoginForm } from '../../interfaces';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { environment } from '../../environments/environment';

/*interface User {
  id: number;
  nombreUsuario: string;
  nombre: string;
  apellido: string;
  tipoUsuario: string;
}*/

declare var google: any;

@Component({
  selector: 'app-login',
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit, AfterViewInit {
  isLoading: boolean = false;
  msglogin: string = '';

  loginForm: LoginForm = {
    nombreUsuario: '',
    password: '',
    email: ''
  };

  // Datos de prueba
  /* testData = {
     usuarios: [
       { id: 1, nombreUsuario: 'admin', password: 'password', nombre: 'Admin', apellido: 'Sistema', tipoUsuario: 'administrador', dni: '00000000', telefono: '1100000000' },
       { id: 2, nombreUsuario: 'dentista', password: 'password', nombre: 'Dr. María', apellido: 'González', tipoUsuario: 'dentista', dni: '12345678', telefono: '123456789' },
       { id: 3, nombreUsuario: 'paciente1', password: 'password', nombre: 'Juan', apellido: 'Pérez', tipoUsuario: 'paciente', dni: '87654321', telefono: '987654321' }
     ]
   };*/

  constructor(
    private router: Router,
    private authService: AuthService,
    private notificationService: NotificationService
  ) { }

  ngOnInit(): void { }

  /*login(): void {
    if (!this.canLogin) return;

    this.isLoading = true;
    
    // Simular autenticación
    setTimeout(() => {
      const foundUser = this.testData.usuarios.find(u => 
        u.nombreUsuario === this.loginForm.nombreUsuario && 
        u.password === this.loginForm.password
      );

      if (foundUser) {
        const user = {
          id: foundUser.id,
          nombreUsuario: foundUser.nombreUsuario,
          nombre: foundUser.nombre,
          apellido: foundUser.apellido,
          tipoUsuario: foundUser.tipoUsuario
        };
        
        // Guardar en localStorage
        localStorage.setItem('token', 'fake-token-' + Date.now());
        localStorage.setItem('rol', user.tipoUsuario);
        localStorage.setItem('user', JSON.stringify(user));
        
        // Redirigir según el tipo de usuario
        this.redirectByUserType(user.tipoUsuario);
      } else {
        alert('Usuario o contraseña incorrectos.');
      }
      
      this.isLoading = false;
    }, 1000);
  }*/
  login(): void {
    if (!this.canLogin) return;

    this.isLoading = true;
    this.msglogin = '';

    this.authService.login(this.loginForm.nombreUsuario, this.loginForm.password)
      .subscribe(
        (res) => {
          console.log('🔐 Respuesta del login:', res);

          if (res.status === 1) {
            // Verificar que tengamos el token y la información del usuario
            if (res.token && res.user) {
              // Guardar token JWT y usuario usando el servicio
              this.authService.setToken(res.token);
              this.authService.setCurrentUser(res.user);

              console.log('✅ Token guardado:', res.token.substring(0, 20) + '...');
              console.log('✅ Usuario guardado:', res.user);

              // Mostrar notificación de éxito
              const nombreUsuario = res.user.nombre || res.user.nombreUsuario || 'Usuario';
              this.notificationService.showSuccess(`¡Bienvenido ${nombreUsuario}!`);

              // Redirigir según el tipo de usuario
              this.redirectByUserType(res.user.tipoUsuario);
            } else {
              console.error('❌ Respuesta del backend sin token o usuario:', res);
              this.msglogin = 'Error en la autenticación. Inténtelo de nuevo.';
              this.notificationService.showError('Error en la autenticación. Inténtelo de nuevo.');
            }
          } else {
            this.msglogin = res.msg || 'Usuario o contraseña incorrectos.';
            this.notificationService.showError(res.msg || 'Usuario o contraseña incorrectos.');
          }
          this.isLoading = false;
        },
        (error) => {
          console.error('❌ Error en login:', error);
          this.msglogin = 'Error de conexión con el servidor.';
          this.notificationService.showError('Error de conexión con el servidor. Por favor, inténtelo de nuevo.');
          this.isLoading = false;
        }
      );
  }

  ngAfterViewInit(): void {
    this.initializeGoogleButton();
  }

  initializeGoogleButton(): void {
    // Check if Google script is loaded
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

      // Render the button
      // @ts-ignore
      google.accounts.id.renderButton(
        document.getElementById('google-btn-wrapper'),
        {
          theme: 'outline',
          size: 'large',
          width: '100%',
          text: 'continue_with',
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
            // Guardar token y usuario usando el servicio
            this.authService.setToken(res.token);
            this.authService.setCurrentUser(res.user);
            this.notificationService.showSuccess(`¡Bienvenido ${res.user.nombre || res.user.nombreUsuario || 'Usuario'}!`);

            // Usar el método redirectByUserType que ya maneja el flujo de perfil incompleto
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

  // Método antiguo eliminado, ahora se usa el botón renderizado
  loginWithGoogle() {
    // Fallback manual si el botón no carga
    this.initializeGoogleButton();
  }

  navigateToRegister(): void {
    this.router.navigate(['/registro']);
  }

  navigateToHome(): void {
    this.router.navigate(['/']);
  }

  private redirectByUserType(tipoUsuario: string): void {
    switch (tipoUsuario) {
      case 'administrador':
        this.router.navigate(['/dashboard']);
        break;
      case 'paciente':
        this.router.navigate(['/vistaPaciente']); // Dashboard específico para pacientes
        break;
      default:
        // Cualquier otro tipo de usuario (especialista, dentista, etc.) va al dashboard de dentista
        this.router.navigate(['/dashboard']);
    }
  }

  get canLogin(): boolean {
    return this.loginForm.nombreUsuario.trim() !== '' &&
      this.loginForm.password.trim() !== '';
  }
}
