# 🍅 Alexa Pomodoro

Técnica Pomodoro controlada **por voz desde un Echo** y visualizada en un **panel web**, con una sola base de datos compartida. Proyecto personal de portafolio: un skill de Alexa propio (endpoint HTTPS) más un dashboard, todo en **TypeScript sobre Next.js**, sin AWS Lambda ni DynamoDB.

> **Estado:** en desarrollo por fases. Ver [Hoja de ruta](#hoja-de-ruta) para lo que ya está hecho.

---

## ¿Qué hace?

- **Voz (Echo):** iniciar foco (25 min) y descansos (5 / 15 min), consultar el tiempo restante, cancelar el bloque y pedir el resumen del día.
- **Panel web:** bloque activo con cuenta regresiva, historial del día, pomodoros completados/interrumpidos y gráfica semanal.

> *"Alexa, dile a mi pomodoro que empiece a enfocarme en la API de pagos."*

**Principio de diseño:** la voz es el control, el panel es el tablero.

## Idea clave de arquitectura

El skill **no espera** 25 minutos. Crea un **timer nativo de Alexa** (Timers API), guarda la sesión en MongoDB y termina. Alexa suena sola al vencer, aunque el skill ya haya cerrado su sesión. Cada request es una ejecución independiente y sin memoria: **todo el estado vive en MongoDB**.

```
Tú + Echo ──► Alexa (voz → intent + slots)
                     │  HTTPS
                     ▼
   ┌────────── Next.js en Vercel ──────────┐
   │  /api/alexa   (endpoint del skill)    │
   │  /api/...     (API del panel)         │
   │  Panel web    (dashboard)             │
   └──────────────────┬────────────────────┘
                      ▼
             MongoDB Atlas (M0)

   /api/alexa ──► Timers API de Alexa (crear / cancelar / consultar)
```

## Decisiones técnicas destacadas

| Decisión | Por qué |
|---|---|
| **Un repo, un despliegue, TypeScript de punta a punta** | Menos piezas que mantener; tipos compartidos entre skill y panel. |
| **Endpoint HTTPS propio (no Alexa-hosted)** | Se evita AWS por completo; el skill es una ruta de Next.js. |
| **Patrón `SessionRepository`** | Lógica de negocio desacoplada de Mongo; se prueba con un repositorio en memoria. |
| **Reconciliación perezosa** | Si una sesión venció, se cierra en la *siguiente* orden. No hay cron ni procesos en segundo plano. |
| **Cliente Mongo cacheado en `globalThis`** | En serverless, reconectar en cada request agotaría el margen de ~8 s de Alexa. |
| **Fechas en UTC, "hoy" calculado en `America/Bogota`** | Evita errores de zona horaria; un bloque que cruza medianoche cuenta por su fecha de inicio. |
| **Verificación de firma y timestamp de cada request** | Usa los verificadores oficiales de `ask-sdk-express-adapter` sobre el cuerpo crudo. |
| **Dueño único (`ALEXA_OWNER_ID`)** | Skill personal en modo desarrollo: se rechaza cualquier otro usuario. |
| **Fallo atómico Timer ↔ BD** | Si falla la BD tras crear el timer, se cancela el timer; si falla el timer, no se guarda la sesión. |

## Modelo de datos (MongoDB)

Base `pomodoro`, dos colecciones:

- **`sesiones`**: `ownerId`, `tipo` (`FOCO` · `DESCANSO_CORTO` · `DESCANSO_LARGO`), `tarea?`, `inicio`, `finEsperado`, `fin?`, `estado` (`ACTIVA` · `COMPLETADA` · `INTERRUMPIDA`), `timerId?`, `origen` (`VOZ` · `PANEL`). Índice `{ ownerId: 1, inicio: -1 }`.
- **`estados`**: `_id = ownerId`, `sesionActivaId?`, `focosEnCiclo` (0..4), `zonaHoraria`.

### Regla de ciclo

- Un foco `COMPLETADA` suma 1 a `focosEnCiclo`; uno `INTERRUMPIDA` no suma.
- Con 4 focos, el siguiente descanso es largo (15 min) y el contador vuelve a 0.

## Intents del skill (es-MX)

| Intent | Qué hace |
|---|---|
| `IniciarFoco` | Sesión de foco + timer de 25 min. Slot opcional `tarea`. |
| `IniciarDescanso` | Descanso corto (5) o largo (15) según el ciclo. |
| `CancelarBloque` | Cancela el timer y marca la sesión como interrumpida. |
| `ConsultarTiempo` | Dice cuánto falta. |
| `Resumen` | Completados e interrumpidos de hoy. |
| Integrados | Help, Cancel, Stop, Fallback, NavigateHome. |

## Stack

Next.js (App Router) · React · TypeScript · MongoDB Atlas · ASK SDK para Node.js · Vitest · Vercel

## Estructura

```
src/
├── app/                      # panel + rutas API (route handlers)
└── lib/
    ├── tipos.ts              # tipos de dominio
    ├── tiempo.ts             # "hoy" y "semana" en Bogotá
    ├── ciclo.ts              # reglas de ciclo y reconciliación
    ├── mongo.ts              # cliente cacheado
    └── repositories/
        ├── SessionRepository.ts
        ├── MongoSessionRepository.ts
        └── InMemorySessionRepository.ts
tests/                        # Vitest
```

## Empezar en local

```bash
git clone https://github.com/Jvrmmora/alexa-pomodoro.git
cd alexa-pomodoro
npm install
cp .env.example .env.local   # completa MONGODB_URI, etc.
npm run dev                  # panel en http://localhost:3000
npm test                     # pruebas unitarias
```

### Variables de entorno

| Variable | Descripción |
|---|---|
| `MONGODB_URI` | Cadena de conexión de MongoDB Atlas. |
| `MONGODB_DB` | Nombre de la base (por defecto `pomodoro`). |
| `ALEXA_OWNER_ID` | `userId` de Alexa del dueño. Se descubre en los logs en la primera prueba. |

> Los secretos viven solo en `.env.local` (ignorado por git) y en las variables de entorno de Vercel. **Nunca** se versionan.

## Hoja de ruta

- [x] **Fase 0:** proyecto Next.js, dependencias y decisiones de diseño.
- [ ] **Fase 1 (MVP por voz):** _en curso_
  - [x] Tipos, reglas de ciclo y reconciliación, tiempo en Bogotá (con pruebas)
  - [x] Repositorios en memoria y MongoDB
  - [ ] Verificación de firma de Alexa
  - [ ] Cliente de Timers API
  - [ ] Endpoint `/api/alexa` y handlers
  - [ ] Modelo de interacción `es-MX` y manifiesto del skill
- [ ] **Fase 2:** panel de lectura (login, "Hoy", gráfica semanal, versión móvil).
- [ ] **Fase 3:** edición desde el panel, más pruebas, CI con GitHub Actions.
- [ ] **Fase 4 (extras):** encadenado automático foco → descanso, duraciones configurables por voz, sincronización con Notion.

## Conceptos de Alexa (glosario rápido)

**Utterance**: frase del usuario · **Intent**: intención deducida · **Slot**: hueco variable (`{tarea}`) · **Invocation name**: nombre para abrir el skill · **Endpoint HTTPS**: URL que Alexa llama con el JSON del intent · **Timers API**: timers nativos que suenan aunque el skill ya haya terminado.

## Costos

Uso personal: costo cero o casi cero (Vercel Hobby, Atlas M0, skill en modo desarrollo, Echo existente). Sin cuenta de AWS.

## Licencia

MIT
