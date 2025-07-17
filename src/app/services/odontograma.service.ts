import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { map, tap } from 'rxjs/operators';
import { environment } from '../environments/environment';

export interface ZonaEstado {
  herramienta: string;
  color: string;
  estado: 'a_realizar' | 'realizado' | 'anterior' | 'extraccion' | 'corona';
}

export interface PiezaDental {
  numero: number;
  tipo: 'permanente' | 'temporal';
  cuadrante: number;
  zonas: {
    superior: ZonaEstado | null;
    inferior: ZonaEstado | null;
    izquierda: ZonaEstado | null;
    derecha: ZonaEstado | null;
    centro: ZonaEstado | null;
  };
}

export interface OdontogramaData {
  piezas: { [key: number]: PiezaDental };
  notas: string;
  odontologo: string;
  fecha: Date;
}

@Injectable({
  providedIn: 'root'
})
export class OdontogramaService {
  // Eliminar odontogramasPorPaciente y pacienteActualId
  private odontogramaSubject = new BehaviorSubject<OdontogramaData>(this.inicializarOdontograma());
  public odontograma$ = this.odontogramaSubject.asObservable();

  private herramientaActualSubject = new BehaviorSubject<string>('pintar');
  public herramientaActual$ = this.herramientaActualSubject.asObservable();

  private estadoActualSubject = new BehaviorSubject<string>('a_realizar');
  public estadoActual$ = this.estadoActualSubject.asObservable();

  private coloresEstado = {
    'a_realizar': '#3B82F6', // Azul
    'realizado': '#10B981',   // Verde
    'anterior': '#EF4444',    // Rojo
    'extraccion': '#6B7280',  // Gris
    'corona': '#F59E0B'       // Dorado
  };

  private herramientas = [
    { id: 'pintar', nombre: 'Pintar', icono: 'fas fa-paint-brush' },
    { id: 'borrar', nombre: 'Borrar', icono: 'fas fa-eraser' },
    { id: 'corona', nombre: 'Corona', icono: 'fas fa-crown' },
    { id: 'extraccion', nombre: 'Extracción', icono: 'fas fa-times' },
    { id: 'endodoncia', nombre: 'Endodoncia', icono: 'fas fa-tooth' },
    { id: 'protesis_fija', nombre: 'Prótesis Fija', icono: 'fas fa-link' },
    { id: 'protesis_removible', nombre: 'Prótesis Removible', icono: 'fas fa-unlink' },
    { id: 'sellador', nombre: 'Sellador', icono: 'fas fa-shield-alt' },
    { id: 'caries', nombre: 'Caries', icono: 'fas fa-bug' },
    { id: 'implante', nombre: 'Implante', icono: 'fas fa-screw' }
  ];

  // Usar la URL base de la API desde environment
  private baseUrl = `${environment.apiUrl}/odontograma`;

  constructor(private http: HttpClient) {}

  private inicializarOdontograma(): OdontogramaData {
    const piezas: { [key: number]: PiezaDental } = {};
    // Dientes permanentes
    const permanentes = [
      18, 17, 16, 15, 14, 13, 12, 11,
      21, 22, 23, 24, 25, 26, 27, 28,
      38, 37, 36, 35, 34, 33, 32, 31,
      41, 42, 43, 44, 45, 46, 47, 48
    ];
    // Dientes temporales
    const temporales = [
      55, 54, 53, 52, 51,
      61, 62, 63, 64, 65,
      75, 74, 73, 72, 71,
      81, 82, 83, 84, 85
    ];
    [...permanentes, ...temporales].forEach(numero => {
      piezas[numero] = {
        numero,
        tipo: numero > 50 ? 'temporal' : 'permanente',
        cuadrante: Math.floor(numero / 10),
        zonas: {
          superior: null,
          inferior: null,
          izquierda: null,
          derecha: null,
          centro: null
        }
      };
    });
    return {
      piezas,
      notas: '',
      odontologo: '',
      fecha: new Date()
    };
  }

  setHerramientaActual(herramienta: string): void {
    this.herramientaActualSubject.next(herramienta);
  }

  setEstadoActual(estado: string): void {
    this.estadoActualSubject.next(estado);
  }

  // Al aplicar herramienta, actualizar el odontograma del paciente actual
  aplicarHerramienta(numeroPieza: number, zona: keyof PiezaDental["zonas"]): void {
    const odontogramaActual = this.odontogramaSubject.value;
    const piezaOriginal = odontogramaActual.piezas[numeroPieza];
    const nuevaZonas = { ...piezaOriginal.zonas };
    if (this.herramientaActualSubject.value === 'borrar') {
      nuevaZonas[zona] = null;
    } else {
      const nuevoEstado: ZonaEstado = {
        herramienta: this.herramientaActualSubject.value,
        color: this.coloresEstado[this.estadoActualSubject.value as keyof typeof this.coloresEstado],
        estado: this.estadoActualSubject.value as any
      };
      nuevaZonas[zona] = nuevoEstado;
    }
    const nuevaPieza: PiezaDental = { ...piezaOriginal, zonas: nuevaZonas };
    const nuevasPiezas = { ...odontogramaActual.piezas, [numeroPieza]: nuevaPieza };
    const nuevoOdontograma = { ...odontogramaActual, piezas: nuevasPiezas };
    this.odontogramaSubject.next(nuevoOdontograma);
  }

  actualizarNotas(notas: string): void {
    const odontogramaActual = this.odontogramaSubject.value;
    odontogramaActual.notas = notas;
    this.odontogramaSubject.next({ ...odontogramaActual });
  }

  actualizarOdontologo(odontologo: string): void {
    const odontogramaActual = this.odontogramaSubject.value;
    odontogramaActual.odontologo = odontologo;
    this.odontogramaSubject.next({ ...odontogramaActual });
  }

  getHerramientas() {
    return this.herramientas;
  }

  getColoresEstado() {
    return this.coloresEstado;
  }

  // Cargar odontograma de un paciente
  getOdontogramaByPacienteId(pacienteId: string): Observable<OdontogramaData> {
    return this.http.get<any>(`${this.baseUrl}/paciente/${pacienteId}`).pipe(
      map(res => {
        const data = res.odontograma || res;
        if (data.fecha) data.fecha = new Date(data.fecha);
        // No modificar piezas, dejarlo tal cual lo recibe
        return data as OdontogramaData;
      }),
      tap(data => {
        this.odontogramaSubject.next(data);
      })
    );
  }

  // Guardar/actualizar odontograma de un paciente
  saveOdontograma(pacienteId: string): Observable<any> {
    const odontograma = this.odontogramaSubject.value;
    // Enviar el objeto piezas tal cual, asegurando claves string
    const piezasStringKey: { [key: string]: PiezaDental } = {};
    Object.entries(odontograma.piezas).forEach(([k, v]) => {
      piezasStringKey[String(k)] = v;
    });
    const odontogramaToSend = { ...odontograma, piezas: piezasStringKey };
    return this.http.put(`${this.baseUrl}/paciente/${pacienteId}`, odontogramaToSend);
  }

  // Usado por el componente para guardar (puedes adaptar para que reciba el pacienteId)
  guardarOdontograma(pacienteId?: string): Observable<any> {
    if (pacienteId) {
      return this.saveOdontograma(pacienteId);
    } else {
      // Mock para pruebas locales
      return new Observable(observer => {
        setTimeout(() => {
          observer.next({ success: true, message: 'Odontograma guardado exitosamente (mock)' });
          observer.complete();
        }, 1000);
      });
    }
  }

  exportarDatos(): any {
    return this.odontogramaSubject.value;
  }

  limpiarOdontograma(): void {
    this.odontogramaSubject.next(this.inicializarOdontograma());
  }
} 