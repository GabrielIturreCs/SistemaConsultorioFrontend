import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ChatbotService } from '../../services/ChatBot.service';
import { ChatService } from '../../services/chat.service';
import { ChatMessage, QuickQuestion } from '../../interfaces/chatbot.interface';
import { ActionButton } from '../../interfaces/message.interface';
import { TurnoService } from '../../services/turno.service';
import { PacienteService } from '../../services/paciente.service';
import { DataRefreshService } from '../../services/data-refresh.service';
import { MercadoPagoService } from '../../services/mercadopago.service';
import { CookiePaymentService } from '../../services/cookie-payment.service';
import { Tratamiento } from '../../interfaces';
import { NotificationService } from '../../services/notification.service';
import { DentistaService } from '../../services/dentista.service';
import { DisponibilidadService } from '../../services/disponibilidad.service';
import { Disponibilidad } from '../../interfaces';
import { PdfExportService } from '../../services/pdf-export.service';

interface User {
  id: number;
  nombreUsuario: string;
  nombre: string;
  apellido: string;
  tipoUsuario: string;
  patientId?: string;
  hasCompleteProfile?: boolean;
  needsProfileCompletion?: boolean;
}

interface Paciente {
  id?: number;
  _id?: string;
  nombre: string;
  apellido: string;
  dni: string;
  obraSocial: string;
  userId?: string;
}

@Component({
  selector: 'app-reservar',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './reservar.component.html',
  styleUrl: './reservar.component.css'
})
export class ReservarComponent implements OnInit {
  user: User | null = null;
  isLoading: boolean = false;

  // Wizard Steps
  currentStep: number = 1;
  totalSteps: number = 6; // Ambos tipos de usuario tienen 6 pasos
  
  // Estado del pago
  paymentSuccess: boolean = false;
  redirectCountdown: number = 8;
  metodoPago: string = 'online'; // Método de pago seleccionado
  
  // Para dentistas/administradores - selección de paciente
  selectedPaciente: Paciente | null = null;
  searchTerm: string = '';
  filteredPacientes: Paciente[] = [];
  
  // Calendar and booking data
  selectedDate: string = '';
  selectedTime: string = '';
  selectedTreatment: Tratamiento | null = null;
  availableDates: string[] = [];
  availableTimeSlots: { time: string, available: boolean }[] = [];
  occupiedSlots: { [key: string]: string[] } = {}; // fecha -> array de horas ocupadas
  
  // Calendar view
  currentMonth: Date = new Date();
  calendarDays: { date: Date, available: boolean, isToday: boolean, isSelected: boolean }[] = [];

  // Chatbot properties
  @ViewChild('chatMessages') chatMessages!: ElementRef;
  chatOpen = false;
  messages: ChatMessage[] = [];
  chatForm: FormGroup;
  isTyping = false;
  quickQuestions: QuickQuestion[] = [
    { text: '¿Cuáles son los horarios?', action: 'horarios' },
    { text: '¿Qué tratamientos ofrecen?', action: 'tratamientos' },
    { text: '¿Cuáles son los precios?', action: 'precios' },
    { text: '¿Cómo funciona la reserva?', action: 'reserva' }
  ];

  turnoForm = {
    pacienteId: '',
    dentistaId: '',
    fecha: '',
    hora: '',
    tratamientoId: ''
  };

  tratamientos: Tratamiento[] = [];
  pacientes: Paciente[] = [];
  showCancelReservaModal: boolean = false;
  dentistas: any[] = [];
  selectedDentista: any = null;
  
  // Propiedades para disponibilidad personalizada
  disponibilidadDentista: Disponibilidad | null = null;
  horariosPersonalizados: string[] = [];
  diasNoDisponibles: string[] = [];
  franjasNoDisponibles: any[] = [];
  pausas: any[] = [];
  
  // Información del turno creado para el paso 6
  turnoCreado: any = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private chatbotService: ChatbotService,
    private chatService: ChatService,
    private turnoService: TurnoService,
    private pacienteService: PacienteService,
    private dataRefreshService: DataRefreshService,
    private mercadoPagoService: MercadoPagoService,
    private cookiePaymentService: CookiePaymentService,
    private notificationService: NotificationService,
    private dentistaService: DentistaService,
    private disponibilidadService: DisponibilidadService,
    private pdfExportService: PdfExportService
  ) {
    this.chatForm = this.fb.group({
      message: ['', [Validators.required, Validators.minLength(1)]]
    });
  }

  ngOnInit(): void {
    this.loadUserData();
    this.loadPacientes();
    this.loadTratamientos();
    this.loadChatHistory();
    this.addWelcomeMessage();
    
    // Cargar configuración personalizada del dentista si es dentista
    if (this.user?.tipoUsuario === 'dentista') {
      console.log('🦷 Usuario es dentista, cargando configuración personalizada...');
      // Establecer el dentista seleccionado como el usuario actual
      this.selectedDentista = {
        _id: this.user.id.toString(),
        id: this.user.id,
        nombre: this.user.nombre,
        apellido: this.user.apellido
      };
      
      // Cargar disponibilidad personalizada del dentista
      this.cargarDisponibilidadDentista(this.user.id.toString());
    }
    
    // Solo generar calendario si no es paciente (para dentistas/administradores)
    // Los pacientes necesitan seleccionar un dentista primero
    if (this.user?.tipoUsuario !== 'paciente') {
      // Para dentistas, esperar a que se cargue la configuración personalizada
      if (this.user?.tipoUsuario === 'dentista') {
        setTimeout(() => {
          this.generateCalendar();
        }, 1500); // Dar tiempo a que se cargue la disponibilidad
      } else {
        this.generateCalendar();
      }
    }
    
    this.loadOccupiedSlots();
    if (this.user?.tipoUsuario === 'paciente') {
      this.loadDentistas();
    }
    
    // Verificar si hay parámetros de pago de Mercado Pago
    this.procesarResultadoPago();
    
    // Manejar el regreso desde el pago exitoso
    this.handlePaymentReturn();
    
    // Ambos tipos de usuario tienen 6 pasos totales
    this.totalSteps = 6;

    // Detectar resultado de pago por query param con manejo mejorado
    this.route.queryParams.subscribe(params => {
      console.log('Query params recibidos:', params);
      
      // Verificar si viene de pago exitoso
      if (params['payment'] === 'success' || params['returnFromPayment'] === 'true') {
        console.log('✅ Detectado retorno de pago exitoso');
        this.handleSuccessfulPaymentReturn();
        return; // Salir temprano para evitar conflictos
      }
      
      // Verificar si viene de pago fallido
      if (params['payment'] === 'failure') {
        console.log('❌ Detectado pago fallido');
        this.currentStep = this.shouldSelectPaciente ? 6 : 5;
        this.paymentSuccess = false;
        this.notificationService.showWarning('El pago no se completó. Puedes intentar nuevamente o contactar con soporte.');
        return;
      }
      
      // Verificar si viene de pago pendiente
      if (params['payment'] === 'pending') {
        console.log('⏳ Detectado pago pendiente');
        this.currentStep = this.shouldSelectPaciente ? 6 : 5;
        this.paymentSuccess = false;
        this.notificationService.showInfo('Tu pago está pendiente de confirmación. Te notificaremos cuando se complete.');
        return;
      }
      
      // Verificar si hay un paso específico en los parámetros
      if (params['step'] === '5') {
        console.log('🎯 Detectado paso 5 en parámetros');
        this.currentStep = this.shouldSelectPaciente ? 6 : 5;
        if (params['payment'] === 'success') {
          this.paymentSuccess = true;
        }
      }
    });

    // Force page refresh when at the beginning of the wizard
    // This ensures fresh data when starting the reservation process
    setTimeout(() => {
      // Check if we're at the very beginning (step 1)
      if (this.currentStep === 1) {
        console.log('At beginning of reservation wizard - data ready');
        // Removed automatic page refresh as it interferes with navigation
        sessionStorage.setItem('reservar-step1-loaded', 'true');
      }
    }, 500); // Give more time for user data to load
  }

  // Cargar historial del chat desde ChatService con localStorage
  loadChatHistory(): void {
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
        console.log('Continuando conversación en reservar:', summary);
      }
    }
  }

  // Chatbot methods
  addWelcomeMessage(): void {
    const welcomeMessage: ChatMessage = {
      text: '¡Hola! Te ayudo con tu reserva de turno. ¿Tienes alguna pregunta sobre nuestros tratamientos o precios?',
      isUser: false,
      timestamp: new Date()
    };
    this.messages.push(welcomeMessage);
  }

  toggleChat(): void {
    this.chatOpen = !this.chatOpen;
    if (this.chatOpen && this.messages.length === 0) {
      this.addWelcomeMessage();
    }
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
        console.log('Sugerencia del chatbot en reservar:', suggestedNextStep);
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
        console.log(`Continuando conversación en reservar sobre: ${lastTopic}`);
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
    // Verificar si estamos en el navegador (no en el servidor)
    if (typeof window !== 'undefined' && window.localStorage) {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          this.user = JSON.parse(userStr);
          console.log('Usuario cargado:', this.user);
        } catch (error) {
          console.error('Error al cargar usuario:', error);
          this.user = null;
        }
      } else {
        console.log('No se encontró información de usuario en localStorage');
        
        // Si no hay usuario pero viene de pago exitoso, intentar recuperar información
        const urlParams = new URLSearchParams(window.location.search);
        const isReturnFromPayment = urlParams.get('returnFromPayment') === 'true' || 
                                   urlParams.get('payment') === 'success';
        
        if (isReturnFromPayment) {
          console.log('🔄 Detectado retorno de pago sin usuario, intentando recuperar sesión');
          // Intentar recuperar información del usuario desde sessionStorage
          const backupUserStr = sessionStorage.getItem('user_backup');
          if (backupUserStr) {
            try {
              this.user = JSON.parse(backupUserStr);
              console.log('✅ Usuario recuperado desde backup:', this.user);
            } catch (error) {
              console.error('Error al recuperar usuario desde backup:', error);
              this.user = null;
            }
          } else {
            console.log('⚠️ No se encontró backup de usuario');
            this.user = null;
          }
        } else {
          console.log('Redirigiendo a login');
          this.router.navigate(['/login']);
        }
      }
    }
  }

  loadPacientes(): void {
    this.pacienteService.getPacientes().subscribe({
      next: (pacientes) => {
        this.pacientes = pacientes;
        this.filteredPacientes = pacientes;
        console.log('Pacientes cargados:', pacientes);
      },
      error: (error) => {
        console.error('Error al cargar pacientes:', error);
        this.notificationService.showError('Error al cargar la lista de pacientes');
        this.pacientes = [];
        this.filteredPacientes = [];
      }
    });
  }

  // Función para filtrar pacientes
  filterPacientes(): void {
    if (!this.searchTerm.trim()) {
      this.filteredPacientes = this.pacientes;
      return;
    }

    const term = this.searchTerm.toLowerCase();
    this.filteredPacientes = this.pacientes.filter(paciente => 
      paciente.nombre.toLowerCase().includes(term) ||
      paciente.apellido.toLowerCase().includes(term) ||
      paciente.dni.toLowerCase().includes(term) ||
      (paciente.obraSocial && paciente.obraSocial.toLowerCase().includes(term))
    );
  }

  // Función para limpiar búsqueda
  clearSearch(): void {
    this.searchTerm = '';
    this.filteredPacientes = this.pacientes;
  }

  loadTratamientos(): void {
    console.log('Cargando tratamientos...');
    this.turnoService.getTratamientos().subscribe({
      next: (tratamientos) => {
        console.log('Tratamientos recibidos:', tratamientos);
        this.tratamientos = tratamientos;
      },
      error: (error) => {
        console.error('Error cargando tratamientos:', error);
        // Datos de prueba en caso de error
        this.tratamientos = [
          {
            id: 1,
            nroTratamiento: 1,
            descripcion: 'Consulta General',
            duracion: '30',
            precio: 5000,
            _id: '1'
          },
          {
            id: 2,
            nroTratamiento: 2,
            descripcion: 'Limpieza Dental',
            duracion: '45',
            precio: 8000,
            _id: '2'
          },
          {
            id: 3,
            nroTratamiento: 3,
            descripcion: 'Empaste',
            duracion: '60',
            precio: 12000,
            _id: '3'
          },
          {
            id: 4,
            nroTratamiento: 4,
            descripcion: 'Extracción',
            duracion: '45',
            precio: 15000,
            _id: '4'
          },
          {
            id: 5,
            nroTratamiento: 5,
            descripcion: 'Ortodoncia',
            duracion: '90',
            precio: 10000,
            _id: '5'
          }
        ];
        console.log('Usando datos de prueba:', this.tratamientos);
      }
    });
  }

  registrarTurno(): void {
    if (!this.canRegisterTurno) return;
    this.isLoading = true;
    const turnoData = {
      pacienteId: this.user?.tipoUsuario === 'paciente' ? this.user.id : parseInt(this.turnoForm.pacienteId),
      fecha: this.turnoForm.fecha,
      hora: this.turnoForm.hora,
      tratamientoId: parseInt(this.turnoForm.tratamientoId)
    };
    this.turnoService.createTurno(turnoData).subscribe({
      next: () => {
        this.isLoading = false;
        this.notificationService.showSuccess('¡Turno registrado exitosamente!');
        // Trigger refresh for patient dashboard
        this.dataRefreshService.triggerRefresh('agenda'); // Notifica a agenda
        this.dataRefreshService.triggerRefresh('vistaPaciente');
        this.router.navigate(['/dashboard']);
      },
      error: (error) => {
        this.isLoading = false;
        const errorMessage = error.error?.msg || 'Error al registrar el turno';
        this.notificationService.showError(errorMessage);
      }
    });
  }

  navigateToDashboard(): void {
    // Trigger refresh for patient dashboard before navigation
    this.dataRefreshService.triggerRefresh('vistaPaciente');
    
    // Add delay for more reliable navigation
    setTimeout(() => {
      // Check user type and navigate accordingly
      if (this.user?.tipoUsuario === 'paciente') {
        this.router.navigate(['/vistaPaciente']).catch((error: any) => {
          console.error('Navigation to /vistaPaciente failed:', error);
          window.location.href = '/vistaPaciente';
        });
      } else {
        this.router.navigate(['/dashboard']).catch((error: any) => {
          console.error('Navigation to /dashboard failed:', error);
          window.location.href = '/dashboard';
        });
      }
    }, 200);
  }

  getCurrentDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  get canRegisterTurno(): boolean {
    if (this.user?.tipoUsuario !== 'paciente' && !this.turnoForm.pacienteId) {
      return false;
    }
    return this.turnoForm.fecha.trim() !== '' &&
           this.turnoForm.hora.trim() !== '' &&
           this.turnoForm.tratamientoId.trim() !== '';
  }

  // Wizard Navigation Methods
  nextStep(): void {
    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
      // Clear refresh flag when advancing past step 1
      if (this.currentStep > 1) {
        sessionStorage.removeItem('reservar-step1-refreshed');
      }
    }
  }

  prevStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  goToStep(step: number): void {
    this.currentStep = step;
  }

  resetWizard(): void {
    this.currentStep = 1;
    this.selectedDate = '';
    this.selectedTime = '';
    this.selectedTreatment = null;
    this.selectedPaciente = null; // Resetear paciente seleccionado
    this.generateCalendar();
  }

  // Calendar Methods
  generateCalendar(): void {
    console.log('🔄 Generando calendario...');
    console.log('📅 Configuración actual:', this.disponibilidadDentista);
    console.log('🦷 Dentista seleccionado:', this.selectedDentista);
    
    this.calendarDays = [];
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    
    // First day of the month
    const firstDay = new Date(year, month, 1);
    // Last day of the month
    const lastDay = new Date(year, month + 1, 0);
    
    // Start from the first Monday of the week containing the 1st day
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - ((startDate.getDay() + 6) % 7));
    
    // Generate 42 days (6 weeks)
    for (let i = 0; i < 42; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      
      const dateStr = this.formatDate(currentDate);
      const isToday = this.isToday(currentDate);
      const isCurrentMonth = currentDate.getMonth() === month;
      const isPastDate = currentDate < new Date(new Date().setHours(0, 0, 0, 0));
      const hasAvailableSlots = this.hasAvailableSlots(dateStr);
      
      // Verificar disponibilidad según configuración personalizada del dentista
      const esDisponibleSegunConfig = this.esFechaDisponible(dateStr);
      
      const isAvailable = isCurrentMonth && !isPastDate && hasAvailableSlots && esDisponibleSegunConfig;
      
      if (isToday) {
        console.log(`📅 Fecha ${dateStr} (${['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][currentDate.getDay()]}):`, {
          isCurrentMonth,
          isPastDate,
          hasAvailableSlots,
          esDisponibleSegunConfig,
          isAvailable
        });
      }
      
      this.calendarDays.push({
        date: currentDate,
        available: isAvailable,
        isToday: isToday,
        isSelected: dateStr === this.selectedDate
      });
    }
    
    console.log('✅ Calendario generado con', this.calendarDays.filter(d => d.available).length, 'días disponibles');
  }

  prevMonth(): void {
    this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() - 1, 1);
    this.generateCalendar();
    this.loadOccupiedSlots();
  }

  nextMonth(): void {
    this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1);
    this.generateCalendar();
    this.loadOccupiedSlots();
  }

  selectDate(day: any): void {
    if (!day.available) return;
    
    this.selectedDate = this.formatDate(day.date);
    this.selectedTime = '';
    
    // Actualizar el calendario para mostrar la fecha seleccionada
    this.calendarDays.forEach(d => d.isSelected = false);
    day.isSelected = true;
    
    // Generar slots de tiempo para la fecha seleccionada
    this.generateTimeSlots();
    
    // Avanzar al siguiente paso después de seleccionar la fecha
    this.nextStep();
  }

  // Time Slots Methods
  generateTimeSlots(): void {
    if (!this.selectedDate) return;

    // Obtener el ID del dentista correcto
    let dentistaId = '';
    if (this.user?.tipoUsuario === 'dentista') {
      // Si es dentista, usar su propio ID
      dentistaId = this.user.id.toString();
    } else {
      // Si es paciente, usar el dentista seleccionado
      dentistaId = this.selectedDentista?._id || this.selectedDentista?.id;
    }
    
    console.log('🦷 generateTimeSlots - dentistaId:', dentistaId);
    console.log('🦷 generateTimeSlots - user tipo:', this.user?.tipoUsuario);
    
    // Cargar horarios ocupados desde el backend
    this.turnoService.getHorariosOcupados(this.selectedDate, dentistaId).subscribe({
      next: (response) => {
        const horasOcupadas = response?.horasOcupadas || [];
        
        // Usar horarios personalizados del dentista o fallback a horarios por defecto
        const horariosCompletos = this.horariosPersonalizados.length > 0 
          ? this.horariosPersonalizados 
          : [
              '08:00', '08:20', '08:40', '09:00', '09:20', '09:40',
              '10:00', '10:20', '10:40', '11:00', '11:20', '11:40',
              '12:00', '12:20', '12:40', '13:00', '13:20', '13:40',
              '14:00', '14:20', '14:40', '15:00', '15:20', '15:40',
              '16:00', '16:20', '16:40', '17:00', '17:20', '17:40',
              '18:00'
            ];
        
        const slots: { time: string, available: boolean }[] = [];
        
        horariosCompletos.forEach(timeString => {
          const isOccupied = horasOcupadas.includes(timeString);
          const esDisponibleSegunConfig = this.esHorarioDisponible(timeString);
          
          slots.push({
            time: timeString,
            available: !isOccupied && esDisponibleSegunConfig
          });
        });
        
        this.availableTimeSlots = slots;
        console.log('✅ Slots de tiempo generados con configuración personalizada:', {
          fecha: this.selectedDate,
          dentistaId: dentistaId,
          totalSlots: slots.length,
          ocupados: horasOcupadas.length,
          disponibles: slots.filter(s => s.available).length,
          horariosOcupados: horasOcupadas,
          horariosPersonalizados: this.horariosPersonalizados.length > 0 ? 'Sí' : 'No'
        });
      },
      error: (error) => {
        console.error('Error al cargar horarios ocupados:', error);
        // Fallback: generar slots básicos
        this.generateTimeSlotsFallback();
      }
    });
  }

  // Fallback para generar slots básicos en caso de error
  private generateTimeSlotsFallback(): void {
    const slots: { time: string, available: boolean }[] = [];
    
    // Usar horarios personalizados del dentista o fallback a horarios por defecto
    const horariosCompletos = this.horariosPersonalizados.length > 0 
      ? this.horariosPersonalizados 
      : [
          '08:00', '08:20', '08:40', '09:00', '09:20', '09:40',
          '10:00', '10:20', '10:40', '11:00', '11:20', '11:40',
          '12:00', '12:20', '12:40', '13:00', '13:20', '13:40',
          '14:00', '14:20', '14:40', '15:00', '15:20', '15:40',
          '16:00', '16:20', '16:40', '17:00', '17:20', '17:40',
          '18:00'
        ];
    
    horariosCompletos.forEach(timeString => {
      const esDisponibleSegunConfig = this.esHorarioDisponible(timeString);
      slots.push({
        time: timeString,
        available: esDisponibleSegunConfig
      });
    });
    
    this.availableTimeSlots = slots;
    console.log('🔄 Fallback: Slots generados con configuración personalizada');
  }

  selectTime(timeSlot: any): void {
    if (!timeSlot.available) return;
    
    this.selectedTime = timeSlot.time;
    this.nextStep();
  }

  selectTreatment(treatment: Tratamiento): void {
    this.selectedTreatment = treatment;
    this.nextStep();
  }

  // Método para seleccionar paciente (solo para dentistas/administradores)
  selectPaciente(paciente: Paciente): void {
    this.selectedPaciente = paciente;
    
    // Si es dentista, regenerar el calendario con su configuración personalizada
    if (this.user?.tipoUsuario === 'dentista') {
      console.log('🦷 Dentista seleccionó paciente, regenerando calendario con configuración personalizada...');
      setTimeout(() => {
        this.generateCalendar();
        this.loadOccupiedSlots();
      }, 500);
    }
    
    this.nextStep();
  }

  // Determinar si el usuario debe seleccionar paciente
  get shouldSelectPaciente(): boolean {
    return this.user?.tipoUsuario === 'dentista' || this.user?.tipoUsuario === 'administrador';
  }

  // Determinar cuál es el paso actual basado en el tipo de usuario
  getCurrentStepForUser(): number {
    // Ambos tipos de usuario siguen el mismo flujo de pasos
    // 1=Seleccionar (Paciente/Dentista), 2=Fecha, 3=Hora, 4=Tratamiento, 5=Confirmar, 6=Éxito
    return this.currentStep;
  }

  // Helper Methods
  formatDate(date: Date): string {
    // Devuelve la fecha local en formato YYYY-MM-DD
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  hasAvailableSlots(dateStr: string): boolean {
    // Verificar si la fecha está marcada como completamente ocupada
    const occupiedSlots = this.occupiedSlots[dateStr] || [];
    if (occupiedSlots.includes('COMPLETO')) {
      return false;
    }
    
    // Si no hay datos específicos, asumir que hay disponibilidad
    return true;
  }

  loadOccupiedSlots(): void {
    // Cargar horarios ocupados desde el backend
    const mes = (this.currentMonth.getMonth() + 1).toString().padStart(2, '0');
    const anio = this.currentMonth.getFullYear().toString();
    
    // Obtener el ID del dentista correcto
    let dentistaId = '';
    if (this.user?.tipoUsuario === 'dentista') {
      // Si es dentista, usar su propio ID
      dentistaId = this.user.id.toString();
    } else {
      // Si es paciente, usar el dentista seleccionado
      dentistaId = this.selectedDentista?._id || this.selectedDentista?.id;
    }
    
    console.log('🦷 loadOccupiedSlots - dentistaId:', dentistaId);
    console.log('🦷 loadOccupiedSlots - user tipo:', this.user?.tipoUsuario);

    this.turnoService.getDisponibilidadFechas(mes, anio, dentistaId).subscribe({
      next: (response) => {
        if (response.status === '1' && response.disponibilidad) {
          // Convertir la respuesta del backend al formato esperado
          this.occupiedSlots = {};
          
          Object.keys(response.disponibilidad).forEach(fecha => {
            const info = response.disponibilidad[fecha];
            // Si el día está completamente ocupado (100%), marcar como no disponible
            if (info.porcentajeOcupado >= 100) {
              this.occupiedSlots[fecha] = ['COMPLETO'];
            }
          });

          console.log('✅ Horarios ocupados cargados:', this.occupiedSlots);
          
          // Regenerar el calendario con la nueva información
          this.generateCalendar();
        }
      },
      error: (error) => {
        console.error('Error al cargar horarios ocupados:', error);
        // Fallback a datos simulados en caso de error
        this.loadOccupiedSlotsFallback();
      }
    });
  }

  // Fallback con datos simulados en caso de error
  private loadOccupiedSlotsFallback(): void {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    this.occupiedSlots = {
      [this.formatDate(today)]: ['09:00', '10:20', '14:00', '15:40'],
      [this.formatDate(tomorrow)]: ['08:00', '11:00', '16:20']
    };
  }

  getMonthName(): string {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return months[this.currentMonth.getMonth()];
  }

  getPrevMonthName(): string {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const prevMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() - 1, 1);
    return months[prevMonth.getMonth()];
  }

  getNextMonthName(): string {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const nextMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1);
    return months[nextMonth.getMonth()];
  }

  getYear(): number {
    return this.currentMonth.getFullYear();
  }

  formatSelectedDate(): string {
    if (!this.selectedDate) return '';
    const date = new Date(this.selectedDate);
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return date.toLocaleDateString('es-ES', options);
  }

  // Final Booking
  async confirmBooking(): Promise<void> {
    if (!this.selectedDate || !this.selectedTime || !this.selectedTreatment) {
      console.log('Datos incompletos para confirmar booking');
      return;
    }
    this.isLoading = true;

    // Asegurar que el dentistaId sea el correcto
    this.turnoForm.dentistaId = this.selectedDentista?._id || this.selectedDentista?.id;

    const pacienteId = await this.getPacienteId();
    if (!pacienteId) {
      this.isLoading = false;
      this.notificationService.showError('Error: No se pudo obtener el ID del paciente');
      return;
    }
    
    // Obtener el email del paciente
    const paciente = this.pacientes.find(p => 
      (p._id === pacienteId) || (p.id?.toString() === pacienteId)
    );
    if (!paciente) {
      this.isLoading = false;
      this.notificationService.showError('Error: No se pudo obtener la información del paciente');
      return;
    }
    
    // Guardar información del turno en sessionStorage antes de redirigir al pago
    const turnoInfo = {
      fecha: this.selectedDate,
      hora: this.selectedTime,
      tratamiento: this.selectedTreatment,
      paciente: this.selectedPaciente,
      pacienteId: pacienteId,
      userType: this.user?.tipoUsuario || 'paciente',
      timestamp: new Date().toISOString()
    };
    
    console.log('💾 Guardando información del turno:', turnoInfo);
    sessionStorage.setItem('turno_pendiente', JSON.stringify(turnoInfo));
    
    // También guardar en localStorage como backup
    localStorage.setItem('turno_info_backup', JSON.stringify(turnoInfo));
    
    // Guardar backup del usuario en sessionStorage
    if (this.user) {
      sessionStorage.setItem('user_backup', JSON.stringify(this.user));
      console.log('💾 Backup de usuario guardado');
    }
    
    // Obtener el monto del tratamiento
    const monto = this.selectedTreatment.precio || 5000; // Precio por defecto si no está definido
    const descripcion = this.selectedTreatment.descripcion || 'Turno médico';
    const userType = this.user?.tipoUsuario || 'paciente';

    // 1. Crear el turno en el backend primero
    const turnoData: any = {
      pacienteId: pacienteId,
      dentistaId: this.turnoForm.dentistaId, // Usar el dentistaId del formulario
      fecha: this.selectedDate,
      hora: this.selectedTime,
      tratamientoId: this.selectedTreatment._id || this.selectedTreatment.id,
      estado: 'reservado',
      metodoPago: 'online',
      // Puedes agregar más campos si es necesario
    };

    console.log('💳 confirmBooking - turnoData a enviar:', turnoData);
    console.log('💳 confirmBooking - dentistaId usado:', this.turnoForm.dentistaId);

    this.turnoService.createTurno(turnoData).subscribe({
      next: (turnoCreado: any) => {
        // Recargar horarios ocupados para reflejar el nuevo turno
        this.loadOccupiedSlots();
        
        // También recargar los slots de tiempo específicos para la fecha seleccionada
        if (this.selectedDate) {
          this.generateTimeSlots();
          // Forzar actualización de la vista
          setTimeout(() => {
            this.generateTimeSlots();
          }, 500);
        }
        
        // 2. Usar el _id real del turno para la preferencia de pago
        const turnoId = turnoCreado._id || turnoCreado.id;
        this.mercadoPagoService.createTurnoPayment(
          turnoId,
          `${paciente.nombre.toLowerCase()}.${paciente.apellido.toLowerCase()}@example.com`,
          monto,
          descripcion,
          userType
        ).subscribe({
          next: (response: any) => {
            this.isLoading = false;
            console.log('✅ Preferencia de pago creada, redirigiendo a MercadoPago');
            this.mercadoPagoService.redirectToPayment(response.init_point);
          },
          error: (error: any) => {
            this.isLoading = false;
            const errorMessage = error.error?.msg || 'Error al procesar el pago. Por favor, intenta nuevamente.';
            this.notificationService.showError(errorMessage);
          }
        });
      },
      error: (error: any) => {
        this.isLoading = false;
        const errorMessage = error.error?.msg || 'Error al registrar el turno antes del pago.';
        this.notificationService.showError(errorMessage);
      }
    });
  }

  // Pago en efectivo
  async pagarEnEfectivo(): Promise<void> {
    if (!this.selectedDate || !this.selectedTime || !this.selectedTreatment) {
      this.notificationService.showError('Por favor, completa todos los datos antes de continuar');
      return;
    }

    this.isLoading = true;
    this.metodoPago = 'efectivo'; // Establecer método de pago

    try {
      // Asegurar que el dentistaId sea el correcto
      this.turnoForm.dentistaId = this.selectedDentista?._id || this.selectedDentista?.id;

      // Obtener el pacienteId correcto
      const pacienteId = await this.getPacienteId();
      if (!pacienteId) {
        this.isLoading = false;
        this.notificationService.showError('Error: No se pudo obtener el ID del paciente');
        return;
      }

      // Crear el turno con pago en efectivo
      const turnoData: any = {
        pacienteId: pacienteId,
        dentistaId: this.turnoForm.dentistaId, // Usar el dentistaId del formulario
        fecha: this.selectedDate,
        hora: this.selectedTime,
        tratamientoId: this.selectedTreatment._id || this.selectedTreatment.id,
        estado: 'pendiente_pago_efectivo',
        metodoPago: 'efectivo',
        precio: this.selectedTreatment.precio,
        descripcion: this.selectedTreatment.descripcion
      };

      console.log('💳 pagarEnEfectivo - turnoData a enviar:', turnoData);
      console.log('💳 pagarEnEfectivo - dentistaId usado:', this.turnoForm.dentistaId);

      this.turnoService.createTurno(turnoData).subscribe({
        next: (turnoCreado: any) => {
          this.isLoading = false;
          console.log('✅ Turno creado con pago en efectivo:', turnoCreado);
          
          // Recargar horarios ocupados para reflejar el nuevo turno
          this.loadOccupiedSlots();
          
          // También recargar los slots de tiempo específicos para la fecha seleccionada
          if (this.selectedDate) {
            this.generateTimeSlots();
            // Forzar actualización de la vista
            setTimeout(() => {
              this.generateTimeSlots();
            }, 500);
          }
          
          // Mostrar mensaje de éxito
          this.notificationService.showSuccess('Turno registrado exitosamente. Pago en efectivo al momento de la consulta.');
          
          // Refrescar datos
          this.dataRefreshService.triggerRefresh('vistaPaciente');
          this.turnoService.refreshTurnos();
          
          // Guardar información del turno creado para el paso 6
          this.turnoCreado = turnoCreado;
          
          // Ir al paso 6 (confirmación) en lugar de redirigir
          this.currentStep = this.shouldSelectPaciente ? 6 : 6;
          this.paymentSuccess = true;
        },
        error: (error: any) => {
          this.isLoading = false;
          const errorMessage = error.error?.msg || 'Error al registrar el turno con pago en efectivo.';
          this.notificationService.showError(errorMessage);
        }
      });
    } catch (error) {
      this.isLoading = false;
      this.notificationService.showError('Error inesperado al procesar el pago en efectivo');
    }
  }

  // Pago online (función existente confirmBooking renombrada)
  async pagarOnline(): Promise<void> {
    this.metodoPago = 'online'; // Establecer método de pago
    await this.confirmBooking();
  }

  // Navigate back to dashboard/home
  volverAlInicio(isCancellation: boolean = false): void {
    console.log('volverAlInicio called');
    console.log('User:', this.user);
    console.log('User tipo:', this.user?.tipoUsuario);
    console.log('Is cancellation:', isCancellation);
    
    // Clear any refresh flags and backup data
    sessionStorage.removeItem('reservar-step1-refreshed');
    localStorage.removeItem('turno_info_backup');
    
    // Trigger refresh for patient dashboard before navigation
    this.dataRefreshService.triggerRefresh('vistaPaciente');
    
    // Navegar según el tipo de usuario
    if (this.user?.tipoUsuario === 'paciente') {
      console.log('Navigating to /vistaPaciente');
      this.router.navigate(['/vistaPaciente']).then(
        (success) => {
          if (success) {
            console.log('Navigation successful');
            if (isCancellation) {
              this.notificationService.showInfo('Reserva cancelada. Puedes hacer una nueva reserva cuando quieras.');
            } else {
              this.notificationService.showSuccess('¡Bienvenido de vuelta! Tu turno ha sido confirmado.');
            }
          }
        }
      ).catch((error: any) => {
        console.error('Navigation to /vistaPaciente failed:', error);
        // Fallback navigation
        this.router.navigate(['/vistaPaciente']);
      });
    } else {
      // Para dentistas y administradores
      console.log('Navigating to /dashboard');
      this.router.navigate(['/dashboard']).then(
        (success) => {
          if (success) {
            console.log('Navigation successful');
            if (isCancellation) {
              this.notificationService.showInfo('Reserva cancelada. Puedes hacer una nueva reserva cuando quieras.');
            } else {
              this.notificationService.showSuccess('Turno registrado exitosamente en el sistema.');
            }
          }
        }
      ).catch((error: any) => {
        console.error('Navigation to /dashboard failed:', error);
        // Fallback navigation
        this.router.navigate(['/dashboard']);
      });
    }
  }

  // Start a new booking
  nuevaReserva(): void {
    this.resetWizard();
  }

  // Cancelar reserva y volver al inicio
  cancelarReserva(): void {
    // Mostrar modal personalizado en vez de confirm()
    this.showCancelReservaModal = true;
  }

  closeCancelReservaModal(): void {
    this.showCancelReservaModal = false;
  }

  confirmCancelReserva(): void {
    this.showCancelReservaModal = false;
    this.resetWizard();
    this.volverAlInicio(true); // true indica que es una cancelación
  }

  // Método para procesar el resultado del pago de Mercado Pago
  async procesarResultadoPago(): Promise<void> {
    // Verificar si hay parámetros de pago en la URL
    const urlParams = new URLSearchParams(window.location.search);
    const collectionId = urlParams.get('collection_id');
    const status = urlParams.get('collection_status');
    const externalReference = urlParams.get('external_reference');
    if (collectionId && status && externalReference) {
      console.log('Procesando resultado de pago:', { collectionId, status, externalReference });
      // Verificar si el pago fue exitoso
      if (this.mercadoPagoService.isPaymentSuccessful(status)) {
        // Recuperar información del turno guardada
        const turnoInfoStr = sessionStorage.getItem('turno_pendiente');
        if (turnoInfoStr) {
          try {
            sessionStorage.removeItem('turno_pendiente');
            this.currentStep = this.shouldSelectPaciente ? 6 : 5;
            this.dataRefreshService.triggerRefresh('vistaPaciente');
            this.turnoService.refreshTurnos();
          } catch (error) {
            alert('Error al procesar la información del turno.');
          }
        } else {
          alert('No se encontró información del turno. Por favor, intenta nuevamente.');
        }
      } else if (this.mercadoPagoService.isPaymentFailed(status)) {
        sessionStorage.removeItem('turno_pendiente');
        alert('El pago no pudo ser procesado. Por favor, intenta nuevamente.');
        this.resetWizard();
      } else if (this.mercadoPagoService.isPaymentPending(status)) {
        alert('Tu pago está pendiente de confirmación. Te notificaremos cuando se complete.');
        this.resetWizard();
      }
    }
  }

  // Método para obtener el pacienteId correcto
  async getPacienteId(): Promise<string | null> {
    if (this.user?.tipoUsuario === 'paciente') {
      // Si el usuario tiene patientId (usuario de Google con perfil completo)
      if (this.user.patientId) {
        console.log('Usando patientId del usuario de Google:', this.user.patientId);
        return this.user.patientId;
      }
      
      // Para usuarios tipo paciente, buscar en la lista de pacientes el que tenga userId igual al user.id
      const paciente = this.pacientes.find(p => p.userId === this.user?.id?.toString());
      if (paciente) {
        return paciente._id || paciente.id?.toString() || null;
      }
      // Si no encontramos el paciente, intentar cargarlo desde el servidor
      try {
        const allPacientes = await this.pacienteService.getPacientes().toPromise() as any[];
        const foundPaciente = allPacientes?.find((p: any) => p.userId === this.user?.id?.toString());
        return foundPaciente?._id || foundPaciente?.id?.toString() || null;
      } catch (error) {
        console.error('Error al buscar paciente:', error);
        return null;
      }
    } else {
      // Para usuarios tipo dentista/administrador, usar el paciente seleccionado en el wizard
      if (this.selectedPaciente) {
        return this.selectedPaciente._id || this.selectedPaciente.id?.toString() || null;
      }
      // Fallback: usar el pacienteId del formulario si existe
      return this.turnoForm.pacienteId || null;
    }
  }

  // Método para manejar el regreso desde el pago exitoso
  handlePaymentReturn(): void {
    // Comentado temporalmente para evitar error 404
    // this.cookiePaymentService.checkPaymentStatus().subscribe({
    //   next: (response) => {
    //     if (response.success && response.turnoInfo) {
    //       console.log('✅ Información recuperada desde cookies seguras:', response.turnoInfo);
    //       this.processPaymentReturn(response.turnoInfo, true);
    //       return;
    //     }
    //     
    //     // Fallback a verificación tradicional
    //     this.checkTraditionalPaymentReturn();
    //   },
    //   error: (error) => {
    //     console.log('ℹ️ No se encontraron cookies de pago, verificando método tradicional');
    //     this.checkTraditionalPaymentReturn();
    //   }
    // });
    
    // Usar directamente el método tradicional
    this.checkTraditionalPaymentReturn();
  }

  private checkTraditionalPaymentReturn(): void {
    // Verificar si viene de pago exitoso (métodos tradicionales)
    const paymentSuccess = sessionStorage.getItem('payment_success') || localStorage.getItem('payment_success');
    
    // También verificar parámetros de query
    this.route.queryParams.subscribe(params => {
      if (params['paymentSuccess'] === 'true' || params['step'] === '5' || paymentSuccess === 'true') {
        // Recuperar información del turno desde sessionStorage o localStorage
        let turnoInfoStr = sessionStorage.getItem('turno_pendiente');
        if (!turnoInfoStr) {
          turnoInfoStr = localStorage.getItem('turno_info_success');
        }
        
        if (turnoInfoStr) {
          try {
            const turnoInfo = JSON.parse(turnoInfoStr);
            this.processPaymentReturn(turnoInfo, true);
          } catch (error) {
            console.error('Error al restaurar información del turno:', error);
            this.notificationService.showError('Error al restaurar la información del turno.');
          }
        }
      }
    });
  }

  private processPaymentReturn(turnoInfo: any, isSuccess: boolean): void {
    if (isSuccess) {
      // Marcar como pago exitoso
      this.paymentSuccess = true;
      
      // Ir al paso 5 (turno listo)
      this.currentStep = this.shouldSelectPaciente ? 6 : 5;
      
      // Restaurar la información del turno
      this.selectedDate = turnoInfo.fecha;
      this.selectedTime = turnoInfo.hora;
      this.selectedTreatment = turnoInfo.tratamiento;
      if (turnoInfo.paciente) {
        this.selectedPaciente = turnoInfo.paciente;
      }
      
      // Limpiar storage tradicional
      sessionStorage.removeItem('turno_pendiente');
      sessionStorage.removeItem('payment_success');
      localStorage.removeItem('payment_success');
      localStorage.removeItem('turno_info_success');
      localStorage.removeItem('turno_info_backup');
      
      // Actualizar datos
      this.dataRefreshService.triggerRefresh('vistaPaciente');
      this.turnoService.refreshTurnos();
      
      // Recargar horarios ocupados para reflejar el turno confirmado
      this.loadOccupiedSlots();
      if (this.selectedDate) {
        this.generateTimeSlots();
        // Forzar actualización de la vista
        setTimeout(() => {
          this.generateTimeSlots();
        }, 500);
      }
      
      console.log('✅ Turno confirmado exitosamente');
      this.notificationService.showSuccess('¡Turno confirmado exitosamente! El pago se procesó correctamente.');
      
    } else {
      // Manejo de pago fallido o cancelado
      console.log('❌ Pago fallido o cancelado');
      this.notificationService.showWarning('El pago no se completó. Puedes intentar nuevamente o contactar con soporte.');
      // Volver al dashboard
      this.volverAlInicio();
    }
  }

  handleSuccessfulPaymentReturn(): void {
    console.log('🔄 Manejando retorno de pago exitoso');
    
    // Verificar si hay información de pago en sessionStorage
    const paymentInfoStr = sessionStorage.getItem('payment_success_info');
    const paymentSuccess = sessionStorage.getItem('payment_success');
    
    if (paymentSuccess === 'true' || paymentInfoStr) {
      console.log('✅ Información de pago encontrada en sessionStorage');
      
      // Ir al paso 5 (turno listo)
      this.currentStep = this.shouldSelectPaciente ? 6 : 5;
      this.paymentSuccess = true;
      
      // Intentar restaurar información del turno desde sessionStorage
      let turnoInfoStr = sessionStorage.getItem('turno_pendiente');
      if (!turnoInfoStr) {
        // Si no está en sessionStorage, intentar desde localStorage como backup
        turnoInfoStr = localStorage.getItem('turno_info_backup');
        console.log('🔄 Intentando restaurar desde localStorage como backup');
      }
      
      if (turnoInfoStr) {
        try {
          const turnoInfo = JSON.parse(turnoInfoStr);
          this.selectedDate = turnoInfo.fecha;
          this.selectedTime = turnoInfo.hora;
          this.selectedTreatment = turnoInfo.tratamiento;
          if (turnoInfo.paciente) {
            this.selectedPaciente = turnoInfo.paciente;
          }
          console.log('✅ Información del turno restaurada');
        } catch (error) {
          console.error('Error al restaurar información del turno:', error);
        }
      } else {
        console.log('⚠️ No se encontró información del turno en storage');
      }
      
      // Limpiar storage
      sessionStorage.removeItem('payment_success_info');
      sessionStorage.removeItem('payment_success');
      sessionStorage.removeItem('turno_pendiente');
      sessionStorage.removeItem('user_backup');
      localStorage.removeItem('turno_info_backup');
      
      // Actualizar datos
      this.dataRefreshService.triggerRefresh('vistaPaciente');
      this.turnoService.refreshTurnos();
      
      // Recargar horarios ocupados para reflejar el turno confirmado
      this.loadOccupiedSlots();
      if (this.selectedDate) {
        this.generateTimeSlots();
        // Forzar actualización de la vista
        setTimeout(() => {
          this.generateTimeSlots();
        }, 500);
      }
      
      this.notificationService.showSuccess('¡Pago procesado exitosamente! Tu turno está confirmado.');
    } else {
      console.log('⚠️ No se encontró información de pago, intentando registrar turno');
      this.registrarTurnoDespuesDePago();
    }
  }

  registrarTurnoDespuesDePago(): void {
    this.isLoading = true;
    this.getPacienteId().then(pacienteId => {
      if (!pacienteId) {
        this.isLoading = false;
        this.notificationService.showError('Error: No se pudo obtener el ID del paciente');
        return;
      }
      const turnoData = {
        pacienteId: pacienteId,
        dentistaId: this.turnoForm.dentistaId, // Agregar el dentistaId del formulario
        fecha: this.selectedDate,
        hora: this.selectedTime,
        tratamientoId: this.selectedTreatment?._id || this.selectedTreatment?.id,
        estado: 'reservado'
      };
      this.turnoService.createTurno(turnoData).subscribe({
        next: () => {
          this.isLoading = false;
          this.currentStep = this.shouldSelectPaciente ? 6 : 5;
          this.paymentSuccess = true;
          
          // Recargar horarios ocupados para reflejar el turno registrado
          this.loadOccupiedSlots();
          if (this.selectedDate) {
            this.generateTimeSlots();
            // Forzar actualización de la vista
            setTimeout(() => {
              this.generateTimeSlots();
            }, 500);
          }
          
          this.notificationService.showSuccess('¡Turno registrado exitosamente!');
        },
        error: (error) => {
          this.isLoading = false;
          const errorMessage = error.error?.msg || 'Error al registrar el turno después del pago';
          this.notificationService.showError(errorMessage);
        }
      });
    });
  }

  loadDentistas(): void {
    this.dentistaService.getDentistas().subscribe({
      next: (dentistas) => this.dentistas = dentistas,
      error: () => this.dentistas = []
    });
  }

  selectDentista(dentista: any) {
    console.log('🦷 selectDentista - Dentista seleccionado:', dentista);
    console.log('🦷 selectDentista - dentista._id:', dentista._id);
    console.log('🦷 selectDentista - dentista.id:', dentista.id);
    
    this.selectedDentista = dentista;
    this.turnoForm.dentistaId = dentista._id || dentista.id;
    
    console.log('🦷 selectDentista - turnoForm.dentistaId guardado:', this.turnoForm.dentistaId);
    
    // Cargar disponibilidad personalizada del dentista
    this.cargarDisponibilidadDentista(dentista._id || dentista.id);
    
    // Recargar horarios ocupados para el dentista seleccionado
    this.loadOccupiedSlots();
    
    // Regenerar calendario con la configuración del dentista seleccionado
    setTimeout(() => {
      this.generateCalendar();
    }, 1000); // Dar tiempo a que se cargue la disponibilidad
    
    this.nextStep();
  }

  // Métodos para contar slots disponibles y ocupados
  getAvailableSlotsCount(): number {
    return this.availableTimeSlots.filter(slot => slot.available).length;
  }

  getOccupiedSlotsCount(): number {
    return this.availableTimeSlots.filter(slot => !slot.available).length;
  }

  // Obtener información de la configuración de disponibilidad
  getDisponibilidadInfo(): string {
    if (!this.disponibilidadDentista) {
      return 'Configuración estándar';
    }

    const diasLaborables = this.disponibilidadDentista.diasLaborables.map(dia => 
      this.disponibilidadService.getNombreDia(dia)
    ).join(', ');

    return `${this.disponibilidadDentista.horarioInicio} - ${this.disponibilidadDentista.horarioFin} | ${diasLaborables}`;
  }

  // Verificar si hay configuración personalizada
  tieneConfiguracionPersonalizada(): boolean {
    return this.disponibilidadDentista !== null;
  }

  // Cargar disponibilidad personalizada del dentista
  cargarDisponibilidadDentista(dentistaId: string): void {
    console.log('📅 Cargando disponibilidad personalizada para dentista:', dentistaId);
    
    this.disponibilidadService.getDisponibilidad(dentistaId).subscribe({
      next: (response) => {
        if (response && response.disponibilidad) {
          this.disponibilidadDentista = response.disponibilidad;
          console.log('✅ Disponibilidad cargada:', this.disponibilidadDentista);
          
          // Generar horarios personalizados
          this.generarHorariosPersonalizados();
          
          // Extraer días no disponibles
          this.diasNoDisponibles = this.disponibilidadDentista?.diasNoLaborables?.map(dia => dia.fecha) || [];
          
          // Extraer franjas no disponibles
          this.franjasNoDisponibles = this.disponibilidadDentista?.franjasNoDisponibles || [];
          
          // Extraer pausas
          this.pausas = this.disponibilidadDentista?.pausas || [];
          
          console.log('📅 Configuración aplicada:', {
            horarios: this.horariosPersonalizados.length,
            diasLaborables: this.disponibilidadDentista?.diasLaborables,
            diasNoDisponibles: this.diasNoDisponibles.length,
            franjasNoDisponibles: this.franjasNoDisponibles.length,
            pausas: this.pausas.length,
            horarioInicio: this.disponibilidadDentista?.horarioInicio,
            horarioFin: this.disponibilidadDentista?.horarioFin
          });
          
          // Regenerar calendario con la nueva configuración
          this.generateCalendar();
        } else {
          console.log('⚠️ No se encontró configuración personalizada, usando configuración por defecto');
          this.disponibilidadDentista = this.disponibilidadService.getConfiguracionPorDefecto();
          this.generarHorariosPersonalizados();
          
          // Regenerar calendario con configuración por defecto
          this.generateCalendar();
        }
      },
      error: (error) => {
        console.error('❌ Error al cargar disponibilidad:', error);
        console.log('🔄 Usando configuración por defecto');
        this.disponibilidadDentista = this.disponibilidadService.getConfiguracionPorDefecto();
        this.generarHorariosPersonalizados();
        
        // Regenerar calendario con configuración por defecto
        this.generateCalendar();
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
    console.log('📅 Configuración completa:', this.disponibilidadDentista);
    
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
  esHorarioDisponible(hora: string): boolean {
    if (!this.disponibilidadDentista) return true;

    // Obtener el día de la semana de la fecha seleccionada
    const selectedDate = new Date(this.selectedDate);
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

  // Función para confirmar turno como administrador/dentista
  async confirmarTurnoAdmin(): Promise<void> {
    if (!this.selectedDate || !this.selectedTime || !this.selectedTreatment || !this.selectedPaciente) {
      this.notificationService.showError('Por favor completa todos los campos requeridos');
      return;
    }

    this.isLoading = true;

    // Asegurar que los IDs sean strings
    const pacienteId = String(this.selectedPaciente._id || this.selectedPaciente.id);
    
    // Obtener el _id correcto del dentista
    let dentistaId = '';
    if (this.user?.tipoUsuario === 'dentista') {
      // Si es dentista, usar el userId como dentistaId (el backend lo manejará)
      dentistaId = String(this.user.id);
    } else {
      dentistaId = String(this.user?.id || this.user?.patientId);
    }
    
    const tratamientoId = String(this.selectedTreatment._id || this.selectedTreatment.id);

    const turnoData: any = {
      pacienteId: pacienteId,
      dentistaId: dentistaId,
      fecha: this.selectedDate,
      hora: this.selectedTime,
      tratamientoId: tratamientoId,
      estado: 'reservado',
      metodoPago: 'efectivo',
      precio: this.selectedTreatment.precio,
      descripcion: this.selectedTreatment.descripcion
    };

    console.log('🦷 confirmarTurnoAdmin - turnoData:', turnoData);
    console.log('🦷 confirmarTurnoAdmin - pacienteId:', pacienteId);
    console.log('🦷 confirmarTurnoAdmin - dentistaId:', dentistaId);
    console.log('🦷 confirmarTurnoAdmin - tratamientoId:', tratamientoId);

    this.turnoService.createTurno(turnoData).subscribe({
      next: (response) => {
        this.isLoading = false;
        console.log('✅ Turno creado exitosamente:', response);
        
        // Recargar horarios ocupados
        this.loadOccupiedSlots();
        
        // Guardar información del turno creado para el paso 6
        this.turnoCreado = response;
        
        // Ir al paso de éxito
        this.currentStep = 6;
        this.paymentSuccess = true;
        this.metodoPago = 'efectivo';
        
        this.notificationService.showSuccess('¡Turno registrado exitosamente!');
      },
      error: (error) => {
        this.isLoading = false;
        console.error('❌ Error al crear turno:', error);
        console.error('❌ Error details:', error.error);
        const errorMessage = error.error?.msg || 'Error al registrar el turno';
        this.notificationService.showError(errorMessage);
      }
    });
  }

  // Función para solo reservar turno (sin pago inmediato)
  async soloReservar(): Promise<void> {
    if (!this.selectedDate || !this.selectedTime || !this.selectedTreatment || !this.selectedPaciente) {
      this.notificationService.showError('Por favor completa todos los campos requeridos');
      return;
    }

    this.isLoading = true;

    // Asegurar que los IDs sean strings
    const pacienteId = String(this.selectedPaciente._id || this.selectedPaciente.id);
    
    // Obtener el _id correcto del dentista
    let dentistaId = '';
    if (this.user?.tipoUsuario === 'dentista') {
      // Si es dentista, usar el userId como dentistaId (el backend lo manejará)
      dentistaId = String(this.user.id);
    } else {
      dentistaId = String(this.user?.id || this.user?.patientId);
    }
    
    const tratamientoId = String(this.selectedTreatment._id || this.selectedTreatment.id);

    const turnoData: any = {
      pacienteId: pacienteId,
      dentistaId: dentistaId,
      fecha: this.selectedDate,
      hora: this.selectedTime,
      tratamientoId: tratamientoId,
      estado: 'reservado',
      metodoPago: 'efectivo',
      precio: this.selectedTreatment.precio,
      descripcion: this.selectedTreatment.descripcion
    };

    console.log('📅 soloReservar - turnoData:', turnoData);
    console.log('📅 soloReservar - pacienteId:', pacienteId);
    console.log('📅 soloReservar - dentistaId:', dentistaId);
    console.log('📅 soloReservar - tratamientoId:', tratamientoId);

    this.turnoService.createTurno(turnoData).subscribe({
      next: (response) => {
        this.isLoading = false;
        console.log('✅ Turno reservado exitosamente:', response);
        
        // Recargar horarios ocupados
        this.loadOccupiedSlots();
        
        // Guardar información del turno creado para el paso 6
        this.turnoCreado = response;
        
        // Ir al paso de éxito
        this.currentStep = 6;
        this.paymentSuccess = true;
        this.metodoPago = 'efectivo';
        
        this.notificationService.showSuccess('¡Turno reservado exitosamente! El paciente pagará al momento de la consulta.');
      },
      error: (error) => {
        this.isLoading = false;
        console.error('❌ Error al reservar turno:', error);
        console.error('❌ Error details:', error.error);
        const errorMessage = error.error?.msg || 'Error al reservar el turno';
        this.notificationService.showError(errorMessage);
      }
    });
  }

  // Función para descargar el PDF del turno
  async descargarPDFTurno(): Promise<void> {
    try {
      // Preparar los datos del turno para el PDF
      const turnoData = {
        paciente: {
          nombre: this.user?.tipoUsuario === 'paciente' ? this.user.nombre : this.selectedPaciente?.nombre || '',
          apellido: this.user?.tipoUsuario === 'paciente' ? this.user.apellido : this.selectedPaciente?.apellido || '',
          dni: this.user?.tipoUsuario === 'paciente' ? 'N/A' : this.selectedPaciente?.dni || '',
          obraSocial: this.user?.tipoUsuario === 'paciente' ? 'N/A' : this.selectedPaciente?.obraSocial || ''
        },
        dentista: {
          nombre: this.selectedDentista?.nombre || '',
          apellido: this.selectedDentista?.apellido || '',
          especialidad: this.selectedDentista?.especialidad || 'Odontología General'
        },
        fecha: this.selectedDate,
        hora: this.selectedTime,
        tratamiento: {
          descripcion: this.selectedTreatment?.descripcion || '',
          precio: this.selectedTreatment?.precio || 0
        },
        estado: this.turnoCreado?.estado || 'reservado',
        metodoPago: this.metodoPago,
        numeroTurno: this.turnoCreado?._id || this.turnoCreado?.id
      };

      // Generar y descargar el PDF
      await this.pdfExportService.exportarTurnoPDF(turnoData);
      
      this.notificationService.showSuccess('PDF del turno descargado exitosamente');
    } catch (error) {
      console.error('Error al generar PDF:', error);
      this.notificationService.showError('Error al generar el PDF del turno');
    }
  }
}
