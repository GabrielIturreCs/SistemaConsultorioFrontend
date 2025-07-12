import { Component, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { User, Turno, Paciente, Disponibilidad } from '../../interfaces';
import { ChatbotService } from '../../services/ChatBot.service';
import { ChatMessage, QuickQuestion } from '../../interfaces/chatbot.interface';
import { ActionButton } from '../../interfaces/message.interface';
import { TurnoService } from '../../services/turno.service';
import { PacienteService } from '../../services/paciente.service';
import { interval, Subscription } from 'rxjs';
import { ActividadService } from '../../services/actividad.service';
import { DentistaService } from '../../services/dentista.service';
import { TratamientoService } from '../../services/tratamiento.service';
import { ChatService } from '../../services/chat.service';
import { NotificationService } from '../../services/notification.service';
import { ReviewService, Review } from '../../services/review.service';
import { PdfExportService } from '../../services/pdf-export.service';
import { AuthService } from '../../services/auth.service';
import { DataRefreshService } from '../../services/data-refresh.service';
import { DisponibilidadService } from '../../services/disponibilidad.service';

interface AdminStats {
  totalUsuarios: number;
  turnosEsteMes: number;
  ingresosEsteMes: number;
  dentistasActivos: number;
  ocupacionTurnos: number;
  satisfaccionPacientes: number;
  eficienciaSistema: number;
  alertas: Array<{
    tipo: string;
    titulo: string;
    descripcion: string;
    tiempo: string;
  }>;
  actividadReciente: Array<{
    tipo: string;
    titulo: string;
    descripcion: string;
    tiempo: string;
  }>;

}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, OnDestroy {
  user: User | null = null;
  turnos: Turno[] = [];
  selectedPaciente: Paciente | null = null;
  isPacienteView: boolean = false;

  // Admin dashboard properties
  adminStats: AdminStats = {
    totalUsuarios: 0,
    turnosEsteMes: 0,
    ingresosEsteMes: 0,
    dentistasActivos: 0,
    ocupacionTurnos: 0,
    satisfaccionPacientes: 0,
    eficienciaSistema: 0,
    alertas: [],
    actividadReciente: []
  };

  // Chatbot properties
  @ViewChild('chatMessages') chatMessages!: ElementRef;
  chatOpen = false;
  messages: ChatMessage[] = [];
  chatForm: FormGroup;
  isTyping = false;
  quickQuestions: QuickQuestion[] = [
    { text: '¿Cuáles son los horarios?', action: 'horarios' },
    { text: '¿Qué tratamientos ofrecen?', action: 'tratamientos' },
    { text: '¿Cómo reservo un turno?', action: 'reservar' },
    { text: '¿Cómo cancelo un turno?', action: 'cancelar' }
  ];

    // Datos de prueba
    testData = {
    turnos: [
      { id: 1, nroTurno: 'T001', fecha: '2024-01-20', hora: '09:00', estado: 'reservado', tratamiento: 'Consulta General', precioFinal: 5000, nombre: 'Juan', apellido: 'Pérez', pacienteId: 1, tratamientoId: 1 },
      { id: 2, nroTurno: 'T002', fecha: '2024-01-21', hora: '10:30', estado: 'reservado', tratamiento: 'Limpieza Dental', precioFinal: 8000, nombre: 'María', apellido: 'García', pacienteId: 2, tratamientoId: 2 },
      { id: 3, nroTurno: 'T003', fecha: '2024-01-22', hora: '14:00', estado: 'completado', tratamiento: 'Empaste', precioFinal: 12000, nombre: 'Carlos', apellido: 'López', pacienteId: 3, tratamientoId: 3 }
    ]
  };

  // NUEVO: Variables para rendimiento del sistema (solo admin)
  rendimiento = {
    ocupacion: 0, // % de turnos completados sobre el total
    usuarios: 0   // cantidad real de usuarios registrados (pacientes)
  };

  alertas: any[] = [];
  private alertaInterval?: Subscription;
  cargandoAlertas = false;

  // Review properties
  reviews: Review[] = [];
  filteredReviews: Review[] = [];
  reviewStats: any = {
    total: 0,
    promedio: 0,
    pendientes: 0,
    aprobadas: 0,
    rechazadas: 0
  };
  reviewFilter: string = '';
  reviewSearch: string = '';

  // Propiedades para modales
  detallesTurnoContent: string = '';
  cancelarTurnoContent: string = '';
  confirmarPagoContent: string = '';
  confirmarCompletadoContent: string = '';
  confirmarReactivacionContent: string = '';
  turnoSeleccionado: Turno | null = null;

  // Propiedades para configuración personalizada del dentista
  disponibilidadDentista: Disponibilidad | null = null;
  horariosPersonalizados: string[] = [];
  diasNoDisponibles: string[] = [];
  franjasNoDisponibles: any[] = [];
  pausas: any[] = [];

  private refreshSubscription?: Subscription;

  constructor(
    private router: Router, 
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private chatbotService: ChatbotService,
    private turnoService: TurnoService,
    private pacienteService: PacienteService,
    private actividadService: ActividadService,
    private dentistaService: DentistaService,
    private tratamientoService: TratamientoService,
    private chatService: ChatService,
    private notificationService: NotificationService,
    private reviewService: ReviewService,
    private pdfExportService: PdfExportService,
    private authService: AuthService,
    private dataRefreshService: DataRefreshService,
    private disponibilidadService: DisponibilidadService
  ) {
    this.chatForm = this.fb.group({
      message: ['', [Validators.required, Validators.minLength(1)]]
    });
  }

  ngOnInit(): void {
    this.loadUserData();
    this.checkPacienteView();
    // loadTurnosData() se llamará desde loadUserData después de cargar el usuario
    this.loadAdminStats();
    // Suscribirse a refresh global de turnos
    this.refreshSubscription = this.dataRefreshService?.refresh$?.subscribe((component) => {
      if (component === 'all' || component === 'dashboard' || component === 'agenda') {
        this.loadTurnosData();
        // Verificar turnos ausentes después de cargar datos
        setTimeout(() => this.marcarTurnosAusentes(), 1000);
      }
    });
    // Solo cargar chat para dentistas
    if (this.user?.tipoUsuario === 'dentista') {
      this.loadChatHistory();
      this.addWelcomeMessage();
      // Cargar configuración personalizada del dentista
      this.cargarDisponibilidadDentista();
    }
    this.loadDentistasActividad();
    this.loadPacientesActividad();
    this.loadTratamientosActividad();
    this.loadTurnosActividad();
    if (this.user?.tipoUsuario === 'administrador') {
      this.cargarRendimientoSistema();
      this.generarAlertasSistema();
      this.loadReviews();
      this.alertaInterval = interval(600000).subscribe(() => { // cada 10 minutos
        this.generarAlertasSistema();
        this.loadDentistasActividad();
        this.loadPacientesActividad();
        this.loadTratamientosActividad();
        this.loadTurnosActividad();
        this.loadReviews();
        // Verificar turnos ausentes cada 10 minutos
        this.marcarTurnosAusentes();
      });
    }
    this.actividadService.actividad$.subscribe(actividad => {
      this.adminStats.actividadReciente.unshift(actividad);
      // Limita a 10 actividades recientes
      this.adminStats.actividadReciente = this.adminStats.actividadReciente.slice(0, 10);
    });
  }

  ngOnDestroy(): void {
    this.alertaInterval?.unsubscribe();
    this.refreshSubscription?.unsubscribe();
  }

  // Cargar historial del chat desde ChatService con localStorage
  loadChatHistory(): void {
    // Solo cargar historial si es dentista (no administrador)
    if (this.user?.tipoUsuario === 'dentista') {
      // Cambiar al usuario actual para cargar su historial específico
      this.chatService.switchUser();
      
      const history = this.chatService.getConversationHistory();
      if (history.length > 0) {
        // Convertir el historial del ChatService al formato del componente
        this.messages = history.map(msg => ({
          text: msg.content,
          isUser: msg.role === 'user',
          timestamp: msg.timestamp
        }));
        
        // Mostrar contexto de conversación si es una continuación
        if (this.chatService.isContinuingConversation()) {
          const summary = this.chatService.getConversationSummary();
          console.log('Continuando conversación:', summary);
        }
      }
    }
  }

  // Admin dashboard methods
  loadAdminStats(): void {
    if (this.user?.tipoUsuario === 'administrador') {
      // Inicializar con valores por defecto
      this.adminStats = {
        totalUsuarios: 0,
        turnosEsteMes: 0,
        ingresosEsteMes: 0,
        dentistasActivos: 0,
        ocupacionTurnos: 0,
        satisfaccionPacientes: 0,
        eficienciaSistema: 0,
        alertas: [],
        actividadReciente: []
      };

      // Cargar datos reales de la BD
      this.loadRealAdminStats();
    }
  }

  loadRealAdminStats(): void {
    // Cargar turnos para estadísticas
    this.turnoService.getTurnosFromAPI().subscribe({
      next: (turnos) => {
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        // Turnos de este mes
        const turnosEsteMes = turnos.filter(turno => {
          const turnoDate = new Date(turno.fecha);
          return turnoDate.getMonth() === currentMonth && turnoDate.getFullYear() === currentYear;
        });
        
        // Ingresos de este mes (solo turnos completados)
        const ingresosEsteMes = turnosEsteMes
          .filter(turno => turno.estado === 'completado')
          .reduce((total, turno) => total + (Number(turno.precioFinal) || 0), 0);
        
        this.adminStats.turnosEsteMes = turnosEsteMes.length;
        this.adminStats.ingresosEsteMes = ingresosEsteMes;
      },
      error: (error) => {
        console.error('Error cargando estadísticas de turnos:', error);
      }
    });

    // Cargar pacientes para total de usuarios
    this.pacienteService.getPacientes().subscribe({
      next: (pacientes) => {
        this.adminStats.totalUsuarios = pacientes.length;
      },
      error: (error) => {
        console.error('Error cargando pacientes:', error);
      }
    });

    // Cargar dentistas activos
    this.dentistaService.getDentistas().subscribe({
      next: (dentistas) => {
        this.adminStats.dentistasActivos = dentistas.length;
      },
      error: (error) => {
        console.error('Error cargando dentistas:', error);
      }
    });
  }

  getAlertIcon(tipo: string): string {
    const icons: { [key: string]: string } = {
      'warning': 'fas fa-exclamation-triangle',
      'info': 'fas fa-info-circle',
      'success': 'fas fa-check-circle',
      'danger': 'fas fa-times-circle'
    };
    return icons[tipo] || 'fas fa-info-circle';
  }

  getActivityIcon(tipo: string): string {
    const icons: { [key: string]: string } = {
      'user': 'fas fa-user-plus',
      'turno': 'fas fa-calendar-times',
      'payment': 'fas fa-credit-card',
      'system': 'fas fa-cog',
      'dentist': 'fas fa-user-md',
      'dentist-purple': 'fas fa-user-md',
      'patient': 'fas fa-user'
    };
    return icons[tipo] || 'fas fa-info-circle';
  }

  // Chatbot methods
  addWelcomeMessage(): void {
    // Solo mostrar mensaje de bienvenida para dentistas
    if (this.user?.tipoUsuario === 'dentista') {
      const welcomeText = 'Hola Doctor/a. Soy DentalBot, tu asistente para la gestión de la clínica. Puedo ayudarte con:\n\n🔹 Gestión de citas y agenda\n🔹 Información de pacientes\n🔹 Seguimiento de tratamientos\n🔹 Reportes y estadísticas\n🔹 Control de inventario\n🔹 Configuración del sistema\n\n¿En qué puedo asistirte hoy?';
      
      const welcomeMessage: ChatMessage = {
        text: welcomeText,
        isUser: false,
        timestamp: new Date()
      };
      this.messages.push(welcomeMessage);
    }
  }

  toggleChat(): void {
    // Solo permitir chat para dentistas
    if (this.user?.tipoUsuario === 'dentista') {
      this.chatOpen = !this.chatOpen;
      if (this.chatOpen && this.messages.length === 0) {
        this.addWelcomeMessage();
      }
    }
  }

  onSubmit(): void {
    // Solo permitir envío de mensajes para dentistas
    if (this.user?.tipoUsuario === 'dentista' && this.chatForm.valid && this.chatForm.value.message.trim()) {
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
        console.log('Sugerencia del chatbot:', suggestedNextStep);
      }
    }
  }

  handleQuickQuestion(question: QuickQuestion): void {
    // Solo permitir preguntas rápidas para dentistas
    if (this.user?.tipoUsuario === 'dentista') {
      const userMessage: ChatMessage = {
        text: question.text,
        isUser: true,
        timestamp: new Date()
      };
      
      this.messages.push(userMessage);
      this.handleHybridChat(question.text);
      this.scrollToBottom();
    }
  }

  private handleHybridChat(message: string): void {
    // Solo procesar mensajes para dentistas
    if (this.user?.tipoUsuario !== 'dentista') {
      return;
    }
    
    this.isTyping = true;
    
    // Determinar el tipo de usuario (siempre dentista en este contexto)
    const userType = 'dentist';
    
    // Verificar si es una continuación de conversación
    const isContinuing = this.chatService.isContinuingConversation();
    const lastTopic = this.chatService.getLastTopic();
    
    // Usar ChatService para generar respuesta con contexto
    const chatResponse = this.chatService.generateResponse(message, userType);
    
    setTimeout(() => {
      const botMessage: ChatMessage = {
        text: chatResponse.content,
        isUser: false,
        timestamp: new Date(),
        actions: chatResponse.actions || []
      };
      this.messages.push(botMessage);
      this.isTyping = false;
      this.scrollToBottom();
      
      // Sincronizar con ChatService
      this.syncWithChatService();
      
      // Log del contexto para debugging
      if (isContinuing && lastTopic) {
        console.log(`Continuando conversación sobre: ${lastTopic}`);
      }
    }, 800);
  }

  // Sincronizar mensajes del componente con ChatService
  private syncWithChatService(): void {
    // Solo sincronizar para dentistas
    if (this.user?.tipoUsuario === 'dentista') {
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
        // Asegurar que el rol esté correctamente seteado en localStorage
        if (this.user?.tipoUsuario) {
          localStorage.setItem('rol', this.user.tipoUsuario);
          console.log('Dashboard: Rol guardado en localStorage:', this.user.tipoUsuario);
        }
        console.log('Dashboard: Usuario cargado:', this.user);
        console.log('Dashboard: Nombre del usuario:', this.user?.nombre);
        console.log('Dashboard: Tipo de usuario:', this.user?.tipoUsuario);
        // Redirigir pacientes a su vista específica
        if (this.user?.tipoUsuario === 'paciente') {
          this.router.navigate(['/vistaPaciente']);
          return;
        }
        // Cargar turnos después de cargar el usuario
        this.loadTurnosData();
      } else {
        console.log('Dashboard: No se encontró usuario en localStorage');
        this.router.navigate(['/login']);
      }
    }
  }

  checkPacienteView(): void {
    // Verificar si hay un paciente seleccionado (viene desde la vista de pacientes)
    if (typeof window !== 'undefined' && window.localStorage) {
      const selectedPacienteStr = localStorage.getItem('selectedPaciente');
      if (selectedPacienteStr) {
        this.selectedPaciente = JSON.parse(selectedPacienteStr);
        this.isPacienteView = true;
        
        // Limpiar el localStorage después de obtener el paciente
        localStorage.removeItem('selectedPaciente');
      }
    }

    // También verificar si viene por query params
    this.route.queryParams.subscribe(params => {
      if (params['pacienteId'] && !this.selectedPaciente) {
        // Buscar el paciente por ID en los datos de prueba
        const pacienteId = parseInt(params['pacienteId']);
        // Aquí podrías hacer una llamada al servicio para obtener el paciente
        // Por ahora usamos datos de prueba
        this.selectedPaciente = {
          id: pacienteId,
          nombre: 'Paciente',
          apellido: 'Ejemplo',
          dni: '12345678',
          obraSocial: 'OSDE'
        };
        this.isPacienteView = true;
      }
    });
  }

  loadTurnosData(): void {
    console.log('🔍 loadTurnosData() - Usuario actual:', this.user);
    console.log('🔍 loadTurnosData() - Tipo de usuario:', this.user?.tipoUsuario);
    console.log('🔍 loadTurnosData() - ID del usuario:', this.user?.id);
    
    // Si es un dentista, cargar solo sus turnos
    if (this.user?.tipoUsuario === 'dentista' && this.user?.id) {
      console.log('🦷 Cargando turnos del dentista:', this.user.id);
      this.turnoService.getTurnosByDentista(this.user.id.toString()).subscribe({
        next: (turnos) => {
          console.log('✅ Turnos del dentista cargados:', turnos);
          // Solo filtra por paciente si está en modo vista de paciente
          if (this.isPacienteView && this.selectedPaciente) {
            this.turnos = turnos.filter(turno => String(turno.pacienteId) === String(this.selectedPaciente!.id));
          } else {
            this.turnos = turnos; // Solo los turnos del dentista
          }
          console.log('📊 Turnos finales asignados:', this.turnos);
        },
        error: (error) => { 
          console.error('❌ Error cargando turnos del dentista:', error);
          this.turnos = []; 
        }
      });
    } else {
      console.log('👥 Cargando todos los turnos (no es dentista o no tiene ID)');
      // Para administradores y pacientes, cargar todos los turnos (comportamiento original)
      this.turnoService.getTurnosFromAPI().subscribe({
        next: (turnos) => {
          console.log('✅ Todos los turnos cargados:', turnos);
          // Solo filtra por paciente si está en modo vista de paciente
          if (this.isPacienteView && this.selectedPaciente) {
            this.turnos = turnos.filter(turno => String(turno.pacienteId) === String(this.selectedPaciente!.id));
          } else {
            this.turnos = turnos; // TODOS los turnos
          }
          console.log('📊 Turnos finales asignados:', this.turnos);
        },
        error: (error) => { 
          console.error('❌ Error cargando todos los turnos:', error);
          this.turnos = []; 
        }
      });
    }
  }

  logout(): void {
    localStorage.clear();
    this.router.navigate(['/login']);
  }

  navigateToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  navigateToReservar(): void {
    this.router.navigate(['/reservarTurno']);
  }

  navigateToTurnos(): void {
    this.router.navigate(['/misTurnos']);
  }

  navigateToAdmin(): void {
    this.router.navigate(['/admin']);
  }

  navigateToEstadisticas(): void {
    if (this.user?.tipoUsuario === 'administrador') {
      this.router.navigate(['/estadistica']);
    } else {
      this.notificationService.showWarning('Solo los administradores pueden acceder a las estadísticas.');
    }
  }

  navigateToPacientes(): void {
    this.router.navigate(['/pacientes']);
  }

  navigateToDentistas(): void {
    this.router.navigate(['/dentista']);
  }

  navigateToAgenda(): void {
    this.router.navigate(['/agenda']);
  }

  navigateToConfiguracion(): void {
    this.router.navigate(['/configuracion-disponibilidad']);
  }

  volverAPacientes(): void {
    this.router.navigate(['/pacientes']);
  }

  goToPacientes(): void {
    this.router.navigate(['/pacientes']);
  }

  // Función para mostrar notificaciones amigables
  showFriendlyNotification(type: 'success' | 'error' | 'warning' | 'info', title: string, message: string, duration: number = 5000): void {
    // Crear elemento de notificación
    const notification = document.createElement('div');
    notification.className = `friendly-notification ${type}`;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      max-width: 400px;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transform: translateX(100%);
      transition: transform 0.3s ease-in-out;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;

    // Configurar colores según el tipo
    switch (type) {
      case 'success':
        notification.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
        notification.style.color = 'white';
        break;
      case 'error':
        notification.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
        notification.style.color = 'white';
        break;
      case 'warning':
        notification.style.background = 'linear-gradient(135deg, #ffc107 0%, #fd7e14 100%)';
        notification.style.color = 'white';
        break;
      case 'info':
        notification.style.background = 'linear-gradient(135deg, #17a2b8 0%, #6f42c1 100%)';
        notification.style.color = 'white';
        break;
    }

    // Crear contenido de la notificación
    notification.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 10px;">
        <div style="flex-shrink: 0; font-size: 20px;">
          ${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}
        </div>
        <div style="flex-grow: 1;">
          <h6 style="margin: 0 0 5px 0; font-weight: 600; font-size: 14px;">${title}</h6>
          <div style="font-size: 13px; line-height: 1.4; opacity: 0.95;">${message}</div>
        </div>
        <button onclick="this.parentElement.parentElement.remove()" style="
          background: none;
          border: none;
          color: inherit;
          font-size: 18px;
          cursor: pointer;
          padding: 0;
          margin: 0;
          opacity: 0.7;
          transition: opacity 0.2s;
        " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
          ×
        </button>
      </div>
    `;

    // Agregar al DOM
    document.body.appendChild(notification);

    // Animar entrada
    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 100);

    // Auto-remover después del tiempo especificado
    setTimeout(() => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentElement) {
          notification.remove();
        }
      }, 500);
    }, duration);
  }

  // Método público para recargar todas las estadísticas
  refreshDashboard(): void {
    this.showFriendlyNotification(
      'info',
      '🔄 Actualizando...',
      'Estamos actualizando la información del dashboard. Esto puede tomar unos segundos.',
      3000
    );
    
    this.loadTurnosData();
    if (this.user?.tipoUsuario === 'administrador') {
      this.loadRealAdminStats();
      this.cargarRendimientoSistema();
      this.generarAlertasSistema();
      this.loadDentistasActividad();
      this.loadPacientesActividad();
      this.loadTratamientosActividad();
      this.loadTurnosActividad();
    }

    // Verificar turnos ausentes después de cargar datos
    setTimeout(() => {
      this.marcarTurnosAusentes();
      this.showFriendlyNotification(
        'success',
        '✅ Actualización Completada',
        'La información del dashboard ha sido actualizada exitosamente.',
        4000
      );
    }, 2000);
  }

  get filteredTurnos(): Turno[] {
    return this.turnos
      .filter(turno => turno.estado !== 'cancelado')
      .sort((a, b) => {
        // Ordenar por fecha y hora descendente
        const dateA = new Date(`${a.fecha}T${a.hora || '00:00'}`);
        const dateB = new Date(`${b.fecha}T${b.hora || '00:00'}`);
        return dateB.getTime() - dateA.getTime();
      });
  }

  get totalTurnos(): number {
    return this.turnos.length;
  }

  get turnosHoy(): number {
    // Obtener la fecha actual en zona horaria de Argentina
    const now = new Date();
    const todayArgentina = now.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }); // formato YYYY-MM-DD
    return this.turnos.filter(turno => (turno.fecha || '') === todayArgentina).length;
  }

  get proximoTurno(): Turno | null {
    console.log('=== DEBUG: Buscando próximo turno ===');
    console.log('Total de turnos:', this.turnos.length);
    
    // Filtrar solo turnos futuros (no pasados) con estados válidos
    const futureTurnos = this.turnos
      .filter(turno => {
        const esFuturo = this.isTurnoFuturo(turno);
        const estadoReal = this.getTurnoEstadoReal(turno);
        const estadoValido = ['reservado', 'pagado', 'pendiente_pago_efectivo', 'pendiente_pago_online'].includes(estadoReal);
        
        console.log(`Turno ${turno.nroTurno} (${turno.fecha} ${turno.hora}): Es futuro: ${esFuturo}, Estado: ${estadoReal}, Válido: ${estadoValido}`);
        
        // Solo turnos futuros (no pasados)
        if (!esFuturo) {
          return false;
        }
        
        // Solo estados válidos para próximos turnos (excluir ausente, completado, cancelado)
        return estadoValido;
      })
      .sort((a, b) => {
        const dateA = this.getTurnoDate(a);
        const dateB = this.getTurnoDate(b);
        return dateA.getTime() - dateB.getTime();
      });
    
    console.log('Turnos futuros encontrados:', futureTurnos.length);
    if (futureTurnos.length > 0) {
      console.log('Próximo turno:', futureTurnos[0].nroTurno, futureTurnos[0].fecha, futureTurnos[0].hora);
    }
    
    // Marcar turnos ausentes en segundo plano (sin bloquear la UI)
    this.marcarTurnosAusentes();
    
    return futureTurnos.length > 0 ? futureTurnos[0] : null;
  }

  get proximosTurnos(): Turno[] {
    // Filtrar solo turnos futuros (no pasados) con estados válidos
    return this.turnos
      .filter(turno => {
        // Solo turnos futuros (no pasados)
        if (!this.isTurnoFuturo(turno)) {
          return false;
        }
        
        // Solo estados válidos para próximos turnos (excluir ausente, completado, cancelado)
        const estadoReal = this.getTurnoEstadoReal(turno);
        return ['reservado', 'pagado', 'pendiente_pago_efectivo', 'pendiente_pago_online'].includes(estadoReal);
      })
      .sort((a, b) => {
        const dateA = this.getTurnoDate(a);
        const dateB = this.getTurnoDate(b);
        return dateA.getTime() - dateB.getTime();
      })
      .slice(0, 5); // Solo los próximos 5 turnos
  }

  getStatusClass(estado: string): string {
    switch (estado) {
      case 'reservado': return 'badge bg-primary';
      case 'completado': return 'badge bg-success';
      case 'cancelado': return 'badge bg-danger';
      case 'pagado': return 'badge bg-info';
      case 'pendiente_pago_efectivo': return 'badge bg-warning';
      case 'pendiente_pago_online': return 'badge bg-warning';
      case 'reprogramado': return 'badge bg-secondary';
      case 'ausente': return 'badge bg-dark';
      default: return 'badge bg-secondary';
    }
  }

  getStatusText(estado: string): string {
    switch (estado) {
      case 'reservado': return 'Reservado';
      case 'completado': return 'Completado';
      case 'cancelado': return 'Cancelado';
      case 'pagado': return 'Pagado';
      case 'pendiente_pago_efectivo': return 'Pendiente Pago Efectivo';
      case 'pendiente_pago_online': return 'Pendiente Pago Online';
      case 'reprogramado': return 'Reprogramado';
      case 'ausente': return 'Ausente';
      default: return 'Sin estado';
    }
  }

  getStatusIcon(estado: string): string {
    switch (estado) {
      case 'reservado': return 'fas fa-calendar-check';
      case 'completado': return 'fas fa-check-circle';
      case 'cancelado': return 'fas fa-times-circle';
      case 'pagado': return 'fas fa-credit-card';
      case 'pendiente_pago_efectivo': return 'fas fa-money-bill-wave';
      case 'pendiente_pago_online': return 'fas fa-credit-card';
      case 'reprogramado': return 'fas fa-clock';
      case 'ausente': return 'fas fa-user-times';
      default: return 'fas fa-question-circle';
    }
  }

  // Función para obtener la fecha actual en zona horaria de Argentina
  private getCurrentDate(): Date {
    const now = new Date();
    // Solo log en modo debug
    if (this.turnos.length > 0) {
      console.log('Fecha actual del sistema:', now.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }));
    }
    return now;
  }

  // Función para crear fecha del turno en zona horaria de Argentina
  private getTurnoDate(turno: Turno): Date {
    // Crear la fecha manualmente para evitar problemas de zona horaria
    const [year, month, day] = turno.fecha.split('-').map(Number);
    const [hour, minute] = (turno.hora || '00:00').split(':').map(Number);
    
    // Crear fecha en zona horaria local (Argentina)
    const turnoDate = new Date(year, month - 1, day, hour, minute, 0);
    
    // Solo log en modo debug para el primer turno
    if (turno.nroTurno === this.turnos[0]?.nroTurno) {
      console.log(`Turno ${turno.nroTurno}: Fecha original: ${turno.fecha}, Hora: ${turno.hora}`);
      console.log(`Turno ${turno.nroTurno}: Fecha interpretada:`, turnoDate.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }));
    }
    
    return turnoDate;
  }

  // Función para verificar si un turno está en tolerancia (30 minutos)
  isTurnoEnTolerancia(turno: Turno): boolean {
    const now = this.getCurrentDate();
    const turnoDate = this.getTurnoDate(turno);
    const diff = now.getTime() - turnoDate.getTime();
    const toleranciaMinutos = 30;
    
    // Si el turno ya pasó pero está dentro de los 30 minutos de tolerancia
    return diff > 0 && diff <= (toleranciaMinutos * 60 * 1000);
  }

  // Función para verificar si un turno ya pasó (más de 30 minutos)
  isTurnoPasado(turno: Turno): boolean {
    const now = this.getCurrentDate();
    const turnoDate = this.getTurnoDate(turno);
    const diff = now.getTime() - turnoDate.getTime();
    const toleranciaMinutos = 30;
    
    // Si el turno ya pasó y está fuera de los 30 minutos de tolerancia
    return diff > (toleranciaMinutos * 60 * 1000);
  }

  // Función para verificar si un turno es futuro
  isTurnoFuturo(turno: Turno): boolean {
    const now = this.getCurrentDate();
    const turnoDate = this.getTurnoDate(turno);
    return turnoDate.getTime() > now.getTime();
  }

  // Función para obtener el estado real del turno (considerando tolerancia)
  getTurnoEstadoReal(turno: Turno): string {
    // Si el turno ya está marcado como ausente, completado o cancelado, mantener ese estado
    if (['ausente', 'completado', 'cancelado'].includes(turno.estado)) {
      return turno.estado;
    }
    
    // Si el turno ya pasó (más de 30 minutos), debería ser ausente
    if (this.isTurnoPasado(turno)) {
      return 'ausente';
    }
    
    // Si está en tolerancia o es futuro, mantener el estado original
    return turno.estado;
  }

  // Función para marcar turnos ausentes automáticamente
  marcarTurnosAusentes(): void {
    const turnosParaMarcar = this.turnos.filter(turno => {
      // Solo turnos que no estén ya marcados como ausente, completado o cancelado
      if (['ausente', 'completado', 'cancelado'].includes(turno.estado)) {
        return false;
      }
      
      // Y que hayan pasado más de 30 minutos
      return this.isTurnoPasado(turno);
    });

    // Si hay turnos para marcar como ausentes, actualizar y refrescar datos
    if (turnosParaMarcar.length > 0) {
      console.log(`Marcando ${turnosParaMarcar.length} turnos como ausentes automáticamente`);
      
      // Marcar cada turno como ausente
      turnosParaMarcar.forEach(turno => {
        const turnoId = turno._id || turno.id?.toString() || '';
        this.turnoService.cambiarEstadoTurno(turnoId, 'ausente').subscribe({
          next: (response) => {
            console.log(`Turno ${turnoId} marcado como ausente automáticamente`);
            // Refrescar datos después de marcar como ausente
            this.loadTurnosData();
          },
          error: (error) => {
            console.error(`Error al marcar turno ${turnoId} como ausente:`, error);
          }
        });
      });
    }
  }

  getTipoClass(tipo: string): string {
    switch (tipo) {
      case 'administrador': return 'badge bg-danger';
      case 'dentista': return 'badge bg-primary';
      case 'paciente': return 'badge bg-success';
      default: return 'badge bg-secondary';
    }
  }

  getObraSocialClass(obraSocial: string): string {
    switch (obraSocial.toLowerCase()) {
      case 'osde': return 'badge bg-primary';
      case 'swiss medical': return 'badge bg-success';
      case 'galeno': return 'badge bg-warning';
      default: return 'badge bg-secondary';
    }
  }

  cargarRendimientoSistema(): void {
    // Obtener turnos y pacientes en paralelo
    this.turnoService.getTurnosFromAPI().subscribe((turnos: any[]) => {
      const total = turnos.length;
      const completados = turnos.filter((t: any) => t.estado === 'completado').length;
      this.rendimiento.ocupacion = total ? Math.round((completados / total) * 100) : 0;
    });
    
    this.pacienteService.getPacientes().subscribe((pacientes: any[]) => {
      this.rendimiento.usuarios = pacientes.length;
    });
  }

  generarAlertasSistema(): void {
    this.cargandoAlertas = true;
    this.turnoService.getTurnosFromAPI().subscribe((turnos: any[]) => {
      const recientes = turnos
        .slice(-5)
        .reverse()
        .map((t: any) => ({
          tipo: t.estado === 'completado' ? 'success' : t.estado === 'cancelado' ? 'warning' : 'info',
          titulo: t.estado === 'completado' ? 'Turno Completado' : t.estado === 'cancelado' ? 'Turno Cancelado' : 'Nuevo Turno',
          descripcion: `Turno #${t.nroTurno} para ${t.nombre} ${t.apellido}`,
          tiempo: t.fecha
        }));

      this.pacienteService.getPacientes().subscribe((pacientes: any[]) => {
        const nuevosPacientes = pacientes
          .slice(-5)
          .reverse()
          .map((p: any) => ({
            tipo: 'info',
            titulo: 'Nuevo Paciente Registrado',
            descripcion: `${p.nombre} ${p.apellido} se registró en el sistema`,
            tiempo: ''
          }));

        this.alertas = [...recientes, ...nuevosPacientes];
        this.cargandoAlertas = false;
      }, () => this.cargandoAlertas = false);
    }, () => this.cargandoAlertas = false);
  }

  loadDentistasActividad(): void {
    this.dentistaService.getDentistas().subscribe((dentistas) => {
      // Toma los últimos 3 dentistas creados
      const recientes = dentistas.slice(-3).reverse().map((d: any) => ({
        tipo: 'dentist-purple',
        titulo: '🦷 Nuevo Dentista Registrado',
        descripcion: `Dr. ${d.nombre} ${d.apellido} | DNI: ${d.dni} | Especialidad: ${d.especialidad || 'General'} | Matrícula: ${d.matricula || 'N/A'}`,
        tiempo: 'Recientemente'
      }));
      // Agrega a actividad reciente
      this.adminStats.actividadReciente = [
        ...recientes,
        ...this.adminStats.actividadReciente
      ].slice(0, 10);
      // Agrega a alertas
      this.adminStats.alertas = [
        ...recientes,
        ...this.adminStats.alertas
      ].slice(0, 10);
    });
  }

  loadPacientesActividad(): void {
    this.pacienteService.getPacientes().subscribe((pacientes) => {
      // Toma los últimos 3 pacientes creados
      const recientes = pacientes.slice(-3).reverse().map((p: any) => ({
        tipo: 'user',
        titulo: '👤 Nuevo Paciente Registrado',
        descripcion: `${p.nombre} ${p.apellido} | DNI: ${p.dni} | Obra Social: ${p.obraSocial}`,
        tiempo: 'Recientemente'
      }));
      // Agrega a actividad reciente
      this.adminStats.actividadReciente = [
        ...recientes,
        ...this.adminStats.actividadReciente
      ].slice(0, 10);
      // Agrega a alertas
      this.adminStats.alertas = [
        ...recientes,
        ...this.adminStats.alertas
      ].slice(0, 10);
    });
  }

  loadTratamientosActividad(): void {
    this.tratamientoService.getTratamientos().subscribe((tratamientos) => {
      // Toma los últimos 3 tratamientos creados
      const recientes = tratamientos.slice(-3).reverse().map((t: any) => ({
        tipo: 'system',
        titulo: '🦷 Nuevo Tratamiento Creado',
        descripcion: `${t.descripcion} | Duración: ${t.duracion} | Precio: $${t.precio || 'N/A'}`,
        tiempo: 'Recientemente'
      }));
      // Agrega a actividad reciente
      this.adminStats.actividadReciente = [
        ...recientes,
        ...this.adminStats.actividadReciente
      ].slice(0, 10);
      // Agrega a alertas
      this.adminStats.alertas = [
        ...recientes,
        ...this.adminStats.alertas
      ].slice(0, 10);
    });
  }

  loadTurnosActividad(): void {
    this.turnoService.getTurnosFromAPI().subscribe((turnos) => {
      // Toma los últimos 5 turnos creados
      const recientes = turnos.slice(-5).reverse().map((t: any) => {
        const emoji = t.estado === 'completado' ? '✅' : t.estado === 'cancelado' ? '❌' : '📅';
        const titulo = t.estado === 'completado' ? 'Turno Completado' : t.estado === 'cancelado' ? 'Turno Cancelado' : 'Nuevo Turno Reservado';
        
        return {
          tipo: t.estado === 'completado' ? 'success' : t.estado === 'cancelado' ? 'danger' : 'info',
          titulo: `${emoji} ${titulo}`,
          descripcion: `Turno #${t.nroTurno} | ${t.nombre} ${t.apellido} | ${t.tratamiento} | $${t.precioFinal}`,
          tiempo: 'Recientemente'
        };
      });
      // Agrega a actividad reciente
      this.adminStats.actividadReciente = [
        ...recientes,
        ...this.adminStats.actividadReciente
      ].slice(0, 10);
      // Agrega a alertas
      this.adminStats.alertas = [
        ...recientes,
        ...this.adminStats.alertas
      ].slice(0, 10);
    });
  }

  navigateToTratamiento(): void {
    this.router.navigate(['/tratamiento']);
  }

    getUserGreeting(): string {
      if (!this.user) return 'Usuario';
      
      // Para usuarios con perfil completo (Dentista, Paciente, Administrador)
      if (this.user.nombre && this.user.apellido) {
        return `${this.user.nombre} ${this.user.apellido}`;
      } else if (this.user.nombre) {
        return this.user.nombre;
      }
      
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

  // Review methods
  loadReviews(): void {
    this.reviews = this.reviewService.getAllReviews();
    this.reviewStats = this.reviewService.getReviewStats();
    this.filterReviews();
  }

  filterReviews(): void {
    let filtered = [...this.reviews];

    // Filtrar por estado
    if (this.reviewFilter) {
      filtered = filtered.filter(review => review.estado === this.reviewFilter);
    }

    // Filtrar por búsqueda
    if (this.reviewSearch) {
      const search = this.reviewSearch.toLowerCase();
      filtered = filtered.filter(review => 
        review.nombre.toLowerCase().includes(search) ||
        review.email.toLowerCase().includes(search) ||
        review.comentario.toLowerCase().includes(search)
      );
    }

    // Ordenar por fecha más reciente
    filtered.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    
    this.filteredReviews = filtered;
  }

  refreshReviews(): void {
    this.loadReviews();
  }

  exportReviews(): void {
    if (this.filteredReviews.length === 0) {
      this.notificationService.showWarning('No hay reseñas para exportar');
      return;
    }

    try {
      // Usar el servicio de PDF para exportar las reseñas
      this.pdfExportService.exportarResenasPDF(
        this.filteredReviews,
        this.reviewStats,
        this.reviewFilter
      ).then(() => {
        this.notificationService.showSuccess('Reseñas exportadas exitosamente a PDF');
      }).catch((error) => {
        console.error('Error al exportar reseñas:', error);
        this.notificationService.showError('Error al exportar las reseñas');
      });
    } catch (error) {
      console.error('Error al exportar reseñas:', error);
      this.notificationService.showError('Error al exportar las reseñas');
    }
  }

  approveReview(id: string): void {
    const updated = this.reviewService.updateReviewStatus(id, 'aprobado');
    if (updated) {
      this.loadReviews();
      alert('Reseña aprobada exitosamente');
    }
  }

  rejectReview(id: string): void {
    const updated = this.reviewService.updateReviewStatus(id, 'rechazado');
    if (updated) {
      this.loadReviews();
      alert('Reseña rechazada');
    }
  }

  respondToReview(review: Review): void {
    const respuesta = prompt('Escribe tu respuesta a esta reseña:');
    if (respuesta && respuesta.trim()) {
      const updated = this.reviewService.updateReviewStatus(review.id, review.estado, respuesta.trim());
      if (updated) {
        this.loadReviews();
        alert('Respuesta enviada exitosamente');
      }
    }
  }

  deleteReview(id: string): void {
    if (confirm('¿Estás seguro de que quieres eliminar esta reseña?')) {
      const deleted = this.reviewService.deleteReview(id);
      if (deleted) {
        this.loadReviews();
        alert('Reseña eliminada exitosamente');
      }
    }
  }

  getReviewStatusClass(estado: string): string {
    switch (estado) {
      case 'pendiente': return 'badge bg-warning';
      case 'aprobado': return 'badge bg-success';
      case 'rechazado': return 'badge bg-danger';
      default: return 'badge bg-secondary';
    }
  }

  getReviewStatusText(estado: string): string {
    switch (estado) {
      case 'pendiente': return 'Pendiente';
      case 'aprobado': return 'Aprobado';
      case 'rechazado': return 'Rechazado';
      default: return 'Sin estado';
    }
  }

  // Funciones para formatear información de turnos
  formatTurnoDate(fecha: string): string {
    if (!fecha) return 'Fecha no disponible';
    
    // Crear la fecha manualmente para evitar problemas de zona horaria
    const [year, month, day] = fecha.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatTurnoTime(hora: string): string {
    if (!hora) return 'Hora no disponible';
    return hora;
  }

  getTurnoPriority(turno: Turno): string {
    // Obtener la fecha actual en zona horaria de Argentina
    const now = new Date();
    const todayArgentina = now.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }); // formato YYYY-MM-DD
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowArgentina = tomorrow.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
    
    if (turno.fecha === todayArgentina) return 'high';
    if (turno.fecha === tomorrowArgentina) return 'medium';
    return 'low';
  }

  getTurnoPriorityClass(turno: Turno): string {
    const priority = this.getTurnoPriority(turno);
    switch (priority) {
      case 'high': return 'border-danger border-3';
      case 'medium': return 'border-warning border-3';
      case 'low': return 'border-primary border-2';
      default: return 'border-secondary';
    }
  }

  getTurnoPriorityIcon(turno: Turno): string {
    const priority = this.getTurnoPriority(turno);
    switch (priority) {
      case 'high': return 'fas fa-exclamation-triangle text-danger';
      case 'medium': return 'fas fa-clock text-warning';
      case 'low': return 'fas fa-calendar text-primary';
      default: return 'fas fa-calendar text-secondary';
    }
  }

  getTurnoTimeRemaining(turno: Turno): string {
    const now = this.getCurrentDate();
    const turnoDate = this.getTurnoDate(turno);
    const diff = turnoDate.getTime() - now.getTime();
    
    if (diff < 0) return 'Pasado';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `En ${days} día${days > 1 ? 's' : ''}`;
    if (hours > 0) return `En ${hours} hora${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `En ${minutes} minuto${minutes > 1 ? 's' : ''}`;
    return 'Ahora';
  }

  // Función para reprogramar turno
  reprogramarTurno(turno: Turno): void {
    const pacienteNombre = `${turno.nombre} ${turno.apellido}`;
    
    this.showFriendlyNotification(
      'info',
      '⏳ Redirigiendo...',
      `Te estamos llevando a la página de reprogramación para el turno de ${pacienteNombre}.`,
      3000
    );
    
         // Navegar a la agenda para reprogramar
     setTimeout(() => {
       const turnoId = turno._id || turno.id?.toString() || '';
       this.router.navigate(['/agenda'], { 
         queryParams: { 
           reprogramar: turnoId,
           paciente: pacienteNombre
         } 
       });
     }, 1000);
  }

  // Métodos para manejar modales

  // Función para mostrar modal de detalles
  verDetallesTurno(turno: Turno): void {
    const pacienteNombre = `${turno.nombre} ${turno.apellido}`;
    const fechaFormateada = this.formatTurnoDate(turno.fecha);
    const horaFormateada = this.formatTurnoTime(turno.hora);
    const tiempoRestante = this.getTurnoTimeRemaining(turno);
    const precioFormateado = turno.precioFinal?.toLocaleString() || '0';
    
    this.detallesTurnoContent = `
      <div style="text-align: left; line-height: 1.6;">
        <div style="margin-bottom: 15px; padding: 10px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px;">
          <h5 style="margin: 0; font-weight: bold;">📋 Información del Turno</h5>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
          <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; border-left: 4px solid #007bff;">
            <strong style="color: #007bff;">👤 Paciente:</strong><br>
            <span style="font-size: 16px; font-weight: 600;">${pacienteNombre}</span>
          </div>
          
          <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; border-left: 4px solid #28a745;">
            <strong style="color: #28a745;">💰 Precio:</strong><br>
            <span style="font-size: 16px; font-weight: 600; color: #28a745;">$${precioFormateado}</span>
          </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
          <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; border-left: 4px solid #ffc107;">
            <strong style="color: #ffc107;">📅 Fecha:</strong><br>
            <span style="font-size: 14px;">${fechaFormateada}</span>
          </div>
          
          <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; border-left: 4px solid #17a2b8;">
            <strong style="color: #17a2b8;">🕐 Hora:</strong><br>
            <span style="font-size: 14px;">${horaFormateada}</span>
          </div>
        </div>
        
        <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; border-left: 4px solid #6f42c1; margin-bottom: 15px;">
          <strong style="color: #6f42c1;">🦷 Tratamiento:</strong><br>
          <span style="font-size: 16px; font-weight: 600;">${turno.tratamiento}</span>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
          <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; border-left: 4px solid #dc3545;">
            <strong style="color: #dc3545;">📊 Estado:</strong><br>
            <span style="font-size: 14px; font-weight: 600;">${this.getStatusText(turno.estado)}</span>
          </div>
          
          <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; border-left: 4px solid #fd7e14;">
            <strong style="color: #fd7e14;">⏱️ Tiempo Restante:</strong><br>
            <span style="font-size: 14px; font-weight: 600;">${tiempoRestante}</span>
          </div>
        </div>
        
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 10px; border-radius: 8px; text-align: center;">
          <small>💡 Puedes realizar acciones como completar, reprogramar o cancelar este turno usando los botones disponibles.</small>
        </div>
      </div>
    `;
    
    // Mostrar el modal
    const modal = new (window as any).bootstrap.Modal(document.getElementById('detallesTurnoModal'));
    modal.show();
  }

  // Función para mostrar modal de cancelación
  cancelarTurno(turno: Turno): void {
    this.turnoSeleccionado = turno;
    const pacienteNombre = `${turno.nombre} ${turno.apellido}`;
    const fechaFormateada = this.formatTurnoDate(turno.fecha);
    const horaFormateada = this.formatTurnoTime(turno.hora);
    
    this.cancelarTurnoContent = `
      <div style="text-align: left; line-height: 1.6;">
        <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
          <p style="margin: 0; color: #856404; font-weight: 600;">
            🚨 ¿Estás seguro de que quieres cancelar este turno?
          </p>
        </div>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #dc3545; margin-bottom: 15px;">
          <h6 style="margin: 0 0 10px 0; color: #dc3545;">📋 Detalles del Turno a Cancelar:</h6>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <strong style="color: #6c757d;">👤 Paciente:</strong><br>
              <span style="font-weight: 600;">${pacienteNombre}</span>
            </div>
            <div>
              <strong style="color: #6c757d;">🦷 Tratamiento:</strong><br>
              <span style="font-weight: 600;">${turno.tratamiento}</span>
            </div>
            <div>
              <strong style="color: #6c757d;">📅 Fecha:</strong><br>
              <span style="font-weight: 600;">${fechaFormateada}</span>
            </div>
            <div>
              <strong style="color: #6c757d;">🕐 Hora:</strong><br>
              <span style="font-weight: 600;">${horaFormateada}</span>
            </div>
          </div>
        </div>
        
        <div style="background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 8px; padding: 12px; margin-bottom: 15px;">
          <p style="margin: 0; color: #0c5460; font-size: 14px;">
            <strong>💡 Información importante:</strong><br>
            • Se enviará una notificación automática al paciente<br>
            • El turno quedará marcado como "Cancelado"<br>
            • El paciente podrá reservar un nuevo turno si lo desea
          </p>
        </div>
        
        <div style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; padding: 10px; border-radius: 8px; text-align: center;">
          <small>🔒 Esta acción no se puede deshacer. Confirma solo si estás seguro.</small>
        </div>
      </div>
    `;
    
    // Mostrar el modal
    const modal = new (window as any).bootstrap.Modal(document.getElementById('cancelarTurnoModal'));
    modal.show();
  }

  // Función para confirmar cancelación
  confirmarCancelacion(): void {
    if (!this.turnoSeleccionado) return;
    
    const turno = this.turnoSeleccionado;
    const pacienteNombre = `${turno.nombre} ${turno.apellido}`;
    const turnoId = turno._id || turno.id?.toString() || '';
    
    this.turnoService.cambiarEstadoTurno(turnoId, 'cancelado').subscribe({
      next: (response) => {
        // Cerrar el modal
        const modal = (window as any).bootstrap.Modal.getInstance(document.getElementById('cancelarTurnoModal'));
        modal.hide();
        
        this.showFriendlyNotification(
          'success',
          '✅ Turno Cancelado Exitosamente',
          `El turno de ${pacienteNombre} ha sido cancelado correctamente.`,
          6000
        );
        this.loadTurnosData();
        this.turnoSeleccionado = null;
      },
      error: (error) => {
        this.showFriendlyNotification(
          'error',
          '❌ Error al Cancelar Turno',
          `No se pudo cancelar el turno de ${pacienteNombre}.`,
          6000
        );
      }
    });
  }

  // Función para mostrar modal de pago
  marcarComoPagado(turno: Turno): void {
    this.turnoSeleccionado = turno;
    const pacienteNombre = `${turno.nombre} ${turno.apellido}`;
    const fechaFormateada = this.formatTurnoDate(turno.fecha);
    const horaFormateada = this.formatTurnoTime(turno.hora);
    const precioFormateado = turno.precioFinal?.toLocaleString() || '0';
    
    this.confirmarPagoContent = `
      <div style="text-align: left; line-height: 1.6;">
        <div style="background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
          <p style="margin: 0; color: #0c5460; font-weight: 600;">
            💳 ¿Confirmas que el paciente ha realizado el pago?
          </p>
        </div>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #28a745; margin-bottom: 15px;">
          <h6 style="margin: 0 0 10px 0; color: #28a745;">📋 Detalles del Pago:</h6>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <strong style="color: #6c757d;">👤 Paciente:</strong><br>
              <span style="font-weight: 600;">${pacienteNombre}</span>
            </div>
            <div>
              <strong style="color: #6c757d;">💰 Monto:</strong><br>
              <span style="font-weight: 600; color: #28a745;">$${precioFormateado}</span>
            </div>
            <div>
              <strong style="color: #6c757d;">📅 Fecha:</strong><br>
              <span style="font-weight: 600;">${fechaFormateada}</span>
            </div>
            <div>
              <strong style="color: #6c757d;">🕐 Hora:</strong><br>
              <span style="font-weight: 600;">${horaFormateada}</span>
            </div>
          </div>
        </div>
        
        <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; padding: 12px; margin-bottom: 15px;">
          <p style="margin: 0; color: #155724; font-size: 14px;">
            <strong>✅ Beneficios de confirmar el pago:</strong><br>
            • El paciente puede proceder con su tratamiento<br>
            • Se actualiza el estado del turno a "Pagado"<br>
            • Se registra la transacción en el sistema
          </p>
        </div>
      </div>
    `;
    
    // Mostrar el modal
    const modal = new (window as any).bootstrap.Modal(document.getElementById('confirmarPagoModal'));
    modal.show();
  }

  // Función para confirmar pago
  confirmarPago(): void {
    if (!this.turnoSeleccionado) return;
    
    const turno = this.turnoSeleccionado;
    const pacienteNombre = `${turno.nombre} ${turno.apellido}`;
    const turnoId = turno._id || turno.id?.toString() || '';
    
    this.turnoService.cambiarEstadoTurno(turnoId, 'pagado').subscribe({
      next: (response) => {
        // Cerrar el modal
        const modal = (window as any).bootstrap.Modal.getInstance(document.getElementById('confirmarPagoModal'));
        modal.hide();
        
        this.showFriendlyNotification(
          'success',
          '✅ Pago Confirmado Exitosamente',
          `El pago de ${pacienteNombre} ha sido confirmado.`,
          6000
        );
        this.loadTurnosData();
        this.turnoSeleccionado = null;
      },
      error: (error) => {
        this.showFriendlyNotification(
          'error',
          '❌ Error al Confirmar Pago',
          `No se pudo confirmar el pago de ${pacienteNombre}.`,
          6000
        );
      }
    });
  }

  // Función para mostrar modal de completado
  completarTurno(turno: Turno): void {
    this.turnoSeleccionado = turno;
    const pacienteNombre = `${turno.nombre} ${turno.apellido}`;
    const fechaFormateada = this.formatTurnoDate(turno.fecha);
    const horaFormateada = this.formatTurnoTime(turno.hora);
    const tratamiento = turno.tratamiento;
    
    this.confirmarCompletadoContent = `
      <div style="text-align: left; line-height: 1.6;">
        <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
          <p style="margin: 0; color: #155724; font-weight: 600;">
            🎉 ¿Confirmas que el tratamiento ha sido completado exitosamente?
          </p>
        </div>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #28a745; margin-bottom: 15px;">
          <h6 style="margin: 0 0 10px 0; color: #28a745;">📋 Detalles del Tratamiento:</h6>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <strong style="color: #6c757d;">👤 Paciente:</strong><br>
              <span style="font-weight: 600;">${pacienteNombre}</span>
            </div>
            <div>
              <strong style="color: #6c757d;">🦷 Tratamiento:</strong><br>
              <span style="font-weight: 600;">${tratamiento}</span>
            </div>
            <div>
              <strong style="color: #6c757d;">📅 Fecha:</strong><br>
              <span style="font-weight: 600;">${fechaFormateada}</span>
            </div>
            <div>
              <strong style="color: #6c757d;">🕐 Hora:</strong><br>
              <span style="font-weight: 600;">${horaFormateada}</span>
            </div>
          </div>
        </div>
        
        <div style="background: #e2e3e5; border: 1px solid #d6d8db; border-radius: 8px; padding: 12px; margin-bottom: 15px;">
          <p style="margin: 0; color: #6c757d; font-size: 14px;">
            <strong>📝 Al completar el turno:</strong><br>
            • Se registrará en el historial médico del paciente<br>
            • El turno quedará marcado como "Completado"<br>
            • Se podrá generar un reporte de la consulta
          </p>
        </div>
      </div>
    `;
    
    // Mostrar el modal
    const modal = new (window as any).bootstrap.Modal(document.getElementById('confirmarCompletadoModal'));
    modal.show();
  }

  // Función para confirmar completado
  confirmarCompletado(): void {
    if (!this.turnoSeleccionado) return;
    
    const turno = this.turnoSeleccionado;
    const pacienteNombre = `${turno.nombre} ${turno.apellido}`;
    const turnoId = turno._id || turno.id?.toString() || '';
    
    this.turnoService.cambiarEstadoTurno(turnoId, 'completado').subscribe({
      next: (response) => {
        // Cerrar el modal
        const modal = (window as any).bootstrap.Modal.getInstance(document.getElementById('confirmarCompletadoModal'));
        modal.hide();
        
        this.showFriendlyNotification(
          'success',
          '🎉 ¡Turno Completado Exitosamente!',
          `El turno de ${pacienteNombre} ha sido completado exitosamente.`,
          6000
        );
        this.loadTurnosData();
        this.turnoSeleccionado = null;
      },
      error: (error) => {
        this.showFriendlyNotification(
          'error',
          '❌ Error al Completar Turno',
          `No se pudo completar el turno de ${pacienteNombre}.`,
          6000
        );
      }
    });
  }

  // Función para mostrar modal de reactivación
  marcarComoReservado(turno: Turno): void {
    this.turnoSeleccionado = turno;
    const pacienteNombre = `${turno.nombre} ${turno.apellido}`;
    const fechaFormateada = this.formatTurnoDate(turno.fecha);
    const horaFormateada = this.formatTurnoTime(turno.hora);
    const tratamiento = turno.tratamiento;
    
    this.confirmarReactivacionContent = `
      <div style="text-align: left; line-height: 1.6;">
        <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
          <p style="margin: 0; color: #856404; font-weight: 600;">
            🔄 ¿Quieres reactivar este turno cancelado?
          </p>
        </div>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin-bottom: 15px;">
          <h6 style="margin: 0 0 10px 0; color: #ffc107;">📋 Detalles del Turno a Reactivar:</h6>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <strong style="color: #6c757d;">👤 Paciente:</strong><br>
              <span style="font-weight: 600;">${pacienteNombre}</span>
            </div>
            <div>
              <strong style="color: #6c757d;">🦷 Tratamiento:</strong><br>
              <span style="font-weight: 600;">${tratamiento}</span>
            </div>
            <div>
              <strong style="color: #6c757d;">📅 Fecha:</strong><br>
              <span style="font-weight: 600;">${fechaFormateada}</span>
            </div>
            <div>
              <strong style="color: #6c757d;">🕐 Hora:</strong><br>
              <span style="font-weight: 600;">${horaFormateada}</span>
            </div>
          </div>
        </div>
        
        <div style="background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 8px; padding: 12px; margin-bottom: 15px;">
          <p style="margin: 0; color: #0c5460; font-size: 14px;">
            <strong>✅ Al reactivar el turno:</strong><br>
            • El estado cambiará de "Cancelado" a "Reservado"<br>
            • El paciente podrá asistir normalmente<br>
            • Se enviará una notificación de reactivación
          </p>
        </div>
      </div>
    `;
    
    // Mostrar el modal
    const modal = new (window as any).bootstrap.Modal(document.getElementById('confirmarReactivacionModal'));
    modal.show();
  }

  // Función para confirmar reactivación
  confirmarReactivacion(): void {
    if (!this.turnoSeleccionado) return;
    
    const turno = this.turnoSeleccionado;
    const pacienteNombre = `${turno.nombre} ${turno.apellido}`;
    const turnoId = turno._id || turno.id?.toString() || '';
    
    this.turnoService.cambiarEstadoTurno(turnoId, 'reservado').subscribe({
      next: (response) => {
        // Cerrar el modal
        const modal = (window as any).bootstrap.Modal.getInstance(document.getElementById('confirmarReactivacionModal'));
        modal.hide();
        
        this.showFriendlyNotification(
          'success',
          '🔄 ¡Turno Reactivado Exitosamente!',
          `El turno de ${pacienteNombre} ha sido reactivado correctamente.`,
          6000
        );
        this.loadTurnosData();
        this.turnoSeleccionado = null;
      },
      error: (error) => {
        this.showFriendlyNotification(
          'error',
          '❌ Error al Reactivar Turno',
          `No se pudo reactivar el turno de ${pacienteNombre}.`,
          6000
        );
      }
    });
  }

  // ===== MÉTODOS PARA CONFIGURACIÓN PERSONALIZADA DEL DENTISTA =====

  // Cargar configuración personalizada del dentista
  cargarDisponibilidadDentista(): void {
    if (!this.user?.id || this.user?.tipoUsuario !== 'dentista') {
      console.log('⚠️ No es dentista o no tiene ID, no se carga configuración personalizada');
      return;
    }

    console.log('🦷 Cargando configuración personalizada del dentista:', this.user.id);
    
    this.disponibilidadService.getDisponibilidad(this.user.id.toString()).subscribe({
      next: (response) => {
        console.log('✅ Configuración personalizada cargada:', response);
        
        if (response && response.disponibilidad) {
          this.disponibilidadDentista = response.disponibilidad;
          this.generarHorariosPersonalizados();
          this.procesarConfiguracionPersonalizada();
          
          console.log('📅 Configuración aplicada:', {
            horarios: this.horariosPersonalizados.length,
            diasLaborables: this.disponibilidadDentista?.diasLaborables,
            diasNoDisponibles: this.diasNoDisponibles.length,
            franjasNoDisponibles: this.franjasNoDisponibles.length,
            pausas: this.pausas.length,
            horarioInicio: this.disponibilidadDentista?.horarioInicio,
            horarioFin: this.disponibilidadDentista?.horarioFin
          });
        } else {
          console.log('⚠️ No se encontró configuración personalizada, usando configuración por defecto');
          this.disponibilidadDentista = this.disponibilidadService.getConfiguracionPorDefecto();
          this.generarHorariosPersonalizados();
          this.procesarConfiguracionPersonalizada();
        }
      },
      error: (error) => {
        console.error('❌ Error al cargar disponibilidad:', error);
        console.log('🔄 Usando configuración por defecto');
        this.disponibilidadDentista = this.disponibilidadService.getConfiguracionPorDefecto();
        this.generarHorariosPersonalizados();
        this.procesarConfiguracionPersonalizada();
      }
    });
  }

  // Generar horarios personalizados basados en la configuración del dentista
  generarHorariosPersonalizados(): void {
    if (!this.disponibilidadDentista) {
      console.log('⚠️ No hay configuración de disponibilidad, usando horarios por defecto');
      this.horariosPersonalizados = [
        '08:00', '08:20', '08:40', '09:00', '09:20', '09:40',
        '10:00', '10:20', '10:40', '11:00', '11:20', '11:40',
        '12:00', '12:20', '12:40', '13:00', '13:20', '13:40',
        '14:00', '14:20', '14:40', '15:00', '15:20', '15:40',
        '16:00', '16:20', '16:40', '17:00', '17:20', '17:40',
        '18:00'
      ];
      return;
    }

    this.horariosPersonalizados = this.disponibilidadService.generarHorarios(this.disponibilidadDentista);
    console.log('⏰ Horarios personalizados generados:', this.horariosPersonalizados);
  }

  // Procesar configuración personalizada
  procesarConfiguracionPersonalizada(): void {
    if (!this.disponibilidadDentista) return;

    // Procesar días no disponibles
    this.diasNoDisponibles = this.disponibilidadDentista.diasNoLaborables.map(dia => dia.fecha);
    
    // Procesar franjas no disponibles
    this.franjasNoDisponibles = this.disponibilidadDentista.franjasNoDisponibles || [];
    
    // Procesar pausas
    this.pausas = this.disponibilidadDentista.pausas || [];
    
    console.log('📅 Configuración procesada:', {
      diasNoDisponibles: this.diasNoDisponibles.length,
      franjasNoDisponibles: this.franjasNoDisponibles.length,
      pausas: this.pausas.length
    });
  }

  // Verificar si una fecha es disponible según la configuración del dentista
  esFechaDisponible(fecha: string): boolean {
    if (!this.disponibilidadDentista) {
      console.log('📅 No hay configuración de disponibilidad, fecha disponible:', fecha);
      return true;
    }

    const date = new Date(fecha);
    const diaSemana = date.getDay();
    const nombreDia = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][diaSemana];
    
    console.log(`📅 Verificando fecha ${fecha} (${nombreDia} - día ${diaSemana}):`);
    console.log('📅 Días laborables configurados:', this.disponibilidadDentista.diasLaborables);
    
    // Verificar si es un día laborable
    const esDiaLaborable = this.disponibilidadService.esDiaLaborable(diaSemana, this.disponibilidadDentista);
    console.log('📅 ¿Es día laborable?', esDiaLaborable);
    
    if (!esDiaLaborable) {
      console.log('❌ Fecha no disponible: No es día laborable');
      return false;
    }
    
    // Verificar si es un día no laborable específico
    const esDiaNoLaborable = this.disponibilidadService.esDiaNoLaborable(fecha, this.disponibilidadDentista);
    console.log('📅 ¿Es día no laborable específico?', esDiaNoLaborable);
    
    if (esDiaNoLaborable) {
      console.log('❌ Fecha no disponible: Es día no laborable específico');
      return false;
    }
    
    console.log('✅ Fecha disponible según configuración');
    return true;
  }

  // Verificar si un horario está disponible según la configuración del dentista
  esHorarioDisponible(hora: string, fecha: string): boolean {
    if (!this.disponibilidadDentista) return true;

    // Obtener el día de la semana de la fecha
    const selectedDate = new Date(fecha);
    const diaSemana = selectedDate.getDay();

    // Verificar si está en las franjas no disponibles para este día de la semana
    for (const franja of this.franjasNoDisponibles) {
      if (franja.diaSemana === diaSemana && 
          hora >= franja.horaInicio && hora < franja.horaFin) {
        return false;
      }
    }
    
    // Verificar si está en las pausas para este día de la semana
    for (const pausa of this.pausas) {
      if (pausa.diaSemana === diaSemana && 
          hora >= pausa.horaInicio && hora < pausa.horaFin) {
        return false;
      }
    }
    
    return true;
  }

  // Verificar si tiene configuración personalizada
  tieneConfiguracionPersonalizada(): boolean {
    return this.disponibilidadDentista !== null && 
           this.disponibilidadDentista !== undefined &&
           this.horariosPersonalizados.length > 0;
  }

  // Obtener información de disponibilidad
  getDisponibilidadInfo(): string {
    if (!this.disponibilidadDentista) {
      return 'Configuración por defecto';
    }

    const diasLaborables = this.disponibilidadDentista.diasLaborables.map(dia => 
      ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dia]
    ).join(', ');

    return `${this.disponibilidadDentista.horarioInicio} - ${this.disponibilidadDentista.horarioFin} | ${diasLaborables}`;
  }

  // Obtener información detallada de configuración
  getConfiguracionDetallada(): any {
    if (!this.disponibilidadDentista) {
      return {
        horarioInicio: '08:00',
        horarioFin: '18:00',
        intervaloMinutos: 20,
        diasLaborables: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
        diasNoDisponibles: 0,
        franjasBloqueadas: 0,
        pausas: 0
      };
    }

    const diasLaborables = this.disponibilidadDentista.diasLaborables.map(dia => 
      ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dia]
    );

    return {
      horarioInicio: this.disponibilidadDentista.horarioInicio || '08:00',
      horarioFin: this.disponibilidadDentista.horarioFin || '18:00',
      intervaloMinutos: this.disponibilidadDentista.intervaloMinutos || 20,
      diasLaborables: diasLaborables,
      diasNoDisponibles: this.diasNoDisponibles.length,
      franjasBloqueadas: this.franjasNoDisponibles.length,
      pausas: this.pausas.length
    };
  }
}
