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
| `ConfigurarDuracion` | *"configura el foco en 30 minutos"*. Tipos: foco, descanso corto, descanso largo. |
| `RestablecerDuraciones` | Vuelve a 25 / 5 / 15. |
| `ActivarEncadenado` / `DesactivarEncadenado` | Cada foco programa también el descanso que le sigue. |
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
    ├── edicion.ts            # edición del historial desde el panel
    ├── panel.ts              # datos del panel (hoy + semana)
    ├── sesionPanel.ts        # cookie de sesión firmada (HMAC)
    ├── alexa/                # verificación de firma, Timers API, servicio y handlers
    └── repositories/
        ├── SessionRepository.ts
        ├── MongoSessionRepository.ts
        └── InMemorySessionRepository.ts
skill-package/                # manifiesto y modelo de interacción es-MX
tests/                        # Vitest
```

## Extras (fase 4)

**Descansos encadenados.** Alexa no deja que un skill lance el siguiente bloque por sí solo: al vencer, un timer solo puede anunciar un texto, sonar, o (`LAUNCH_TASK`) preguntar y esperar un "sí" del usuario, y eso exige estar en un programa de vista previa. Por eso, con el encadenado activo, un foco crea **dos timers** desde el inicio (foco y foco+descanso). Alexa avisa al terminar el foco ("Descansa 5 minutos") y otra vez al terminar el descanso. El descanso se registra en el historial la próxima vez que se consulta el estado, con su hora de inicio real (`reconciliar` cierra el foco y crea el descanso, y sigue evaluando). Cancelar cancela ambos timers. El tipo de descanso (corto/largo) se decide al iniciar el foco.

**Duraciones por voz.** Se guardan en `estados.duraciones` y aplican desde el siguiente bloque. Límites: foco 5–120 min, descansos 1–60 (la Timers API admite hasta 2 h).

**Notion (opcional).** Si defines `NOTION_TOKEN` y `NOTION_DATABASE_ID`, cada foco que termina (completado o interrumpido, por voz) crea una fila en tu base. Columnas requeridas: `Name` (título) · `Estado` (select: Completado / Interrumpido) · `Inicio` (fecha) · `Minutos` (número). La sincronización espera como máximo 3 s y nunca rompe la respuesta de voz si Notion falla; `notionPageId` evita duplicados. No se sincronizan las ediciones ni los bloques registrados a mano en el panel.

## Edición desde el panel

Sobre el historial se puede cambiar la tarea de un foco, marcarlo como completado o interrumpido, eliminarlo y registrar un bloque que ya hiciste (`origen: PANEL`).

- Un bloque **en curso** no se edita desde el panel: tiene un timer vivo en Alexa y su token solo llega con las requests de voz. Se cancela por voz.
- Editar el historial **no recalcula** `focosEnCiclo`: ese contador es el estado vivo del ciclo de la voz, no una estadística.
- Cada Server Action vuelve a comprobar la sesión, porque se puede invocar por POST directo.

## Desplegar el skill

1. Despliega en Vercel con `MONGODB_URI`, `MONGODB_DB` y `ALEXA_OWNER_ID` (vacío la primera vez).
2. En la [consola de Alexa](https://developer.amazon.com/alexa/console/ask) crea un skill personalizado (es-MX, endpoint HTTPS propio) y carga `skill-package/` (o pega `es-MX.json` y define la URL de `/api/alexa`).
3. Habilita el permiso de timers y dile algo al skill desde el simulador: el `userId` aparece en los logs de Vercel. Guárdalo en `ALEXA_OWNER_ID` y redespliega.
4. Acepta el permiso de timers en la app de Alexa cuando el skill lo pida.

## Empezar en local

```bash
git clone https://github.com/Jvrmmora/alexa-pomodoro.git
cd alexa-pomodoro
npm install
cp .env.example .env.local   # completa MONGODB_URI, etc.
npm run dev                  # panel en http://localhost:3000
npm test                     # pruebas unitarias (también corren en CI)
```

### Variables de entorno

| Variable | Descripción |
|---|---|
| `MONGODB_URI` | Cadena de conexión de MongoDB Atlas. |
| `MONGODB_DB` | Nombre de la base (por defecto `pomodoro`). |
| `ALEXA_OWNER_ID` | `userId` de Alexa del dueño. Se descubre en los logs en la primera prueba. |
| `NOTION_TOKEN` | _(opcional)_ Token de una integración interna de Notion. |
| `NOTION_DATABASE_ID` | _(opcional)_ Id de la base de Notion, compartida con esa integración. |
| `PANEL_PASSWORD` | Contraseña para entrar al panel web. |
| `PANEL_SECRET` | Secreto aleatorio para firmar la cookie de sesión (`openssl rand -hex 32`). |

> Los secretos viven solo en `.env.local` (ignorado por git) y en las variables de entorno de Vercel. **Nunca** se versionan.

## Hoja de ruta

- [x] **Fase 0:** proyecto Next.js, dependencias y decisiones de diseño.
- [x] **Fase 1 (MVP por voz):** desplegado y probado en el simulador de Alexa
  - [x] Tipos, reglas de ciclo y reconciliación, tiempo en Bogotá (con pruebas)
  - [x] Repositorios en memoria y MongoDB
  - [x] Verificación de firma de Alexa
  - [x] Cliente de Timers API
  - [x] Endpoint `/api/alexa` y handlers
  - [x] Modelo de interacción `es-MX` y manifiesto del skill
- [x] **Fase 2:** panel de lectura (login, "Hoy", historial, gráfica semanal, versión móvil, comandos de voz).
- [x] **Fase 3:** edición desde el panel (tarea, estado, eliminar, registrar bloques), más pruebas y CI con GitHub Actions.
- [x] **Fase 4 (extras):** descansos encadenados, duraciones configurables por voz y sincronización opcional con Notion.

## Conceptos de Alexa (glosario rápido)

**Utterance**: frase del usuario · **Intent**: intención deducida · **Slot**: hueco variable (`{tarea}`) · **Invocation name**: nombre para abrir el skill · **Endpoint HTTPS**: URL que Alexa llama con el JSON del intent · **Timers API**: timers nativos que suenan aunque el skill ya haya terminado.

## Costos

Uso personal: costo cero o casi cero (Vercel Hobby, Atlas M0, skill en modo desarrollo, Echo existente). Sin cuenta de AWS.

## Licencia

MIT
