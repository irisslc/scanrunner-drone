# ScanRunner Drone

Videojuego WebGL desarrollado con **Three.js** y **Vite** para la asignatura de Gráficos por Computador.

---

## Ejecución en local

```bash
# 1. Instalar dependencias
npm install

# 2. Servidor de desarrollo (localhost:5173)
npm run dev

# 3. Generar build de producción
npm run build

# 4. Vista previa del build
npm run preview
```

Requiere **Node.js ≥ 18**.

---

## Controles

| Tecla / Acción | Función |
|---|---|
| `W A S D` | Mover el dron |
| `Espacio` | Subir |
| `Shift izq.` | Bajar |
| `Click + arrastrar` | Rotar cámara |
| `E` (mantener) | Escanear objetivo activo |
| `ESC` | Pausa / Reanudar |
| `R` | Reiniciar (tras ganar/perder) |

---

## Mecánicas

### Objetivo principal
Escanea los **5 objetivos** (pilares amarillos) antes de que se agote la batería.  
Apunta al objetivo activo y mantén `E` hasta completar el escaneo.

### Batería / Tiempo
- La batería baja constantemente (cuenta atrás de 100 s).
- Recibes daño adicional si el enemigo te toca o entras en zonas peligrosas.

### Enemigos
- **Rojo** (rápido): Rebota por el hangar, mucho daño.
- **Púrpura** (lento pero grande): Más daño por segundo.

### Zonas peligrosas
Tres círculos rojos en el suelo drenan batería mientras el dron permanece sobre ellos.

### Sistema de Rank
| Rank | Tiempo | Daño |
|---|---|---|
| **S** | ≤ 42 s | < 25 |
| **A** | ≤ 60 s | < 45 |
| **B** | ≤ 80 s | < 65 |
| **C** | resto | - |

---

## 🎨 Técnicas gráficas implementadas

- **Geometría procedimental** — dron, hangar, props (cajones, barriles, toros) construidos con primitivas Three.js.
- **Cámara virtual** — cámara en tercera persona con suavizado (*lerp*) y límites de escena.
- **Iluminación múltiple** — luz ambiental, direccional con sombras suaves (PCFSoft), *spot light* dinámica y *point lights* con colores neón.
- **Materiales PBR** — *roughness*, *metalness*, *emissive* en todos los objetos.
- **Texturas procedurales** — suelo con cuadrícula sci-fi y paredes con paneles, generadas en `CanvasTexture`.
- **Rasterización en tiempo real** — pipeline estándar WebGL/Three.js con sombras y niebla exponencial.
- **HUD + overlays HTML** — interfaz superpuesta al canvas (barra de batería, brújula de dirección, efectos de daño).
- **Audio Web API** — síntesis de sonidos sin assets externos.

---

## 📦 Dependencias

| Paquete | Uso |
|---|---|
| `three` ^0.183 | Motor 3D / WebGL |
| `vite` ^8 | Bundler y servidor dev |

---

## 🌐 Despliegue

El build se publica directamente en **GitHub Pages** apuntando a la carpeta `dist/` generada por `npm run build`.

```bash
npm run build   
```
