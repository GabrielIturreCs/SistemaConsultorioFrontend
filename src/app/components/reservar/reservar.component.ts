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
  totalSteps: number = this.shouldSelectPaciente ? 7 : 6;
  
  // Estado del pago
  paymentSuccess: boolean = false;
  redirectCountdown: number = 8;
  metodoPago: string = 'online'; // Método de pago seleccionado
  
  // Para dentistas/administradores - selección de paciente
  selectedPaciente: Paciente | null = null;
  
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
    private dentistaService: DentistaService
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
    this.generateCalendar();
    this.loadOccupiedSlots();
    if (this.user?.tipoUsuario === 'paciente') {
      this.loadDentistas();
    }
    
    // Verificar si hay parámetros de pago de Mercado Pago
    this.procesarResultadoPago();
    
    // Manejar el regreso desde el pago exitoso
    this.handlePaymentReturn();
    
    // Ajustar total de pasos según el tipo de usuario
    if (this.user?.tipoUsuario === 'dentista' || this.user?.tipoUsuario === 'administrador') {
      this.totalSteps = 6; // Paso adicional para seleccionar paciente
    } else {
      this.totalSteps = 5;
    }

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
      next: (pacientes) => this.pacientes = pacientes,
      error: () => this.pacientes = []
    });
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
      
      this.calendarDays.push({
        date: currentDate,
        available: isCurrentMonth && !isPastDate && hasAvailableSlots,
        isToday: isToday,
        isSelected: dateStr === this.selectedDate
      });
    }
  }

  prevMonth(): void {
    this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() - 1, 1);
    this.generateCalendar();
  }

  nextMonth(): void {
    this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1);
    this.generateCalendar();
  }

  selectDate(day: any): void {
    if (!day.available) return;
    
    this.selectedDate = this.formatDate(day.date);
    this.generateTimeSlots();
    this.generateCalendar(); // Refresh to show selection
    this.nextStep();
  }

  // Time Slots Methods
  generateTimeSlots(): void {
    this.availableTimeSlots = [];
    const startHour = 8; // 8:00 AM
    const endHour = 18; // 6:00 PM
    const intervalMinutes = 20;
    
    const occupiedTimes = this.occupiedSlots[this.selectedDate] || [];
    
    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += intervalMinutes) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const isOccupied = occupiedTimes.includes(timeStr);
        
        this.availableTimeSlots.push({
          time: timeStr,
          available: !isOccupied
        });
      }
    }
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
    this.nextStep();
  }

  // Determinar si el usuario debe seleccionar paciente
  get shouldSelectPaciente(): boolean {
    return this.user?.tipoUsuario === 'dentista' || this.user?.tipoUsuario === 'administrador';
  }

  // Determinar cuál es el paso actual basado en el tipo de usuario
  getCurrentStepForUser(): number {
    if (this.shouldSelectPaciente) {
      // Para dentistas: 1=Nuevo, 2=Paciente, 3=Fecha, 4=Hora, 5=Tratamiento, 6=Confirmar, 7=Éxito
      return this.currentStep;
    } else {
      // Para pacientes: 1=Nuevo, 2=Dentista, 3=Fecha, 4=Hora, 5=Tratamiento, 6=Confirmar, 7=Éxito
      return this.currentStep;
    }
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
    // Simular que hay slots disponibles (en una app real, esto vendría del backend)
    const occupiedTimes = this.occupiedSlots[dateStr] || [];
    const totalSlots = (18 - 8) * 3; // 8AM to 6PM, every 20 minutes
    return occupiedTimes.length < totalSlots;
  }

  loadOccupiedSlots(): void {
    // Simular datos ocupados (en una app real, esto vendría del backend)
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
    
    // Obtener el pacienteId correcto
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
      dentistaId: this.selectedDentista?._id || this.selectedDentista?.id,
      fecha: this.selectedDate,
      hora: this.selectedTime,
      tratamientoId: this.selectedTreatment._id || this.selectedTreatment.id,
      estado: 'reservado',
      metodoPago: 'online',
      // Puedes agregar más campos si es necesario
    };

    this.turnoService.createTurno(turnoData).subscribe({
      next: (turnoCreado: any) => {
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
        dentistaId: this.selectedDentista?._id || this.selectedDentista?.id,
        fecha: this.selectedDate,
        hora: this.selectedTime,
        tratamientoId: this.selectedTreatment._id || this.selectedTreatment.id,
        estado: 'pendiente_pago_efectivo',
        metodoPago: 'efectivo',
        precio: this.selectedTreatment.precio,
        descripcion: this.selectedTreatment.descripcion
      };

      this.turnoService.createTurno(turnoData).subscribe({
        next: (turnoCreado: any) => {
          this.isLoading = false;
          console.log('✅ Turno creado con pago en efectivo:', turnoCreado);
          
          // Mostrar mensaje de éxito
          this.notificationService.showSuccess('Turno registrado exitosamente. Pago en efectivo al momento de la consulta.');
          
          // Refrescar datos
          this.dataRefreshService.triggerRefresh('vistaPaciente');
          this.turnoService.refreshTurnos();
          
          // Redirigir directamente al dashboard
          this.volverAlInicio();
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
    // Verificar cookies seguras del backend
    this.cookiePaymentService.checkPaymentStatus().subscribe({
      next: (response) => {
        if (response.success && response.turnoInfo) {
          console.log('✅ Información recuperada desde cookies seguras:', response.turnoInfo);
          this.processPaymentReturn(response.turnoInfo, true);
          return;
        }
        
        // Fallback a verificación tradicional
        this.checkTraditionalPaymentReturn();
      },
      error: (error) => {
        console.log('ℹ️ No se encontraron cookies de pago, verificando método tradicional');
        this.checkTraditionalPaymentReturn();
      }
    });
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
    this.selectedDentista = dentista;
    this.turnoForm.dentistaId = dentista._id || dentista.id;
    this.nextStep();
  }
}
