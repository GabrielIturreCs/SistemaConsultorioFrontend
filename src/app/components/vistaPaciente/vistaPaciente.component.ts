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
    private notificationService: NotificationService
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
    if (typeof window !== 'undefined' && window.localStorage) {
      const userData = localStorage.getItem('user');
      if (userData) {
        this.user = JSON.parse(userData);
        
        // Verificar que sea realmente un paciente
        if (this.user?.tipoUsuario !== 'paciente') {
          console.warn('Usuario no es paciente, redirigiendo...');
          this.router.navigate(['/dashboard']);
          return;
        }
        
        // Cargar información del paciente y luego los turnos
        this.loadPacienteData();
      } else {
        this.router.navigate(['/login']);
      }
    }
  }

  loadPacienteData(): void {
    if (!this.user?.id) {
      console.error('No se encontró ID de usuario');
      return;
    }

    this.isLoading = true;
    
    // Obtener todos los pacientes y buscar el que corresponde al usuario logueado
    this.pacienteService.getPacientes().subscribe({
      next: (pacientes) => {
        // Buscar el paciente que tiene el userId igual al id del usuario logueado
        this.paciente = pacientes.find((p: any) => p.userId === this.user?.id?.toString()) || null;
        
        if (this.paciente) {
          // Una vez que tenemos el paciente, cargar sus turnos y tratamientos
          this.loadMisTurnos();
          this.loadTratamientos();
          this.loadChatHistory();
          this.addWelcomeMessage(); // Agregar mensaje después de cargar datos
        } else {
          console.error('No se encontró un paciente asociado al usuario logueado');
          // Intentar buscar por nombre y apellido como respaldo
          this.paciente = pacientes.find((p: any) => 
            p.nombre?.toLowerCase().trim() === this.user?.nombre?.toLowerCase().trim() &&
            p.apellido?.toLowerCase().trim() === this.user?.apellido?.toLowerCase().trim()
          ) || null;
          
          if (this.paciente) {
            this.loadMisTurnos();
            this.loadTratamientos();
            this.loadChatHistory();
            this.addWelcomeMessage(); // Agregar mensaje después de cargar datos
          } else {
            console.error('No se pudo encontrar información del paciente');
            this.loadChatHistory();
            this.addWelcomeMessage(); // Agregar mensaje genérico si no se encuentra paciente
            this.isLoading = false;
          }
        }
      },
      error: (error) => {
        console.error('Error al cargar datos del paciente:', error);
        this.isLoading = false;
      }
    });
  }

  loadMisTurnos(): void {
    this.isLoading = true;
    this.turnoService.getTurnosFromAPI().subscribe({
      next: (response) => {
        // Filtrar los turnos que pertenecen al paciente autenticado
        const pacienteId = this.paciente?._id || this.paciente?.id;
        this.misTurnos = response.turnos.filter(turno => {
          // Coincidencia por pacienteId
          if (pacienteId && turno.pacienteId) {
            if (turno.pacienteId.toString() === pacienteId.toString()) return true;
          }
          // Coincidencia por nombre y apellido (fallback)
          if (this.paciente?.nombre && this.paciente?.apellido && turno.nombre && turno.apellido) {
            const nombreMatch = turno.nombre.toLowerCase().trim() === this.paciente.nombre.toLowerCase().trim();
            const apellidoMatch = turno.apellido.toLowerCase().trim() === this.paciente.apellido.toLowerCase().trim();
            return nombreMatch && apellidoMatch;
          }
          return false;
        });
        this.calculateStats();
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error al cargar turnos:', error);
        this.isLoading = false;
      }
    });
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
    
    // Encontrar próximo turno (reservado, pagado, pendiente, pendiente_pago, pendiente_pago_efectivo en el futuro)
    const estadosProximo = ['reservado', 'pagado', 'pendiente', 'pendiente_pago', 'pendiente_pago_efectivo'];
    const hoy = new Date();
    const turnosFuturos = this.misTurnos
      .filter(t => {
        if (!estadosProximo.includes(t.estado)) return false;
        let fechaTurno: Date | null = null;
        if (t.fecha && typeof t.fecha === 'object' && Object.prototype.toString.call(t.fecha) === '[object Date]') {
          fechaTurno = t.fecha as Date;
        } else if (typeof t.fecha === 'string') {
          if (/^\d{4}-\d{2}-\d{2}/.test(t.fecha)) {
            fechaTurno = new Date(t.fecha);
          } else if (/^\d{2}\/\d{2}\/\d{4}/.test(t.fecha)) {
            const [dia, mes, anio] = t.fecha.split('/');
            fechaTurno = new Date(`${anio}-${mes}-${dia}`);
          } else {
            fechaTurno = new Date(t.fecha);
          }
        }
        if (!fechaTurno || isNaN(fechaTurno.getTime())) return false;
        return fechaTurno >= new Date(hoy.toDateString());
      })
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    this.pacienteStats.proximoTurno = turnosFuturos.length > 0 ? turnosFuturos[0] : null;
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
  getDaysUntilAppointment(): number {
    if (!this.pacienteStats.proximoTurno?.fecha) return 0;
    
    const appointmentDate = new Date(this.pacienteStats.proximoTurno.fecha);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    appointmentDate.setHours(0, 0, 0, 0);
    
    const diffTime = appointmentDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays);
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
}
