import { Component, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { User, Turno, Paciente } from '../../interfaces';
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
    private authService: AuthService, // <--- INYECTAR
    private dataRefreshService: DataRefreshService
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
      }
    });
    // Solo cargar chat para dentistas
    if (this.user?.tipoUsuario === 'dentista') {
      this.loadChatHistory();
      this.addWelcomeMessage();
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

  volverAPacientes(): void {
    this.router.navigate(['/pacientes']);
  }

  goToPacientes(): void {
    this.router.navigate(['/pacientes']);
  }

  cancelarTurno(turno: Turno): void {
    // Notificación de advertencia (puedes implementar confirmación personalizada si lo deseas)
    this.notificationService.showWarning('¿Estás seguro de que quieres cancelar este turno?');
    const turnoId = turno._id || turno.id?.toString() || '';
    this.turnoService.cambiarEstadoTurno(turnoId, 'cancelado').subscribe({
      next: () => {
        this.loadTurnosData();
        this.loadRealAdminStats();
        this.notificationService.showSuccess('Turno cancelado exitosamente');
      },
      error: () => this.notificationService.showError('Error al cancelar el turno')
    });
  }

  marcarComoPagado(turno: Turno): void {
    const turnoId = turno._id || turno.id?.toString() || '';
    this.turnoService.cambiarEstadoTurno(turnoId, 'pagado').subscribe({
      next: () => {
        this.loadTurnosData();
        this.notificationService.showSuccess('Turno marcado como pagado');
      },
      error: () => this.notificationService.showError('Error al marcar el turno como pagado')
    });
  }

  // Método público para recargar todas las estadísticas
  refreshDashboard(): void {
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
    const today = new Date().toISOString().slice(0, 10);
    return this.turnos.filter(turno => (turno.fecha || '').slice(0, 10) === today).length;
  }

  get proximoTurno(): Turno | null {
    const today = new Date().toISOString().slice(0, 10);
    const futureTurnos = this.turnos
      .filter(turno => (turno.fecha || '').slice(0, 10) >= today && turno.estado === 'reservado')
      .sort((a, b) => ((a.fecha || '').slice(0, 10)).localeCompare((b.fecha || '').slice(0, 10)));
    return futureTurnos.length > 0 ? futureTurnos[0] : null;
  }

  getStatusClass(estado: string): string {
    switch (estado) {
      case 'reservado': return 'badge bg-primary';
      case 'completado': return 'badge bg-success';
      case 'cancelado': return 'badge bg-danger';
      case 'pagado': return 'badge bg-primary';
      default: return 'badge bg-secondary';
    }
  }

  getStatusText(estado: string): string {
    switch (estado) {
      case 'reservado': return 'Reservado';
      case 'completado': return 'Completado';
      case 'cancelado': return 'Cancelado';
      case 'pagado': return 'Pagado';
      case 'pendiente': return 'Pendiente';
      case 'pendiente_pago': return 'Pendiente de Pago';
      default: return 'Sin estado';
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

  /*getUserGreeting(): string {
    if (!this.user) return 'Usuario';
    
    // Si hay nombre disponible, usarlo
    if (this.user.nombre && this.user.apellido) {
      return `${this.user.nombre} ${this.user.apellido}`;
    } else if (this.user.nombre) {
      return this.user.nombre;
    }
    
    // Si no hay nombre, usar el tipo de usuario como saludo
    switch (this.user.tipoUsuario) {
      case 'dentista':
        return 'dentista';
      case 'administrador':
        return 'administrador';
      case 'paciente':
        return 'paciente';
      default:
        return 'usuario';
    }
  }*/
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



}
