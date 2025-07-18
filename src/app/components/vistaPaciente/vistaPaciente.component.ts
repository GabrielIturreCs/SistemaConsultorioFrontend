import { Component, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { User, Turno, Tratamiento, Paciente } from '../../interfaces';
import { ChatbotService } from '../../services/ChatBot.service';
import { ChatService } from '../../services/chat.service';
import { ChatMessage, QuickQuestion } from '../../interfaces/chatbot.interface';
import { ActionButton } from '../../interfaces/message.interface';
import { TurnoService } from '../../services/turno.service';
import { TratamientoService } from '../../services/tratamiento.service';
import { PacienteService } from '../../services/paciente.service';
import { DataRefreshService } from '../../services/data-refresh.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { NotificationService } from '../../services/notification.service';
import { FooterComponent } from '../layouts/footer/footer.component';
import { PatientNavbarComponent } from '../layouts/patient-navbar/patient-navbar.component';
import { AuthService } from '../../services/auth.service';
import { firstValueFrom } from 'rxjs';

interface PacienteStats {
  totalTurnos: number;
  turnosReservados: number;
  turnosCompletados: number;
  turnosCancelados: number;
  totalGastado: number;
  proximoTurno: Turno | null;
}

@Component({
  selector: 'app-vistaPaciente',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FooterComponent, PatientNavbarComponent],
  templateUrl: './vistaPaciente.component.html',
  styleUrls: ['./vistaPaciente.component.css']
})
export class VistaPacienteComponent implements OnInit, OnDestroy {
  user: User | null = null;
  paciente: Paciente | null = null;
  misTurnos: Turno[] = [];
  tratamientos: Tratamiento[] = [];
  isLoading = false;
  private routerSubscription!: Subscription;
  private refreshSubscription!: Subscription;

  // Estadísticas del paciente
  pacienteStats: PacienteStats = {
    totalTurnos: 0,
    turnosReservados: 0,
    turnosCompletados: 0,
    turnosCancelados: 0,
    totalGastado: 0,
    proximoTurno: null
  };

  // Chatbot properties
  @ViewChild('chatMessages') chatMessages!: ElementRef;
  chatOpen = false;
  showWelcomeBubble = false; // Nueva propiedad para la burbuja
  messages: ChatMessage[] = [];
  chatForm: FormGroup;
  isTyping = false;
  quickQuestions: QuickQuestion[] = [
    { text: '¿Cuáles son los horarios?', action: 'horarios' },
    { text: '¿Cómo reservo un turno?', action: 'reservar' },
    { text: '¿Cómo cancelo un turno?', action: 'cancelar' },
    { text: '¿Qué tratamientos ofrecen?', action: 'tratamientos' }
  ];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private chatbotService: ChatbotService,
    private chatService: ChatService,
    private turnoService: TurnoService,
    private tratamientoService: TratamientoService,
    private pacienteService: PacienteService,
    private dataRefreshService: DataRefreshService,
    private notificationService: NotificationService,
    private authService: AuthService
  ) {
    this.chatForm = this.fb.group({
      message: ['', [Validators.required, Validators.minLength(1)]]
    });
  }

  ngOnInit(): void {
    this.loadUserData();
    
    // Verificar si viene del pago exitoso
    this.checkPaymentCallback();
    
    // Suscribirse al servicio de refresh
    this.refreshSubscription = this.dataRefreshService.refresh$.subscribe((component) => {
      if (component === 'vistaPaciente' || component === 'all') {
        this.refreshData();
      }
    });
    
    // Escuchar cambios de navegación para recargar datos
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        if (event.url === '/vistaPaciente') {
          setTimeout(() => this.refreshData(), 100); // Pequeño delay para asegurar que el componente esté listo
        }
      });

    // También escuchar cuando la ventana recibe foco (útil cuando regresa de otra pestaña)
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        if (this.router.url === '/vistaPaciente') {
          this.refreshData();
        }
      });
    }

    // Inicializar chatbot y burbuja de bienvenida
    if (this.user?.tipoUsuario === 'paciente') {
      this.loadChatHistory();
      this.showWelcomeBubbleAfterDelay();
    }
  }

  ngOnDestroy(): void {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
  }

  refreshData(): void {
    this.isLoading = true;
    this.loadPacienteData();
    // loadPacienteData ya llama a loadMisTurnos(), así que no lo duplicamos
    this.loadTratamientos();
  }

  loadUserData(): void {
    // Usar AuthService para obtener el usuario actual
    this.user = this.authService.getCurrentUser();
    if (!this.user) {
      this.notificationService.showError('Tu sesión ha expirado. Por favor, vuelve a iniciar sesión.');
      this.router.navigate(['/login']);
      return;
    }
    // Verificar que sea realmente un paciente
    if (this.user?.tipoUsuario !== 'paciente') {
      this.notificationService.showError('Solo los pacientes pueden acceder a esta vista.');
      this.router.navigate(['/dashboard']);
      return;
    }
    // Si el paciente no tiene perfil completo, redirigir a completar perfil
    if (this.user?.tipoUsuario === 'paciente' && !this.user.hasCompleteProfile) {
      this.notificationService.showInfo('Por favor, completa tu perfil para continuar.');
      this.router.navigate(['/complete-profile']);
      return;
    }
    // Cargar información del paciente y luego los turnos
    this.loadPacienteData();
  }

  loadPacienteData(): void {
    if (!this.user?.id) {
      console.error('No se encontró ID de usuario');
      this.notificationService.showError('Error: No se encontró tu usuario. Por favor, vuelve a iniciar sesión.');
      return;
    }

    this.isLoading = true;
    console.log('[DEBUG] Usuario logueado:', this.user);
    // Obtener todos los pacientes y buscar el que corresponde al usuario logueado
    this.pacienteService.getPacientes().subscribe({
      next: (pacientes) => {
        console.log('[DEBUG] Pacientes obtenidos:', pacientes);
        // Buscar el paciente que tiene el userId igual al id del usuario logueado
        this.paciente = pacientes.find((p: any) => p.userId === this.user?.id?.toString()) || null;
        if (this.paciente) {
          console.log('[DEBUG] Paciente asociado encontrado:', this.paciente);
          // Si el paciente no tiene userId, asociarlo automáticamente al usuario logueado
          if (this.paciente && this.user && (!this.paciente.userId || this.paciente.userId !== this.user.id.toString())) {
            const pacienteId = String(this.paciente._id || this.paciente.id || '');
            if (!pacienteId) {
              this.notificationService.showError('No se pudo identificar tu perfil de paciente para repararlo. Contacta a la clínica.');
              return;
            }
            this.pacienteService.updatePaciente(pacienteId, { ...this.paciente, userId: this.user.id.toString() }).subscribe({
              next: (updated: any) => {
                if (this.paciente && this.user) {
                  this.paciente.userId = this.user.id.toString();
                }
                this.notificationService.showSuccess('Tu perfil fue reparado automáticamente. Ahora puedes ver y reservar turnos correctamente.');
                this.loadMisTurnos();
                this.loadTratamientos();
                this.loadChatHistory();
                this.addWelcomeMessage();
              },
              error: () => {
                this.notificationService.showError('No se pudo reparar tu perfil automáticamente. Contacta a la clínica.');
                this.loadMisTurnos();
                this.loadTratamientos();
                this.loadChatHistory();
                this.addWelcomeMessage();
              }
            });
            return;
          }
          // Una vez que tenemos el paciente, cargar sus turnos y tratamientos
          this.loadMisTurnos();
          this.loadTratamientos();
          this.loadChatHistory();
          this.addWelcomeMessage(); // Agregar mensaje después de cargar datos
        } else {
          console.warn('[DEBUG] No se encontró un paciente asociado al usuario logueado. Intentando reparación automática...');
          // Intentar buscar por email primero
          let pacienteEncontrado = null;
          if (this.user?.email) {
            pacienteEncontrado = pacientes.find((p: any) => p.email?.toLowerCase().trim() === this.user?.email?.toLowerCase().trim());
          }
          // Si no se encuentra por email, buscar por nombre y apellido
          if (!pacienteEncontrado) {
            pacienteEncontrado = pacientes.find((p: any) =>
              p.nombre?.toLowerCase().trim() === this.user?.nombre?.toLowerCase().trim() &&
              p.apellido?.toLowerCase().trim() === this.user?.apellido?.toLowerCase().trim()
            );
          }
          if (pacienteEncontrado) {
            // Reparar: actualizar el userId del paciente encontrado
            const pacienteId = String(pacienteEncontrado?._id || pacienteEncontrado?.id || '');
            if (!pacienteId) {
              this.notificationService.showError('No se pudo identificar tu perfil de paciente para repararlo. Contacta a la clínica.');
              this.isLoading = false;
              return;
            }
            this.pacienteService.updatePaciente(pacienteId, { ...pacienteEncontrado, userId: this.user!.id.toString() }).subscribe({
              next: (updated: any) => {
                this.paciente = { ...pacienteEncontrado, userId: this.user!.id.toString() };
                // Actualizar usuario en localStorage y AuthService
                this.user!.hasCompleteProfile = true;
                localStorage.setItem('user', JSON.stringify(this.user));
                if (this.user && this.authService.setCurrentUser) {
                  this.authService.setCurrentUser(this.user);
                }
                this.notificationService.showSuccess('Tu perfil fue reparado automáticamente. Ahora puedes ver y reservar turnos correctamente.');
                this.loadMisTurnos();
                this.loadTratamientos();
                this.loadChatHistory();
                this.addWelcomeMessage();
              },
              error: () => {
                this.notificationService.showError('No se pudo reparar tu perfil automáticamente. Contacta a la clínica.');
                this.loadMisTurnos();
                this.loadTratamientos();
                this.loadChatHistory();
                this.addWelcomeMessage();
              }
            });
          } else {
            // No existe paciente: crear uno automáticamente
            if (!this.user) {
              this.notificationService.showError('No se encontró tu usuario. Por favor, vuelve a iniciar sesión.');
              this.isLoading = false;
              return;
            }
            const nuevoPaciente: any = {
              nombre: this.user.nombre,
              apellido: this.user.apellido,
              dni: this.user.dni || '',
              obraSocial: this.user.obraSocial || '',
              telefono: this.user.telefono || '',
              userId: this.user.id.toString(),
              email: this.user.email || '',
              direccion: this.user.direccion || ''
            };
            this.pacienteService.createPaciente(nuevoPaciente).subscribe({
              next: (pacienteCreado: any) => {
                this.paciente = pacienteCreado;
                // Actualizar usuario en localStorage y AuthService
                this.user!.hasCompleteProfile = true;
                localStorage.setItem('user', JSON.stringify(this.user));
                if (this.user && this.authService.setCurrentUser) {
                  this.authService.setCurrentUser(this.user);
                }
                this.notificationService.showSuccess('Se creó tu perfil de paciente automáticamente. Ahora puedes ver y reservar turnos.');
                this.loadMisTurnos();
                this.loadTratamientos();
                this.loadChatHistory();
                this.addWelcomeMessage();
              },
              error: () => {
                this.notificationService.showError('No se pudo crear tu perfil automáticamente. Contacta a la clínica.');
                this.loadChatHistory();
                this.addWelcomeMessage();
                this.isLoading = false;
              }
            });
          }
        }
      },
      error: (error) => {
        console.error('Error al cargar datos del paciente:', error);
        this.notificationService.showError('Error al cargar tus datos. Intenta recargar la página o vuelve a iniciar sesión.');
        this.isLoading = false;
      }
    });
  }

  loadMisTurnos(): void {
    this.isLoading = true;
    this.turnoService.getTurnosFromAPI().subscribe({
      next: (response) => {
        const pacienteId = getPacienteIdSafe(this.paciente);
        // Filtrar los turnos solo del paciente actual
        this.misTurnos = response.turnos.filter(turno => {
          return (
            this.paciente &&
            pacienteId &&
            typeof turno.pacienteId !== 'undefined' && turno.pacienteId !== null &&
            turno.pacienteId.toString() === pacienteId
          );
        });
        this.isLoading = false;
      },
      error: (error) => {
        this.isLoading = false;
        this.notificationService.showError('Error al cargar los turnos. Por favor, intenta nuevamente.');
      }
    });
  }

  // Método para filtrar y mostrar turnos
  private filtrarYMostrarTurnos(turnos: any[], pacienteId: string): void {
    this.misTurnos = turnos.filter(turno => {
      if (
        this.paciente &&
        pacienteId &&
        typeof turno.pacienteId !== 'undefined' && turno.pacienteId !== null &&
        turno.pacienteId.toString() === pacienteId
      ) {
        return true;
      }
      // Fallback: filtrar por nombre y apellido
      if (
        this.paciente &&
        this.paciente.nombre &&
        this.paciente.apellido &&
        turno.nombre &&
        turno.apellido
      ) {
        return (
          turno.nombre.toLowerCase().trim() === this.paciente.nombre.toLowerCase().trim() &&
          turno.apellido.toLowerCase().trim() === this.paciente.apellido.toLowerCase().trim()
        );
      }
      return false;
    });

    console.log('[DEBUG] Turnos filtrados para el paciente:', this.misTurnos);
    
    if (this.misTurnos.length === 0) {
      this.notificationService.showInfo('No tienes turnos programados. ¡Reserva tu primer turno!');
    }
    
    this.calculateStats();
    this.isLoading = false;
  }

  // Método para reparar turnos huérfanos automáticamente
  private async repararTurnosHuerfanos(turnos: any[], pacienteIdCorrecto: string): Promise<void> {
    if (!this.paciente || !pacienteIdCorrecto) {
      console.log('[DEBUG] No se puede reparar turnos: paciente o pacienteId no disponible');
      return;
    }

    const turnosHuerfanos = turnos.filter(turno => {
      // Buscar turnos que coincidan por datos del paciente pero tengan un pacienteId diferente
      const coincidePorDatos = (
        turno.nombre?.toLowerCase().trim() === this.paciente!.nombre?.toLowerCase().trim() &&
        turno.apellido?.toLowerCase().trim() === this.paciente!.apellido?.toLowerCase().trim()
      );
      
      const pacienteIdDiferente = turno.pacienteId && turno.pacienteId.toString() !== pacienteIdCorrecto;
      
      return coincidePorDatos && pacienteIdDiferente;
    });

    if (turnosHuerfanos.length === 0) {
      console.log('[DEBUG] No se encontraron turnos huérfanos para reparar');
      return;
    }

    console.log(`[DEBUG] Encontrados ${turnosHuerfanos.length} turnos huérfanos para reparar:`, turnosHuerfanos);

    // Reparar cada turno huérfano
    const promesasReparacion = turnosHuerfanos.map(async (turno) => {
      try {
        console.log(`[DEBUG] Reparando turno ${turno._id || turno.id}: pacienteId ${turno.pacienteId} -> ${pacienteIdCorrecto}`);
        
        await firstValueFrom(this.turnoService.updateTurno(
          turno._id || turno.id,
          { pacienteId: pacienteIdCorrecto }
        ));
        
        console.log(`[DEBUG] Turno ${turno._id || turno.id} reparado exitosamente`);
        return { success: true, turnoId: turno._id || turno.id };
      } catch (error) {
        console.error(`[ERROR] Error al reparar turno ${turno._id || turno.id}:`, error);
        return { success: false, turnoId: turno._id || turno.id, error };
      }
    });

    const resultados = await Promise.all(promesasReparacion);
    const exitosos = resultados.filter(r => r.success).length;
    const fallidos = resultados.filter(r => !r.success).length;

    console.log(`[DEBUG] Reparación completada: ${exitosos} exitosos, ${fallidos} fallidos`);

    if (exitosos > 0) {
      this.notificationService.showSuccess(
        `Se repararon automáticamente ${exitosos} turno${exitosos > 1 ? 's' : ''} para que aparezcan correctamente.`
      );
    }

    if (fallidos > 0) {
      console.warn(`[WARN] ${fallidos} turnos no se pudieron reparar automáticamente`);
    }
  }

  loadTratamientos(): void {
    this.turnoService.getTratamientos().subscribe({
      next: (tratamientos) => {
        this.tratamientos = tratamientos;
      },
      error: (error) => {
        console.error('Error al cargar tratamientos:', error);
      }
    });
  }

  calculateStats(): void {
    this.pacienteStats.totalTurnos = this.misTurnos.length;
    this.pacienteStats.turnosReservados = this.misTurnos.filter(t => t.estado === 'reservado' || t.estado === 'pagado').length;
    this.pacienteStats.turnosCompletados = this.misTurnos.filter(t => t.estado === 'completado').length;
    this.pacienteStats.turnosCancelados = this.misTurnos.filter(t => t.estado === 'cancelado').length;
    
    // Calcular total gastado
    this.pacienteStats.totalGastado = this.misTurnos
      .filter(t => t.estado === 'completado' || t.estado === 'pagado')
      .reduce((total, turno) => total + Number(turno.precioFinal || 0), 0);
    
    // Encontrar próximo turno usando la misma lógica que getProximosTurnos()
    const proximosTurnos = this.getProximosTurnos();
    this.pacienteStats.proximoTurno = proximosTurnos.length > 0 ? proximosTurnos[0] : null;
  }

  // Navegación
  navigateToReservar(): void {
    this.router.navigate(['/reservarTurno']);
  }

  navigateToMisTurnos(): void {
    this.router.navigate(['/misTurnos']);
  }

  // Acciones de turnos
  cancelarTurno(turno: Turno): void {
    this.notificationService.showWarning('¿Estás seguro de que quieres cancelar este turno?');
    // Aquí podrías implementar una confirmación personalizada si tienes un sistema propio,
    // pero como NotificationService solo muestra mensajes, procederemos directamente:
    const turnoId = turno._id || turno.id?.toString() || '';
    if (turnoId) {
      this.turnoService.cambiarEstadoTurno(turnoId, 'cancelado').subscribe({
        next: () => {
          this.loadMisTurnos();
          this.notificationService.showSuccess('Turno cancelado exitosamente');
        },
        error: () => this.notificationService.showError('Error al cancelar el turno')
      });
    }
  }

  getStatusClass(estado: string): string {
    // Mapear 'completado' a 'pagado' visualmente
    if (estado === 'completado') return 'badge bg-primary text-white';
    switch (estado) {
      case 'reservado': return 'badge bg-info text-white';
      case 'cancelado': return 'badge bg-danger';
      case 'pendiente': return 'badge bg-secondary';
      case 'pendiente_pago': return 'badge bg-secondary text-white';
      case 'pendiente_pago_efectivo': return 'badge bg-warning text-dark';
      case 'pagado': return 'badge bg-primary text-white';
      default: return 'badge bg-secondary';
    }
  }

  getStatusText(estado: string): string {
    // Mapear 'completado' a 'pagado' visualmente
    if (estado === 'completado') return 'Pagado';
    switch (estado) {
      case 'reservado': return 'Reservado';
      case 'cancelado': return 'Cancelado';
      case 'pendiente': return 'Pendiente';
      case 'pendiente_pago': return 'Pendiente de Pago';
      case 'pendiente_pago_efectivo': return 'Pago en Efectivo';
      case 'pagado': return 'Pagado';
      default: return 'Sin estado';
    }
  }

  // Cargar historial del chat desde ChatService con localStorage
  loadChatHistory(): void {
    const history = this.chatService.getConversationHistory();
    if (history.length > 0) {
      // Convertir el historial del ChatService al formato del componente
      this.messages = history.map(msg => ({
        text: msg.content,
        isUser: msg.role === 'user',
        timestamp: msg.timestamp,
        actions: msg.actions || []
      }));
      
      // Mostrar contexto de conversación si es una continuación
      if (this.chatService.isContinuingConversation()) {
        const summary = this.chatService.getConversationSummary();
        // Conversación continuada desde otra vista
      }
    }
  }

  // Chatbot methods
  openChatFromBubble(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.showWelcomeBubble = false;
    this.chatOpen = true;
    if (this.messages.length === 0) {
      this.addWelcomeMessage();
    }
    this.scrollToBottom();
  }

  closeWelcomeBubble(event: Event): void {
    event.stopPropagation();
    this.showWelcomeBubble = false;
    // Guardar preferencia para no mostrar la burbuja nuevamente
    localStorage.setItem('welcomeBubbleShown', 'true');
  }

  private showWelcomeBubbleAfterDelay(): void {
    // Verificar si ya se mostró la burbuja anteriormente
    const bubbleShown = localStorage.getItem('welcomeBubbleShown');
    
    if (!bubbleShown) {
      setTimeout(() => {
        this.showWelcomeBubble = true;
        // Auto-ocultar después de 10 segundos
        setTimeout(() => {
          this.showWelcomeBubble = false;
        }, 10000);
      }, 2000); // Mostrar después de 2 segundos
    }
  }

  addWelcomeMessage(): void {
    const welcomeMessage: ChatMessage = {
      text: '¡Hola! Soy tu asistente virtual inteligente.\n\nEstoy aquí para ayudarte con:\n- Gestionar tus turnos (cancelar, reprogramar, ver historial)\n- Consultas sobre pagos y facturación\n- Contactar la clínica\n- Información de tratamientos y servicios\n- Actualizar tus datos personales\n\n¿En qué puedo ayudarte hoy?',
      isUser: false,
      timestamp: new Date(),
      actions: [
        {
          text: 'Ver Mis Turnos',
          action: 'navigate:/misTurnos',
          variant: 'primary'
        },
        {
          text: 'Reservar Turno',
          action: 'navigate:/reservarTurno',
          variant: 'success'
        },
        {
          text: 'Contactar Clínica',
          action: 'call:(011) 4567-8901',
          variant: 'info'
        }
      ]
    };
    this.messages.push(welcomeMessage);
  }

  toggleChat(): void {
    this.chatOpen = !this.chatOpen;
    if (this.chatOpen) {
      this.showWelcomeBubble = false; // Ocultar burbuja si se abre el chat
      if (this.messages.length === 0) {
        this.addWelcomeMessage();
      }
      setTimeout(() => {
        this.scrollToBottom();
      }, 100);
    }
  }

  onSubmit(): void {
    if (this.chatForm.valid && !this.isTyping) {
      const messageText = this.chatForm.get('message')?.value.trim();
      if (messageText) {
        this.handleHybridChat(messageText);
        this.chatForm.reset();
        
        // Sincronizar con ChatService y mostrar contexto si es necesario
        this.syncWithChatService();
        
        // Mostrar sugerencia de siguiente paso si es apropiado
        const suggestedNextStep = this.chatService.getSuggestedNextStep();
        if (suggestedNextStep) {
          console.log('Sugerencia del chatbot en vistaPaciente:', suggestedNextStep);
        }
      }
    }
  }

  handleQuickQuestion(question: QuickQuestion): void {
    this.handleHybridChat(question.text);
  }

  private handleHybridChat(message: string): void {
    // Agregar mensaje del usuario
    this.messages.push({
      text: message,
      isUser: true,
      timestamp: new Date()
    });

    this.scrollToBottom();

    // Determinar el tipo de usuario
    const userType = 'patient'; // Este componente es solo para pacientes
    
    // Verificar si es una continuación de conversación
    const isContinuing = this.chatService.isContinuingConversation();
    const lastTopic = this.chatService.getLastTopic();
    
    // Usar ChatService para generar respuesta con contexto
    const chatResponse = this.chatService.generateResponse(message, userType);
    
    // Simular typing
    this.isTyping = true;
    setTimeout(() => {
      this.messages.push({
        text: chatResponse.content,
        isUser: false,
        timestamp: new Date(),
        actions: chatResponse.actions || []
      });
      this.isTyping = false;
      this.scrollToBottom();
      
      // Sincronizar con ChatService
      this.syncWithChatService();
    }, 1000);
  }

  // Sincronizar mensajes del componente con ChatService
  private syncWithChatService(): void {
    // El ChatService ya maneja su propio historial internamente
    // Solo necesitamos asegurar que los mensajes del componente estén sincronizados
    const history = this.chatService.getConversationHistory();
    if (history.length > this.messages.length) {
      // Si hay más mensajes en ChatService, actualizar el componente
      this.messages = history.map(msg => ({
        text: msg.content,
        isUser: msg.role === 'user',
        timestamp: msg.timestamp,
        actions: msg.actions || []
      }));
    }
  }

  // Método para formatear el texto del mensaje
  formatMessageText(text: string): string {
    return text
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/###\s(.*?)(?=\n|$)/g, '<h4>$1</h4>')
      .replace(/##\s(.*?)(?=\n|$)/g, '<h3>$1</h3>')
      .replace(/#\s(.*?)(?=\n|$)/g, '<h2>$1</h2>');
  }

  // Método para manejar acciones de botones del chat
  handleChatAction(action: ActionButton): void {
    const actionType = action.action.split(':')[0];
    const actionValue = action.action.split(':').slice(1).join(':');

    switch (actionType) {
      case 'navigate':
        // Navegar a una ruta específica
        
        // Manejar navegación específica para "Mis Turnos"
        if (actionValue === '/misTurnos') {
          this.router.navigate(['/misTurnos']).then(success => {
            this.chatOpen = false;
            // Agregar mensaje de confirmación
            this.addConfirmationMessage('🎯 **Perfecto!** Te he llevado a tu sección de turnos. Aquí puedes ver todos tus turnos y cancelar cualquiera que necesites.');
          }).catch(error => {
            console.error('Error navegando a /misTurnos:', error);
          });
        } else if (actionValue === '/reservarTurno') {
          this.router.navigate(['/reservarTurno']);
          this.chatOpen = false;
          this.addConfirmationMessage('📅 **¡Excelente!** Ahora puedes reservar tu nuevo turno. Completa el formulario y confirma tu cita.');
        } else if (actionValue === '/vistaPaciente') {
          this.router.navigate(['/vistaPaciente']);
          this.chatOpen = false;
        } else {
          // Navegación general
          this.router.navigate([actionValue]);
          this.chatOpen = false;
        }
        break;
        
      case 'call':
        // Iniciar llamada telefónica
        if (typeof window !== 'undefined') {
          window.open(`tel:${actionValue}`, '_self');
          this.addConfirmationMessage(`📞 **Llamada iniciada** al ${actionValue}. Si no se abre automáticamente, puedes marcar este número desde tu teléfono.`);
        }
        break;
        
      case 'whatsapp':
        // Abrir WhatsApp
        if (typeof window !== 'undefined') {
          const whatsappUrl = `https://wa.me/${actionValue.replace(/\D/g, '')}`;
          window.open(whatsappUrl, '_blank');
          this.addConfirmationMessage(`💬 **WhatsApp abierto** para contactar al ${actionValue}. Puedes escribir tu consulta directamente.`);
        }
        break;
        
      case 'email':
        // Abrir cliente de email
        if (typeof window !== 'undefined') {
          window.open(`mailto:${actionValue}`, '_self');
          this.addConfirmationMessage(`📧 **Email abierto** para contactar a ${actionValue}. Describe tu consulta en el mensaje.`);
        }
        break;
        
      case 'map':
        // Abrir mapa con la dirección
        if (typeof window !== 'undefined') {
          const mapUrl = `https://maps.google.com/?q=${encodeURIComponent(actionValue)}`;
          window.open(mapUrl, '_blank');
          this.addConfirmationMessage(`🗺️ **Mapa abierto** con la ubicación de la clínica. Puedes ver las indicaciones para llegar.`);
        }
        break;
        
      case 'show-schedule':
        // Mostrar horarios (agregar lógica específica)
        this.showScheduleInfo();
        break;
        
      default:
        console.warn('Acción no reconocida:', action.action);
    }
  }

  // Método auxiliar para agregar mensajes de confirmación
  private addConfirmationMessage(text: string): void {
    setTimeout(() => {
      this.messages.push({
        text: text,
        isUser: false,
        timestamp: new Date()
      });
      this.scrollToBottom();
    }, 500);
  }

  // Método auxiliar para mostrar información de horarios
  private showScheduleInfo(): void {
    const scheduleMessage: ChatMessage = {
      text: `📅 **Horarios de atención:**\n\n• Lunes a Viernes: 8:00 - 20:00\n• Sábados: 8:00 - 14:00\n• Domingos: Cerrado\n\n📞 Emergencias 24/7: (011) 4567-8901`,
      isUser: false,
      timestamp: new Date()
    };
    
    this.messages.push(scheduleMessage);
    this.scrollToBottom();
  }



  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.chatMessages) {
        const element = this.chatMessages.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    }, 100);
  }

  // Navegación y utilidades
  logout(): void {
    localStorage.clear();
    this.router.navigate(['/login']);
  }

  // Método público para refrescar datos manualmente
  forceRefresh(): void {
    console.log('Forzando actualización de datos...');
    this.paciente = null;
    this.misTurnos = [];
    this.refreshData();
  }

       getUserGreeting(): string {
      if (!this.user) return 'Usuario';
      
      // Para usuarios con perfil completo (Dentista, Paciente, Administrador)
      if (this.user.nombre && this.user.apellido) {
        return `${this.user.nombre} ${this.user.apellido}`;
      } else if (this.user.nombre) {
        return this.user.nombre;
      }
      
      // Para usuarios de Google con displayName
      /*if (this.user.displayName) {
        return this.user.displayName;
      }*/
      
      // Para usuarios con solo nombreUsuario
      if (this.user.nombreUsuario) {
        return this.user.nombreUsuario.charAt(0).toUpperCase() + 
               this.user.nombreUsuario.slice(1);
      }
      
      // Último fallback
      switch (this.user.tipoUsuario) {
        case 'dentista': return 'Dentista';
        case 'administrador': return 'Administrador';
        case 'paciente': return 'Paciente';
        default: return 'Usuario';
      }
    }

    // Verificar si viene del callback de pago
  checkPaymentCallback(): void {
    this.route.queryParams.subscribe(params => {
      if (params['payment'] === 'success' && params['turnoUpdated'] === 'true') {
        console.log('🎉 Detectado retorno exitoso del pago');
        
        // Mostrar mensaje de éxito con delay
        setTimeout(() => {
          this.notificationService.showSuccess('¡Pago realizado exitosamente! Tu turno ha sido confirmado.');
        }, 500);
        
        // Forzar recarga de datos con un delay adicional para asegurar que el backend tenga los datos actualizados
        setTimeout(() => {
          this.forceDataRefresh();
        }, 1000);
        
        // Limpiar los parámetros de la URL
        this.router.navigate(['/vistaPaciente'], { replaceUrl: true });
        
      } else if (params['payment'] === 'pending') {
        console.log('⏳ Detectado pago pendiente');
        this.notificationService.showWarning('Tu pago está siendo procesado. Te notificaremos cuando se confirme.');
        setTimeout(() => {
          this.forceDataRefresh();
        }, 1000);
        this.router.navigate(['/vistaPaciente'], { replaceUrl: true });
        
      } else if (params['payment'] === 'failure') {
        console.log('❌ Detectado pago fallido');
        this.notificationService.showError('Hubo un problema con el pago. Puedes intentar nuevamente.');
        setTimeout(() => {
          this.forceDataRefresh();
        }, 1000);
        this.router.navigate(['/vistaPaciente'], { replaceUrl: true });
      }
      
      // Si hay un parámetro refresh, forzar actualización independientemente del estado
      if (params['refresh'] === 'true') {
        console.log('🔄 Parámetro refresh detectado - actualizando datos');
        setTimeout(() => {
          this.forceDataRefresh();
        }, 500);
      }
    });
  }

  // Nuevo método para forzar actualización de datos
  forceDataRefresh(): void {
    console.log('🔄 Forzando actualización completa de datos...');
    this.isLoading = true;
    
    // Recargar datos del paciente y turnos
    this.loadPacienteData();
    this.loadTratamientos();
    
    // También notificar al servicio de refresh por si otros componentes necesitan actualizarse
    this.dataRefreshService.triggerRefresh('all');
  }

  // Métodos adicionales para el nuevo diseño
  getDaysUntilAppointment(): string {
    if (!this.pacienteStats.proximoTurno?.fecha) return '0 días';
    
    const appointmentDate = new Date(this.pacienteStats.proximoTurno.fecha);
    const [hora, minuto] = (this.pacienteStats.proximoTurno.hora || '00:00').split(':');
    appointmentDate.setHours(parseInt(hora), parseInt(minuto), 0, 0);
    
    const now = new Date();
    const diffTime = appointmentDate.getTime() - now.getTime();
    
    if (diffTime < 0) {
      return '0 días';
    }
    
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (diffDays > 0) {
      return `${diffDays} día${diffDays > 1 ? 's' : ''}`;
    } else if (diffHours > 0) {
      return `${diffHours} hora${diffHours > 1 ? 's' : ''}`;
    } else {
      return 'Menos de 1 hora';
    }
  }

  getStatusIcon(estado: string): string {
    switch (estado) {
      case 'reservado': return 'schedule';
      case 'cancelado': return 'cancel';
      case 'pendiente': return 'pending';
      case 'pendiente_pago': return 'payment';
      case 'pendiente_pago_efectivo': return 'money';
      case 'pagado': return 'check_circle';
      case 'completado': return 'check_circle';
      default: return 'help';
    }
  }

  getCompletionRate(): number {
    if (this.pacienteStats.totalTurnos === 0) return 0;
    return Math.round((this.pacienteStats.turnosCompletados / this.pacienteStats.totalTurnos) * 100);
  }

  // Obtener próximos turnos (futuros) para el historial reciente
  getProximosTurnos(): Turno[] {
    const estadosProximo = ['reservado', 'pagado', 'pendiente', 'pendiente_pago', 'pendiente_pago_efectivo'];
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); // Resetear a inicio del día
    
    return this.misTurnos
      .filter(t => {
        // Solo turnos con estados activos
        if (!estadosProximo.includes(t.estado)) {
          return false;
        }
        
        // Verificar que la fecha sea futura usando la función auxiliar
        const fechaTurno = this.parseTurnoDate(t.fecha);
        if (!fechaTurno || isNaN(fechaTurno.getTime())) {
          return false;
        }
        
        // Comparar solo la fecha (sin hora) para evitar problemas con zonas horarias
        const fechaTurnoSolo = new Date(fechaTurno.getFullYear(), fechaTurno.getMonth(), fechaTurno.getDate());
        
        return fechaTurnoSolo >= hoy;
      })
      .sort((a, b) => {
        const fechaA = this.parseTurnoDate(a.fecha);
        const fechaB = this.parseTurnoDate(b.fecha);
        if (!fechaA || !fechaB) return 0;
        
        // Primero ordenar por fecha
        const fechaComparison = fechaA.getTime() - fechaB.getTime();
        if (fechaComparison !== 0) return fechaComparison;
        
        // Si la fecha es igual, ordenar por hora
        const horaA = a.hora || '00:00';
        const horaB = b.hora || '00:00';
        return horaA.localeCompare(horaB);
      })
      .slice(0, 4); // Solo los 4 próximos turnos
  }

  // Función auxiliar para parsear fechas de turnos
  private parseTurnoDate(fecha: any): Date | null {
    if (!fecha) {
      return null;
    }
    
    // Si ya es un objeto Date
    if (fecha && typeof fecha === 'object' && Object.prototype.toString.call(fecha) === '[object Date]') {
      return fecha as Date;
    }
    
    // Si es string
    if (typeof fecha === 'string') {
      let parsedDate: Date | null = null;
      
      // Formato YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}/.test(fecha)) {
        parsedDate = new Date(fecha);
      }
      // Formato DD/MM/YYYY
      else if (/^\d{2}\/\d{2}\/\d{4}/.test(fecha)) {
        const [dia, mes, anio] = fecha.split('/');
        parsedDate = new Date(`${anio}-${mes}-${dia}`);
      }
      // Otros formatos
      else {
        parsedDate = new Date(fecha);
      }
      
      // Verificar que la fecha sea válida
      if (parsedDate && !isNaN(parsedDate.getTime())) {
        return parsedDate;
      } else {
        return null;
      }
    }
    
    return null;
  }

  // Función para obtener el nombre del dentista
  getDentistaName(turno: Turno): string {
    if (turno.profesionalId && typeof turno.profesionalId === 'object' && 'nombre' in turno.profesionalId) {
      const profesional = turno.profesionalId as any;
      return `${profesional.nombre || 'Dr.'} ${profesional.apellido || ''}`.trim();
    }
    return '';
  }

  getDentistaEspecialidad(turno: Turno): string | null {
    if (turno.profesionalId && typeof turno.profesionalId === 'object' && 'especialidad' in turno.profesionalId) {
      const profesional = turno.profesionalId as any;
      return profesional.especialidad || null;
    }
    return null;
  }

  // Función para calcular el tiempo restante hasta el turno
  getTiempoRestante(turno: Turno): string {
    const fechaTurno = this.parseTurnoDate(turno.fecha);
    if (!fechaTurno || isNaN(fechaTurno.getTime())) {
      return 'Fecha no válida';
    }

    // Crear fecha completa con hora
    const [hora, minuto] = (turno.hora || '00:00').split(':');
    const fechaCompleta = new Date(fechaTurno);
    fechaCompleta.setHours(parseInt(hora), parseInt(minuto), 0, 0);

    const ahora = new Date();
    const diferencia = fechaCompleta.getTime() - ahora.getTime();

    if (diferencia < 0) {
      return 'Turno pasado';
    }

    const dias = Math.floor(diferencia / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diferencia % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutos = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60));

    if (dias > 0) {
      return `${dias} día${dias > 1 ? 's' : ''} ${horas}h ${minutos}m`;
    } else if (horas > 0) {
      return `${horas}h ${minutos}m`;
    } else {
      return `${minutos}m`;
    }
  }

  // Función para forzar recarga completa de datos
  forceReloadData(): void {
    this.isLoading = true;
    
    // Limpiar datos actuales
    this.misTurnos = [];
    this.pacienteStats = {
      totalTurnos: 0,
      turnosReservados: 0,
      turnosCompletados: 0,
      turnosCancelados: 0,
      totalGastado: 0,
      proximoTurno: null
    };
    
    // Recargar datos
    this.loadPacienteData();
  }
}

// Función auxiliar para obtener el id del paciente de forma segura
function getPacienteIdSafe(paciente: any): string {
  if (paciente && typeof paciente._id !== 'undefined' && paciente._id !== null) {
    return paciente._id.toString();
  }
  if (paciente && typeof paciente.id !== 'undefined' && paciente.id !== null) {
    return paciente.id.toString();
  }
  return '';
}

