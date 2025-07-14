import { Component, type OnInit, type OnDestroy, Output, EventEmitter } from "@angular/core"
import { Input } from '@angular/core';
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

@Component({
  selector: "app-odontograma",
  standalone: true,
  imports: [CommonModule, FormsModule, PiezaDentalComponent, MatSnackBarModule],
  templateUrl: "./odontograma.component.html",
  styleUrls: ["./odontograma.component.css"],
})
export class OdontogramaComponent implements OnInit, OnDestroy {
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

  odontologoLogueado: string = '';
  odontologoId: string = '';

  historialOdontogramas: any[] = [];
  mostrarHistorial = false;

  constructor(
    private odontogramaService: OdontogramaService,
    private snackBar: MatSnackBar,
    private http: HttpClient
  ) {
    this.herramientas = this.odontogramaService.getHerramientas();
    this.coloresEstado = this.odontogramaService.getColoresEstado();
  }

  ngOnInit(): void {
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

    // Usar SIEMPRE el _id del paciente
    const pacienteId = this.paciente?._id;
    if (pacienteId) {
      // No limpiar aquí, solo al cambiar de paciente
      this.odontogramaService.getOdontogramaByPacienteId(pacienteId).subscribe({
        next: (data) => {
          // El servicio ya actualiza el BehaviorSubject con la respuesta real
        },
        error: (err) => {
          if (err.status === 404) {
            // Inicializar odontograma vacío y permitir edición
            this.odontogramaService.limpiarOdontograma();
          } else {
            this.snackBar.open('Error al cargar el odontograma. Verifique su sesión o intente nuevamente.', 'Cerrar', {
              duration: 4000,
              panelClass: ['snackbar-error'],
              horizontalPosition: 'end',
              verticalPosition: 'top'
            });
          }
        }
      });
      this.cargarHistorialOdontogramas(pacienteId);
    } else {
      this.odontogramaService.limpiarOdontograma();
    }

    this.odontogramaService.odontograma$.pipe(takeUntil(this.destroy$)).subscribe((data: OdontogramaData) => {
      this.odontogramaData = data
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
    if (pacienteId) {
      this.cargarHistorialOdontogramas(pacienteId);
    }
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

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  seleccionarHerramienta(herramienta: string): void {
    this.odontogramaService.setHerramientaActual(herramienta)
  }

  seleccionarEstado(estado: string): void {
    this.odontogramaService.setEstadoActual(estado)
  }

  onZonaClic(event: { numeroPieza: number; zona: "superior" | "inferior" | "izquierda" | "derecha" | "centro" }): void {
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
    const pacienteId = this.paciente?._id;
    if (!pacienteId) {
      this.guardando = false;
      this.snackBar.open('Error: No se encontró el ID del paciente. No se puede guardar el odontograma.', 'Cerrar', {
        duration: 4000,
        panelClass: ['snackbar-error'],
        horizontalPosition: 'end',
        verticalPosition: 'top'
      });
      return;
    }
    this.odontogramaData.odontologo = this.odontologoId;
    this.odontogramaService
      .guardarOdontograma(pacienteId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.guardando = false;
          this.odontogramaService.getOdontogramaByPacienteId(pacienteId).subscribe();
          this.snackBar.open('¡Odontograma guardado exitosamente!', 'Cerrar', {
            duration: 3000,
            panelClass: ['snackbar-success'],
            horizontalPosition: 'end',
            verticalPosition: 'top'
          });
          this.cerrar.emit();
        },
        error: () => {
          this.guardando = false;
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
    const odontogramaElement = document.querySelector('.odontograma-main') as HTMLElement;
    if (!odontogramaElement) {
      alert('No se encontró el odontograma para imprimir.');
      return;
    }
    const canvas = await html2canvas(odontogramaElement, {
      useCORS: true
    });
    const dataUrl = canvas.toDataURL('image/png');
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Odontograma - ${this.paciente?.nombre || 'Paciente'}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; text-align: center; }
              .header { margin-bottom: 30px; }
              .patient-info { margin-bottom: 20px; }
              img { max-width: 100%; height: auto; margin: 0 auto; display: block; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Odontograma Clínico</h1>
              <h2>${this.paciente?.nombre || 'Paciente'} ${this.paciente?.apellido || ''}</h2>
            </div>
            <div class="patient-info">
              <p><strong>Fecha:</strong> ${this.odontogramaData.fecha.toLocaleDateString()}</p>
              <p><strong>Odontólogo:</strong> ${this.odontogramaData.odontologo || 'No especificado'}</p>
              <p><strong>DNI:</strong> ${this.paciente?.dni || 'No especificado'}</p>
            </div>
            <img src="${dataUrl}" alt="Odontograma Gráfico" />
            <div style="margin-top: 30px; color: #666; font-size: 12px;">
              <p>Reporte generado el ${new Date().toLocaleDateString('es-ES')} a las ${new Date().toLocaleTimeString('es-ES')}</p>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  }

  imprimirDatos(): void {
    const datos = this.odontogramaService.exportarDatos();
    const zonaNombres: { [key: string]: string } = {
      'superior': 'Oclusal (O)',
      'inferior': 'Lingual (L)', 
      'izquierda': 'Mesial (M)',
      'derecha': 'Distal (D)',
      'centro': 'Vestibular (V)'
    };

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Datos del Odontograma - ${this.paciente?.nombre || 'Paciente'}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #0072ce; padding-bottom: 20px; }
              .patient-info { background: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
              .treatments { margin-top: 20px; }
              .piece-treatment { 
                background: #fff; 
                border: 1px solid #ddd; 
                margin: 10px 0; 
                padding: 15px; 
                border-radius: 5px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
              .piece-number { 
                font-weight: bold; 
                color: #0072ce; 
                font-size: 16px; 
                margin-bottom: 10px;
              }
              .zone-treatment { 
                margin: 5px 0; 
                padding: 5px 10px; 
                background: #f8f9fa; 
                border-left: 3px solid #0072ce;
              }
              .no-treatments { 
                color: #666; 
                font-style: italic; 
                text-align: center; 
                padding: 20px;
              }
              .notes { 
                background: #fff3cd; 
                border: 1px solid #ffeaa7; 
                padding: 15px; 
                border-radius: 5px; 
                margin-top: 20px;
              }
              @media print {
                body { margin: 0; }
                .piece-treatment { break-inside: avoid; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>📋 Reporte de Odontograma</h1>
              <h2>${this.paciente?.nombre || 'Paciente'} ${this.paciente?.apellido || ''}</h2>
            </div>
            
            <div class="patient-info">
              <h3>📋 Información del Paciente</h3>
              <p><strong>Nombre:</strong> ${this.paciente?.nombre || 'No especificado'} ${this.paciente?.apellido || ''}</p>
              <p><strong>DNI:</strong> ${this.paciente?.dni || 'No especificado'}</p>
              <p><strong>Teléfono:</strong> ${this.paciente?.telefono || 'No especificado'}</p>
              <p><strong>Obra Social:</strong> ${this.paciente?.obraSocial || 'No especificado'}</p>
            </div>
            
            <div class="patient-info">
              <h3>👨‍⚕️ Información del Tratamiento</h3>
              <p><strong>Fecha:</strong> ${datos.fecha.toLocaleDateString('es-ES', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}</p>
              <p><strong>Odontólogo:</strong> ${datos.odontologo || 'No especificado'}</p>
            </div>
            
            <div class="treatments">
              <h3>🦷 Tratamientos por Pieza Dental</h3>
              ${(() => {
                const piezasConTratamientos = Object.values(datos.piezas)
                  .filter((pieza: any) => {
                    return Object.values(pieza.zonas).some((zona: any) => zona !== null);
                  });
                
                if (piezasConTratamientos.length === 0) {
                  return '<div class="no-treatments">No se han registrado tratamientos en ninguna pieza dental.</div>';
                }
                
                return piezasConTratamientos
                  .map((pieza: any) => {
                    const tratamientos = Object.entries(pieza.zonas)
                      .filter(([_, zona]) => zona !== null)
                      .map(([nombreZona, zona]: [string, any]) => {
                        const nombreZonaCompleto = zonaNombres[nombreZona] || nombreZona;
                        return `<div class="zone-treatment">
                                  <strong>${nombreZonaCompleto}:</strong> ${zona.herramienta} - ${zona.estado.replace(/_/g, ' ').toUpperCase()}
                                </div>`;
                      })
                      .join('');
                    
                    return tratamientos ? `
                      <div class="piece-treatment">
                        <div class="piece-number">🦷 Pieza ${pieza.numero}</div>
                        ${tratamientos}
                      </div>
                    ` : '';
                  })
                  .join('');
              })()}
            </div>
            
            ${datos.notas ? `
              <div class="notes">
                <h3>📝 Notas Clínicas</h3>
                <p>${datos.notas}</p>
              </div>
            ` : ''}
            
            <div style="margin-top: 30px; text-align: center; color: #666; font-size: 12px;">
              <p>Reporte generado el ${new Date().toLocaleDateString('es-ES')} a las ${new Date().toLocaleTimeString('es-ES')}</p>
            </div>
          </body>
        </html>
      `;
      
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  }

  limpiarOdontograma(): void {
    if (confirm("¿Está seguro de que desea limpiar todo el odontograma? Esta acción no se puede deshacer.")) {
      this.odontogramaService.limpiarOdontograma()
      alert("Odontograma limpiado exitosamente")
    }
  }

  async exportarImagen(): Promise<void> {
    const odontogramaElement = document.querySelector('.odontograma-main') as HTMLElement;
    if (!odontogramaElement) {
      alert('No se encontró el odontograma para exportar.');
      return;
    }
    const canvas = await html2canvas(odontogramaElement, {
      useCORS: true
    });
    const link = document.createElement('a');
    link.download = `odontograma_${this.paciente?.nombre || 'paciente'}_${new Date().toISOString().split('T')[0]}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  keyToString(key: unknown): string {
    return String(key);
  }
}
