import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { GoogleCallbackComponent } from './components/login/google-callback.component';
import { ReservarComponent } from './components/reservar/reservar.component';
import { TurnosComponent } from './components/turnos/turnos.component';
import { RegistroComponent } from './components/registro/registro.component';
import { HomeComponent } from './components/layouts/home/home.component';
import { AgendaComponent } from './components/agenda/agenda.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { VistaPacienteComponent } from './components/vistaPaciente/vistaPaciente.component';
import { EstadisticaComponent } from './components/estadistica/estadistica.component';
import { AdminComponent } from './components/administrador/administrador.component';
import { PacientesComponent } from './components/pacientes/pacientes.component';
import { DentistaComponent } from './components/dentista/dentista.component';
import { TratamientoComponent } from './components/tratamiento/tratamiento.component';
import { CompleteProfileComponent } from './components/complete-profile/complete-profile.component';
import { ConfiguracionDisponibilidadComponent } from './components/configuracion-disponibilidad/configuracion-disponibilidad.component';


import { PaymentCallbackComponent } from './components/payment-callback/payment-callback.component';
import { authGuard } from './guards/auth.guard';
import { ProfileCompleteGuard } from './guards/profile-complete.guard';
import { PagoExitosoComponent } from './components/pago-exitoso/pago-exitoso.component';
import { PagoPendienteComponent } from './components/pago-pendiente/pago-pendiente.component';
import { PagoFallidoComponent } from './components/pago-fallido/pago-fallido.component';
import { PrivacyComponent } from './components/privacy/privacy.component';
import { TermsComponent } from './components/terms/terms.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'login/google-callback', component: GoogleCallbackComponent },
  { path: 'registro', component: RegistroComponent },
  { path: 'complete-profile', component: CompleteProfileComponent, canActivate: [authGuard('paciente')] },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard()] },
  { path: 'vistaPaciente', component: VistaPacienteComponent, canActivate: [authGuard('paciente'), ProfileCompleteGuard] },
  { path: 'misTurnos', component: TurnosComponent, canActivate: [authGuard('paciente'), ProfileCompleteGuard] },
  { path: 'reservarTurno', component: ReservarComponent, canActivate: [authGuard(), ProfileCompleteGuard] },
  { path: 'agenda', component: AgendaComponent, canActivate: [authGuard()] },
  { path: 'estadistica', component: EstadisticaComponent, canActivate: [authGuard('administrador')] },
  { path: 'admin', component: AdminComponent, canActivate: [authGuard('administrador')] },
  { path: 'pacientes', component: PacientesComponent, canActivate: [authGuard()] },
  { path: 'dentista', component: DentistaComponent, canActivate: [authGuard('administrador')] },
  { path: 'tratamiento', component: TratamientoComponent, canActivate: [authGuard()] },
  { path: 'configuracion-disponibilidad', component: ConfiguracionDisponibilidadComponent, canActivate: [authGuard()] },
  
  // Rutas para callbacks de MercadoPago (sin restricciones de auth)
  { path: 'payment/success', component: PaymentCallbackComponent },
  { path: 'payment/failure', component: PaymentCallbackComponent },
  { path: 'payment/pending', component: PaymentCallbackComponent },
  { path: 'payment/return', component: PaymentCallbackComponent },
  { path: 'pago/exitoso', component: PagoExitosoComponent },
  { path: 'pago/pendiente', component: PagoPendienteComponent },
  { path: 'pago/fallido', component: PagoFallidoComponent },
  
  // Rutas para política de privacidad y términos de servicio
  { path: 'privacy', component: PrivacyComponent },
  { path: 'terms', component: TermsComponent },
  
  // Ruta wildcard para 404
  { path: '**', redirectTo: '/' }
];
