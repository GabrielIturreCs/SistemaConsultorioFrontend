import { Component, OnInit, ViewChild, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { User, Turno, Tratamiento, Paciente } from '../../interfaces';
import { ChatbotService } from '../../services/ChatBot.service';
import { ChatService } from '../../services/chat.service';
import { ChatMessage, QuickQuestion } from '../../interfaces/chatbot.interface';
import { ActionButton } from '../../interfaces/message.interface';
import { TurnoService } from '../../services/turno.service';
import { PacienteService } from '../../services/paciente.service';
import { NotificationService } from '../../services/notification.service';
import { DentistaService } from '../../services/dentista.service';
import { PatientNavbarComponent } from '../layouts/patient-navbar/patient-navbar.component';
import { LoggerService, LogCategory } from '../../utils/logger.service';

@Component({
  selector: 'app-turnos',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, PatientNavbarComponent],
  templateUrl: './turnos.component.html',
  styleUrl: './turnos.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TurnosComponent implements OnInit {
  currentView: string = 'turnos';
  user: User | null = null;
  pacienteActual: Paciente | null = null; // Información del paciente logueado
  turnos: Turno[] = [];
  searchTerm: string = '';
  


  // Propiedades de filtrado
  filterEstado: string = 'todos';
  filterFechaDesde: string = '';
  filterFechaHasta: string = '';
  filterPago: string = 'todos';
  filterCantidad: string = 'todos';
  isLoading: boolean = false;
  viewMode: 'cards' | 'table' = 'cards';
  
  // Chatbot properties
  @ViewChild('chatMessages') chatMessages!: ElementRef;
  chatOpen = false;
  messages: ChatMessage[] = [];
  chatForm: FormGroup;
  isTyping = false;
  showWelcomeBubble = false;
  
  quickQuestions: QuickQuestion[] = [
    { text: '¿Cuáles son los horarios?', action: 'horarios' },
    { text: '¿Qué tratamientos ofrecen?', action: 'tratamientos' },
    { text: '¿Cómo reservo un turno?', action: 'reservar' },
    { text: '¿Cómo cancelo un turno?', action: 'cancelar' }
  ];
  
  // Formulario de turno
  turnoForm = {
    pacienteId: '',
    dentistaId: '',
    fecha: '',
    hora: '',
    tratamientoId: ''
  };

  // Datos de prueba
  pacientes: Paciente[] = [];

  tratamientos: Tratamiento[] = [];

  selectedTurnoParaCancelar: any = null;
  dentistas: any[] = [];

  constructor(
    private router: Router,
    private fb: FormBuilder,
    private chatbotService: ChatbotService,
    private chatService: ChatService,
    private turnoService: TurnoService,
    private pacienteService: PacienteService,
    private notificationService: NotificationService,
    private dentistaService: DentistaService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef
  ) {
    this.chatForm = this.fb.group({
      message: ['', [Validators.required, Validators.minLength(1)]]
    });
  }

  ngOnInit(): void {
    this.loadUserData();
    this.loadTurnosData();
    this.loadPacientes();
    this.loadTratamientos();
    this.loadDentistas();
    if (this.user?.tipoUsuario === 'paciente') {
      this.currentView = 'mis-turnos';
      this.loadPacienteData(); // Cargar datos del paciente
      this.loadChatHistory();
      // Solo agregar mensaje de bienvenida si no hay historial
      if (this.messages.length === 0) {
        this.addWelcomeMessage();
      }
    }
    // Mostrar burbuja de bienvenida después de un retraso
    this.showWelcomeBubbleAfterDelay();
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
        this.logger.debug('Continuando conversación en turnos', LogCategory.CHAT, { summary });
      }
    }
  }

  // Chatbot methods
  addWelcomeMessage(): void {
    const welcomeMessage: ChatMessage = {
      text: '👋 **¡Hola! Soy tu asistente virtual inteligente.**\n\n🎯 **Estoy aquí para ayudarte con:**\n\n• 📅 **Gestionar tus turnos** (cancelar, reprogramar, ver historial)\n• 💳 **Consultas sobre pagos** y facturación\n• 📞 **Contactar la clínica** por WhatsApp o teléfono\n• 🏥 **Información de tratamientos** y servicios\n• 📋 **Actualizar tus datos** personales\n\n💬 **Puedes escribir consultas como:**\n• "Quiero cancelar un turno"\n• "¿Cuánto cuesta una limpieza?"\n• "Necesito reprogramar mi cita"\n\n**¿En qué puedo ayudarte hoy?**',
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

  // Métodos para la burbuja de bienvenida
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

  toggleChat(): void {
    this.chatOpen = !this.chatOpen;
    if (this.chatOpen) {
      this.showWelcomeBubble = false; // Ocultar burbuja si se abre el chat
      if (this.messages.length === 0) {
        this.addWelcomeMessage();
      }
    }
    this.scrollToBottom();
  }

  onSubmit(): void {
    if (this.chatForm.valid && this.chatForm.value.message.trim()) {
      const userMessage: ChatMessage = {
        text: this.chatForm.value.message,
        isUser: true,
        timestamp: new Date()
      };
      
      this.messages.push(userMessage);
      this.handleHybridChat(userMessage.text);
      this.chatForm.patchValue({ message: '' });
      this.scrollToBottom();
      
      // Sincronizar con ChatService y mostrar contexto si es necesario
      this.syncWithChatService();
      
      // Mostrar sugerencia de siguiente paso si es apropiado
      const suggestedNextStep = this.chatService.getSuggestedNextStep();
      if (suggestedNextStep) {
        console.log('Sugerencia del chatbot en turnos:', suggestedNextStep);
      }
    }
  }

  handleQuickQuestion(question: QuickQuestion): void {
    const userMessage: ChatMessage = {
      text: question.text,
      isUser: true,
      timestamp: new Date()
    };
    
    this.messages.push(userMessage);
    this.handleHybridChat(question.text);
    this.scrollToBottom();
  }

  private handleHybridChat(message: string): void {
    this.isTyping = true;
    
    // Determinar el tipo de usuario
    const userType = this.user?.tipoUsuario === 'dentista' ? 'dentist' : 'patient';
    
    // Verificar si es una continuación de conversación
    const isContinuing = this.chatService.isContinuingConversation();
    const lastTopic = this.chatService.getLastTopic();
    
    // Usar ChatService para generar respuesta con contexto
    const chatResponse = this.chatService.generateResponse(message, userType);
    console.log('Respuesta del ChatService:', chatResponse);
    
    setTimeout(() => {
      const botMessage: ChatMessage = {
        text: chatResponse.content,
        isUser: false,
        timestamp: new Date(),
        actions: chatResponse.actions || []
      };
      console.log('Mensaje del bot con acciones:', botMessage);
      this.messages.push(botMessage);
      this.isTyping = false;
      this.scrollToBottom();
      
      // Sincronizar con ChatService
      this.syncWithChatService();
      
      // Log del contexto para debugging
      if (isContinuing && lastTopic) {
        console.log(`Continuando conversación en turnos sobre: ${lastTopic}`);
      }
    }, 800);
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



  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.chatMessages) {
        this.chatMessages.nativeElement.scrollTop = this.chatMessages.nativeElement.scrollHeight;
      }
    }, 100);
  }

  loadUserData(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        this.user = JSON.parse(userStr);
      } else {
        this.router.navigate(['/login']);
      }
    }
  }

  // Función temporal para debugging - forzar recarga de turnos
  // Métodos de paginación
  onFilterChange(): void {
    this.loadTurnosData();
  }

  forceReloadTurnos(): void {
    this.loadTurnosData();
  }

  loadTurnosData(): void {
    this.isLoading = true;
    
    // Preparar parámetros de filtrado
    const params: any = {};

    // Filtrar por paciente si el usuario es paciente
    if (this.user?.tipoUsuario === 'paciente' && this.pacienteActual) {
      params.pacienteId = this.pacienteActual._id || this.pacienteActual.id;
    }

    // Aplicar filtros adicionales
    if (this.filterEstado !== 'todos') {
      params.estado = this.filterEstado;
    }
    if (this.filterFechaDesde) {
      params.fecha = this.filterFechaDesde;
    }

    // Forzar recarga desde backend para obtener el estado actualizado
    this.turnoService.getTurnosFromAPI(params).subscribe({
      next: (response) => {
        this.turnos = response.turnos;
        this.isLoading = false;
        // Forzar detección de cambios con OnPush
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.logger.error('Error cargando turnos', LogCategory.API, error);
        this.turnos = [];
        this.isLoading = false;
      }
    });
  }

  loadPacientes(): void {
    this.pacienteService.getPacientes().subscribe({
      next: (pacientes) => this.pacientes = pacientes,
      error: () => this.pacientes = []
    });
  }

  loadTratamientos(): void {
    this.turnoService.getTratamientos().subscribe({
      next: (tratamientos) => this.tratamientos = tratamientos,
      error: () => this.tratamientos = []
    });
  }

  loadDentistas(): void {
    this.dentistaService.getDentistas().subscribe({
      next: (dentistas) => this.dentistas = dentistas,
      error: () => this.dentistas = []
    });
  }

  loadPacienteData(): void {
    if (!this.user?.id) {
      console.warn('⚠️ No hay user.id disponible para cargar datos del paciente');
      return;
    }
    
    this.pacienteService.getPacientes().subscribe({
      next: (pacientes) => {
        // Buscar el paciente que corresponde al usuario logueado
        this.pacienteActual = pacientes.find(p => p.userId === this.user?.id.toString()) || null;
        
        if (this.pacienteActual) {
          
          // Configurar el formulario con el pacienteId correcto
          this.turnoForm.pacienteId = this.pacienteActual._id || this.pacienteActual.id?.toString() || '';
          
          // Recargar turnos después de obtener los datos del paciente
          if (this.currentView === 'mis-turnos') {
            this.loadTurnosData();
          }
          // Forzar detección de cambios con OnPush
          this.cdr.detectChanges();
        } else {
          console.warn('⚠️ No se encontró información del paciente para el usuario:', this.user?.id);
        }
      },
      error: (error) => {
        console.error('❌ Error al cargar datos del paciente:', error);
      }
    });
  }

  navigateToDashboard(): void {
    // Redirigir según el tipo de usuario
    if (this.user?.tipoUsuario === 'paciente') {
      this.router.navigate(['/vistaPaciente']);
    } else {
      // Para dentistas y administradores
      this.router.navigate(['/dashboard']);
    }
  }

  navigateTo(view: string): void {
    this.currentView = view;
    
    // Si navegamos a mis-turnos, recargar los datos para asegurar que estén actualizados
    if (view === 'mis-turnos') {
      this.loadTurnosData();
    }
    // Forzar detección de cambios con OnPush
    this.cdr.detectChanges();
  }

  getCurrentDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  registrarTurno(): void {
    if (!this.canRegisterTurno) return;
    this.isLoading = true;
    const turnoData = {
      pacienteId: this.turnoForm.pacienteId,
      dentistaId: this.turnoForm.dentistaId,
      fecha: this.turnoForm.fecha,
      hora: this.turnoForm.hora,
      tratamientoId: this.turnoForm.tratamientoId
    };
    this.turnoService.createTurno(turnoData).subscribe({
      next: (response) => {
        this.isLoading = false;
        this.notificationService.showSuccess('Turno registrado exitosamente');
        
        // Force page reload to ensure fresh data
        setTimeout(() => {
          window.location.reload();
        }, 500);
      },
      error: (error) => {
        console.error('Error al registrar turno:', error);
        this.isLoading = false;
        const errorMessage = error.error?.msg || 'Error al registrar el turno';
        this.notificationService.showError(errorMessage);
      }
    });
  }

  get canRegisterTurno(): boolean {
    return this.turnoForm.pacienteId !== '' &&
           this.turnoForm.dentistaId !== '' &&
           this.turnoForm.fecha !== '' &&
           this.turnoForm.hora !== '' &&
           this.turnoForm.tratamientoId !== '';
  }

  cancelarTurno(turno: Turno): void {
    // Función simplificada sin modales
    if (confirm('¿Estás seguro de que quieres cancelar este turno?')) {
      const turnoId = turno._id || turno.id?.toString() || '';
      if (turnoId) {
        this.isLoading = true;
        this.turnoService.cancelarTurnoYReembolso(turnoId).subscribe({
          next: (res) => {
            this.isLoading = false;
            this.notificationService.showSuccess('Turno cancelado exitosamente');
            setTimeout(() => {
              window.location.reload();
            }, 500);
          },
          error: (error) => {
            this.isLoading = false;
            const errorMessage = error.error?.msg || 'Error al cancelar el turno';
            this.notificationService.showError(errorMessage);
          }
        });
      }
    }
  }

  // Nuevas funciones para manejo de estado de pago
  getPaymentStatusClass(paymentStatus: string): string {
    switch (paymentStatus) {
      case 'approved': 
      case 'pagado': 
        return 'badge bg-success text-white';
      case 'pending': 
      case 'pendiente_pago_online': 
        return 'badge bg-warning text-dark';
      case 'rejected': 
      case 'cancelled': 
        return 'badge bg-danger text-white';
      case 'refunded': 
        return 'badge bg-info text-white';
      case 'efectivo': 
        return 'badge bg-secondary text-white';
      case 'online':
        return 'badge bg-primary text-white';
      case '':
      case null:
      case undefined:
        return 'badge bg-light text-dark';
      default: 
        return 'badge bg-light text-dark';
    }
  }

  getPaymentStatusLabel(paymentStatus: string): string {
    // Normalizar el valor
    const status = (paymentStatus || '').toLowerCase().trim();
    
    switch (status) {
      case 'approved': return '✅ Pagado Online';
      case 'pagado': return '✅ Pagado';
      case 'pending': return '⏳ Pago Pendiente';
      case 'pendiente_pago_online': return '⏳ Esperando Pago Online';
      case 'pendiente_pago_efectivo': return '💵 Pago en Efectivo';
      case 'rejected': return '❌ Pago Rechazado';
      case 'cancelled': return '🚫 Pago Cancelado';
      case 'refunded': return '💰 Reembolsado';
      case 'efectivo': return '💵 Pago en Efectivo';
      case 'online': return '🌐 Pago Online';
      case '': 
      case 'null':
      case 'undefined':
        return '⏸️ Sin Procesar';
      default: 
        // Mostrar el estado original si no reconocemos el valor
        return '❓ ' + paymentStatus;
    }
  }

  // Función para obtener etiqueta de estado más descriptiva
  getStatusLabel(estado: string): string {
    // Mapear 'completado' a 'Pagado' visualmente
    if (estado === 'completado') return 'Pagado';
    switch (estado) {
      case 'reservado': return 'Reservado';
      case 'reservado_pendiente_pago': return 'Reservado - Pago Pendiente';
      case 'pendiente_pago_online': return 'Esperando Pago Online';
      case 'pendiente_pago_efectivo': return 'Pago en Efectivo';
      case 'pagado': return 'Pagado';
      case 'cancelado': return 'Cancelado';
      case 'pendiente': return 'Pendiente';
      default: return estado || 'Sin Estado';
    }
  }

  getStatusClass(estado: string): string {
    // Mapear 'completado' a 'pagado' visualmente
    if (estado === 'completado') return 'badge bg-primary text-white';
    switch (estado) {
      case 'reservado': return 'badge bg-primary text-white';
      case 'reservado_pendiente_pago': return 'badge bg-info text-white';
      case 'pendiente_pago_online': return 'badge bg-warning text-dark';
      case 'pendiente_pago_efectivo': return 'badge bg-warning text-dark';
      case 'pagado': return 'badge bg-primary text-white';
      case 'cancelado': return 'badge bg-danger text-white';
      case 'pendiente': return 'badge bg-secondary text-white';
      default: return 'badge bg-light text-dark';
    }
  }



  completarTurno(turno: Turno): void {
    if (confirm('¿Confirmar que el turno ha sido completado?')) {
      const turnoId = turno._id || turno.id?.toString() || '';
      if (turnoId) {
        this.turnoService.cambiarEstadoTurno(turnoId, 'completado').subscribe({
          next: () => {
            this.notificationService.showSuccess('Turno marcado como completado');
            // Force page reload to ensure fresh data
            setTimeout(() => {
              window.location.reload();
            }, 500);
          },
          error: () => this.notificationService.showError('Error al completar el turno')
        });
      }
    }
  }

  get filteredTurnos(): Turno[] {
    let filtered = this.turnos;

    // Filtrar por búsqueda
    if (this.searchTerm.trim() !== '') {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(turno => 
        String(turno.nroTurno).toLowerCase().includes(search) ||
        turno.tratamiento.toLowerCase().includes(search) ||
        turno.nombre?.toLowerCase().includes(search) ||
        turno.apellido?.toLowerCase().includes(search)
      );
    }

    // Filtrar por estado
    if (this.filterEstado !== 'todos') {
      filtered = filtered.filter(turno => turno.estado === this.filterEstado);
    }

    // Filtrar por fecha desde
    if (this.filterFechaDesde) {
      filtered = filtered.filter(turno => {
        const turnoDate = new Date(turno.fecha);
        const desdeDate = new Date(this.filterFechaDesde);
        return turnoDate >= desdeDate;
      });
    }

    // Filtrar por fecha hasta
    if (this.filterFechaHasta) {
      filtered = filtered.filter(turno => {
        const turnoDate = new Date(turno.fecha);
        const hastaDate = new Date(this.filterFechaHasta);
        return turnoDate <= hastaDate;
      });
    }

    // Filtrar por método de pago
    if (this.filterPago !== 'todos') {
      filtered = filtered.filter(turno => {
        const paymentStatus = turno.paymentStatus || turno.metodoPago || '';
        if (this.filterPago === 'online') {
          return paymentStatus === 'approved' || paymentStatus === 'pagado';
        } else if (this.filterPago === 'efectivo') {
          return paymentStatus === 'efectivo' || paymentStatus === 'pendiente_pago_efectivo';
        } else if (this.filterPago === 'pendiente') {
          return paymentStatus === 'pending' || paymentStatus === 'pendiente_pago';
        }
        return true;
      });
    }

    // Filtrar por usuario según el tipo y la vista actual
    if (this.user?.tipoUsuario === 'paciente') {
      // Para pacientes: mostrar solo sus turnos usando múltiples criterios
      if (this.pacienteActual) {
        const pacienteId = this.pacienteActual._id || this.pacienteActual.id;
        filtered = filtered.filter(turno => {
          // Verificar por pacienteId
          if (pacienteId && turno.pacienteId) {
            const idMatch = turno.pacienteId.toString() === pacienteId.toString();
            if (idMatch) return true;
          }
          
          // Verificar por nombre y apellido como fallback
          if (this.pacienteActual?.nombre && this.pacienteActual?.apellido && turno.nombre && turno.apellido) {
            const nombreMatch = turno.nombre.toLowerCase().trim() === this.pacienteActual.nombre.toLowerCase().trim();
            const apellidoMatch = turno.apellido.toLowerCase().trim() === this.pacienteActual.apellido.toLowerCase().trim();
            return nombreMatch && apellidoMatch;
          }
          
          return false;
        });
      } else {
        // Si no se encontró la información del paciente, no mostrar ningún turno
        filtered = [];
      }
    }
    // Para dentistas y administradores: mostrar todos los turnos (no filtrar por paciente)

    // Filtrar por cantidad de turnos
    if (this.filterCantidad !== 'todos') {
      const cantidad = parseInt(this.filterCantidad);
      if (!isNaN(cantidad) && cantidad > 0) {
        // Ordenar por fecha (más recientes primero) y tomar solo los últimos N
        filtered = filtered
          .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
          .slice(0, cantidad);
      }
    }

    return filtered;
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
          // Si ya estamos en la página de turnos, solo cerrar el chat
          this.chatOpen = false;
          // Agregar mensaje de confirmación
          this.addConfirmationMessage('🎯 **¡Perfecto!** Ya estás en tu sección de turnos. Aquí puedes ver todos tus turnos y cancelar cualquiera que necesites.');
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

  // Método para resetear la burbuja de bienvenida (solo para pruebas)
  resetWelcomeBubble(): void {
    localStorage.removeItem('welcomeBubbleShown');
    this.showWelcomeBubbleAfterDelay();
  }

  // Métodos adicionales para el nuevo diseño
  getTurnosReservados(): number {
    return this.turnos.filter(t => 
      t.estado === 'reservado' || 
      t.estado === 'pendiente' || 
      t.estado === 'pendiente_pago' || 
      t.estado === 'pendiente_pago_efectivo'
    ).length;
  }

  getTurnosCompletados(): number {
    return this.turnos.filter(t => t.estado === 'completado').length;
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.filterEstado = 'todos';
    this.filterFechaDesde = '';
    this.filterFechaHasta = '';
    this.filterPago = 'todos';
    this.filterCantidad = 'todos';
  }

  hasActiveFilters(): boolean {
    return this.searchTerm !== '' || 
           this.filterEstado !== 'todos' || 
           this.filterFechaDesde !== '' || 
           this.filterFechaHasta !== '' || 
           this.filterPago !== 'todos' ||
           this.filterCantidad !== 'todos';
  }

  setViewMode(mode: 'cards' | 'table'): void {
    this.viewMode = mode;
  }

  getTurnoCardClass(turno: Turno): string {
    const baseClass = 'turno-card';
    if (turno.estado === 'cancelado') return `${baseClass} cancelled`;
    if (turno.estado === 'completado') return `${baseClass} completed`;
    if (turno.estado === 'reservado' || turno.estado === 'pagado') return `${baseClass} active`;
    return baseClass;
  }

  getDayFromDate(fecha: string): string {
    const date = new Date(fecha);
    return date.getDate().toString();
  }

  getMonthFromDate(fecha: string): string {
    const date = new Date(fecha);
    const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    return months[date.getMonth()];
  }

  formatDate(fecha: string): string {
    const date = new Date(fecha);
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
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

  canCancelTurno(turno: Turno): boolean {
    if (this.user?.tipoUsuario === 'paciente') {
      return turno.estado === 'reservado' || 
             turno.estado === 'pendiente' || 
             turno.estado === 'pendiente_pago' || 
             turno.estado === 'pendiente_pago_efectivo';
    }
    return turno.estado === 'reservado';
  }

  viewTurnoDetails(turno: Turno): void {
    // Implementar vista de detalles del turno
    // Aquí podrías abrir un modal o navegar a una página de detalles
  }

  navigateToReservar(): void {
    this.router.navigate(['/reservarTurno']);
  }
}
