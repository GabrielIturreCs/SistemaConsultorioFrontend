import { Component, type OnInit, type OnDestroy, Output, EventEmitter, Input, OnChanges, SimpleChanges } from "@angular/core"
import { Subject } from "rxjs"
import { takeUntil } from "rxjs/operators"
import { OdontogramaService, PiezaDental, OdontogramaData } from "../../services/odontograma.service"
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PiezaDentalComponent } from './pieza-dental.component';
import html2canvas from 'html2canvas';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';
import jsPDF from 'jspdf';

@Component({
  selector: "app-odontograma",
  standalone: true,
  imports: [CommonModule, FormsModule, PiezaDentalComponent, MatSnackBarModule],
  templateUrl: "./odontograma.component.html",
  styleUrls: ["./odontograma.component.css"],
})
export class OdontogramaComponent implements OnInit, OnDestroy, OnChanges {
  @Input() odontograma: any;
  @Input() paciente: any;
  @Output() cerrar = new EventEmitter<void>();
  private destroy$ = new Subject<void>()

  odontogramaData!: OdontogramaData
  herramientaActual = "pintar"
  estadoActual = "a_realizar"

  herramientas: any[] = [];
  coloresEstado: any = {};

  // Organización de dientes por cuadrantes
  cuadrantes = {
    1: [18, 17, 16, 15, 14, 13, 12, 11], // Superior Derecho
    2: [21, 22, 23, 24, 25, 26, 27, 28], // Superior Izquierdo
    3: [38, 37, 36, 35, 34, 33, 32, 31], // Inferior Izquierdo
    4: [41, 42, 43, 44, 45, 46, 47, 48], // Inferior Derecho
    5: [55, 54, 53, 52, 51], // Temporal Superior Derecho
    6: [61, 62, 63, 64, 65], // Temporal Superior Izquierdo
    7: [75, 74, 73, 72, 71], // Temporal Inferior Izquierdo
    8: [81, 82, 83, 84, 85], // Temporal Inferior Derecho
  }

  odontologos = ["Dr. Juan Pérez", "Dra. María González", "Dr. Carlos Rodríguez", "Dra. Ana Martínez"]

  mostrarTemporales = false
  guardando = false
  exportando: boolean = false;

  odontologoLogueado: string = '';
  odontologoId: string = '';

  historialOdontogramas: any[] = [];
  mostrarHistorial = false;
  cargandoOdontograma = true;

  constructor(
    private odontogramaService: OdontogramaService,
    private snackBar: MatSnackBar,
    private http: HttpClient
  ) {
    this.herramientas = this.odontogramaService.getHerramientas();
    this.coloresEstado = this.odontogramaService.getColoresEstado();
  }

  ngOnInit(): void {
    console.log('[ODONTOGRAMA] ngOnInit - paciente:', this.paciente);
    // Obtener odontólogo logueado del localStorage
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const userObj = JSON.parse(user);
        this.odontologoLogueado = userObj.nombre ? userObj.nombre + (userObj.apellido ? ' ' + userObj.apellido : '') : '';
        this.odontologoId = userObj.id || userObj._id || '';
      } catch (e) {
        this.odontologoLogueado = '';
        this.odontologoId = '';
      }
    }

    this.cargarOdontogramaPaciente();

    this.odontogramaService.odontograma$.pipe(takeUntil(this.destroy$)).subscribe((data: OdontogramaData) => {
      this.odontogramaData = data
      console.log('[ODONTOGRAMA] odontograma$ actualizado:', data);
      // Actualizar el odontólogo en el odontograma si no está seteado
      if (!this.odontogramaData.odontologo && this.odontologoId) {
        this.odontogramaData.odontologo = this.odontologoId;
      }
    })

    this.odontogramaService.herramientaActual$.pipe(takeUntil(this.destroy$)).subscribe((herramienta: string) => {
      this.herramientaActual = herramienta
    })

    this.odontogramaService.estadoActual$.pipe(takeUntil(this.destroy$)).subscribe((estado: string) => {
      this.estadoActual = estado
    })

    // Cargar historial de odontogramas
    const pacienteId = this.paciente?.id || this.paciente?._id;
    if (pacienteId) {
      this.cargarHistorialOdontogramas(pacienteId);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['paciente'] && changes['paciente'].currentValue) {
      console.log('[ODONTOGRAMA] ngOnChanges - paciente:', this.paciente);
      this.cargarOdontogramaPaciente();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  cargarOdontogramaPaciente(): void {
    const pacienteId = this.paciente?.id || this.paciente?._id;
    if (!pacienteId) {
      console.warn('[ODONTOGRAMA] No hay paciente válido para cargar odontograma');
      return;
    }
    this.cargandoOdontograma = true;
    this.odontogramaService.getOdontogramaByPacienteId(pacienteId).subscribe({
      next: (data) => {
        console.log('[ODONTOGRAMA] Odontograma recibido del backend:', data);
        // this.odontogramaService.odontogramaSubject.next(data); // Eliminar acceso directo si es privado
        this.odontogramaData = data;
        this.cargandoOdontograma = false;
        this.cargarHistorialOdontogramas(pacienteId);
      },
      error: (err) => {
        console.error('[ODONTOGRAMA] Error al cargar odontograma:', err);
        this.cargandoOdontograma = false;
      }
    });
  }

  cargarHistorialOdontogramas(pacienteId: string): void {
    this.http.get<any>(`/api/odontograma/paciente/${pacienteId}/historial`).subscribe({
      next: (res) => {
        this.historialOdontogramas = res.odontogramas || [];
      },
      error: () => {
        this.historialOdontogramas = [];
      }
    });
  }

  cargarOdontogramaDeHistorial(odontograma: any): void {
    // Cargar el odontograma seleccionado del historial
    this.odontogramaData = {
      piezas: {},
      notas: odontograma.notas,
      odontologo: odontograma.odontologo?.nombre + ' ' + odontograma.odontologo?.apellido,
      fecha: new Date(odontograma.fecha)
    };
    // NOTA: Si quieres cargar las piezas, deberías hacer otro GET para ese odontograma específico
    // Aquí solo se muestra la info básica
  }

  seleccionarHerramienta(herramienta: string): void {
    this.odontogramaService.setHerramientaActual(herramienta)
  }

  seleccionarEstado(estado: string): void {
    this.odontogramaService.setEstadoActual(estado)
  }

  onZonaClic(event: { numeroPieza: number; zona: "superior" | "inferior" | "izquierda" | "derecha" | "centro" }): void {
    console.log('🦷 CLICK EN ZONA:', event);
    this.odontogramaService.aplicarHerramienta(event.numeroPieza, event.zona)
  }

  onNotasChange(event: any): void {
    this.odontogramaService.actualizarNotas(event.target.value)
  }

  onOdontologoChange(event: any): void {
    this.odontogramaService.actualizarOdontologo(event.target.value)
  }

  toggleTemporales(): void {
    this.mostrarTemporales = !this.mostrarTemporales
  }

  getPiezasPorCuadrante(cuadrante: number): PiezaDental[] {
    return this.cuadrantes[cuadrante as keyof typeof this.cuadrantes]
      .map((numero) => this.odontogramaData.piezas[numero])
      .filter((pieza) => pieza)
  }

  guardarOdontograma(): void {
    this.guardando = true;
    const pacienteId = this.paciente?.id || this.paciente?._id;
    // Obtener el odontograma más reciente del observable
    const odontogramaActual = this.odontogramaService['odontogramaSubject'].value;
    odontogramaActual.odontologo = this.odontologoId;
    console.log('[ODONTOGRAMA] Objeto a guardar:', JSON.stringify(odontogramaActual, null, 2));
    this.odontogramaService
      .guardarOdontograma(pacienteId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          console.log('[ODONTOGRAMA] Guardado exitoso, respuesta:', res);
          this.odontogramaService.getOdontogramaByPacienteId(pacienteId).pipe(takeUntil(this.destroy$)).subscribe({
            next: (data) => {
              this.guardando = false;
              console.log('[ODONTOGRAMA] Odontograma recargado tras guardar:', data);
              this.snackBar.open('¡Odontograma guardado exitosamente!', 'Cerrar', {
                duration: 3000,
                panelClass: ['snackbar-success'],
                horizontalPosition: 'end',
                verticalPosition: 'top'
              });
              this.cerrar.emit();
            },
            error: (err) => {
              this.guardando = false;
              console.error('[ODONTOGRAMA] Error al recargar odontograma tras guardar:', err);
              this.snackBar.open('Error al recargar el odontograma', 'Cerrar', {
                duration: 3000,
                panelClass: ['snackbar-error'],
                horizontalPosition: 'end',
                verticalPosition: 'top'
              });
            }
          });
        },
        error: (err) => {
          this.guardando = false;
          console.error('[ODONTOGRAMA] Error al guardar odontograma:', err);
          this.snackBar.open('Error al guardar el odontograma', 'Cerrar', {
            duration: 3000,
            panelClass: ['snackbar-error'],
            horizontalPosition: 'end',
            verticalPosition: 'top'
          });
        },
      });
  }

  async imprimirGrafico(): Promise<void> {
    this.exportando = true;
    console.log('[ODONTOGRAMA] Imprimir gráfico a PDF iniciado');
    setTimeout(() => {
      const odontogramaElement = document.querySelector('.odontograma-main') as HTMLElement;
      if (!odontogramaElement) {
        this.exportando = false;
        return;
      }
      import('html2canvas').then(html2canvas => {
        html2canvas.default(odontogramaElement, { useCORS: true }).then(canvas => {
          const imgData = canvas.toDataURL('image/png', 0.7);
          const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [canvas.width, canvas.height] });
          pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
          pdf.save('odontograma_grafico.pdf');
          this.exportando = false;
          console.log('[ODONTOGRAMA] Imprimir gráfico a PDF terminado');
        }).catch(() => {
          this.exportando = false;
        });
      });
    }, 100);
  }

  imprimirDatos(): void {
    this.exportando = true;
    console.log('[ODONTOGRAMA] Imprimir datos a PDF iniciado');
    setTimeout(() => {
      const datos = this.odontogramaService.exportarDatos();
      const doc = new jsPDF();
      let y = 10;
      doc.setFontSize(12);
      doc.text('Datos del Odontograma', 10, y);
      y += 10;
      Object.entries(datos).forEach(([pieza, zonas]) => {
        doc.text(`${pieza}:`, 10, y);
        y += 10;
        Object.entries(zonas as any).forEach(([zona, info]) => {
          doc.text(`  ${zona}: ${JSON.stringify(info)}`, 10, y);
          y += 10;
        });
      });
      doc.save('odontograma_datos.pdf');
      this.exportando = false;
      console.log('[ODONTOGRAMA] Imprimir datos a PDF terminado');
    }, 100);
  }

  limpiarOdontograma(): void {
    if (confirm("¿Está seguro de que desea limpiar todo el odontograma? Esta acción no se puede deshacer.")) {
      this.odontogramaService.limpiarOdontograma()
      alert("Odontograma limpiado exitosamente")
    }
  }

  async exportarImagen(): Promise<void> {
    this.exportando = true;
    console.log('[ODONTOGRAMA] Exportar imagen a PDF iniciado');
    setTimeout(() => {
      const odontogramaElem = document.querySelector('.odontograma-main') as HTMLElement;
      if (!odontogramaElem) {
        this.exportando = false;
        return;
      }
      import('html2canvas').then(html2canvas => {
        html2canvas.default(odontogramaElem, { useCORS: true }).then(canvas => {
          const imgData = canvas.toDataURL('image/png', 0.7);
          const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [canvas.width, canvas.height] });
          pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
          pdf.save('odontograma.pdf');
          this.exportando = false;
          console.log('[ODONTOGRAMA] Exportar imagen a PDF terminado');
        }).catch(() => {
          this.exportando = false;
        });
      });
    }, 100);
  }

  keyToString(key: unknown): string {
    return String(key);
  }
}
