<div align="center">

<img src="docs/logo.svg" alt="Alexa Pomodoro" width="96" height="96" />

# Alexa Pomodoro

**Técnica Pomodoro controlada por voz desde un Echo y visualizada en un panel web.**
Un skill de Alexa propio (endpoint HTTPS) más un dashboard, todo en TypeScript sobre Next.js. Sin AWS Lambda ni DynamoDB.

[![CI](https://github.com/Jvrmmora/alexa-pomodoro/actions/workflows/ci.yml/badge.svg)](https://github.com/Jvrmmora/alexa-pomodoro/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![Licencia](https://img.shields.io/badge/licencia-MIT-blue)

<img src="docs/panel-escritorio.png" alt="Panel de Alexa Pomodoro en escritorio" width="760" />

</div>

> *"Alexa, dile a mi pomodoro que empiece a enfocarme en la API de pagos."*

**Principio de diseño:** la voz es el control, el panel es el tablero.

## Contenido

- [Qué hace](#qué-hace)
- [Cómo funciona](#cómo-funciona)
- [Requisitos](#requisitos)
- [Variables de entorno](#variables-de-entorno)
- [Probarlo en local](#probarlo-en-local)
- [Crear el skill de Alexa](#crear-el-skill-de-alexa)
- [Desplegar en Vercel](#desplegar-en-vercel)
- [Comandos de voz](#comandos-de-voz)
- [Panel web](#panel-web)
- [Decisiones técnicas](#decisiones-técnicas)
- [Modelo de datos](#modelo-de-datos)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Solución de problemas](#solución-de-problemas)
- [Hoja de ruta](#hoja-de-ruta)

## Qué hace

- **Voz (Echo):** iniciar foco (25 min) y descansos (5 / 15 min), consultar el tiempo restante, cancelar el bloque, pedir el resumen del día, cambiar las duraciones y programar el descanso con cada foco.
- **Panel web:** bloque activo con cuenta regresiva, ciclo de 4 focos, historial del día, gráfica semanal, edición del historial y una guía con la rutina diaria.

<div align="center">
<img src="docs/panel-movil.png" alt="Panel en móvil" width="300" />
&nbsp;&nbsp;
<img src="docs/panel-guia.png" alt="Guía de rutina diaria" width="440" />
</div>

## Cómo funciona

El skill **no espera** 25 minutos. Crea un **timer nativo de Alexa** (Timers API), guarda la sesión en MongoDB y termina. Alexa suena sola al vencer, aunque el skill ya haya cerrado su sesión. Cada request es una ejecución independiente y sin memoria: **todo el estado vive en MongoDB**.

```mermaid
flowchart LR
  V["🗣️ Tú + Echo"] -->|① habla| A["Alexa Cloud<br/>voz → intent + slots"]
  A -->|② HTTPS + JSON firmado| S
  subgraph Vercel["Next.js en Vercel"]
    S["/api/alexa<br/>firma · dueño · handlers"]
    P["Panel web<br/>login · hoy · semana · edición"]
  end
  S -->|③ crea / cancela timers| T["Timers API de Alexa"]
  S <-->|④ lee y guarda estado| DB[("MongoDB Atlas<br/>sesiones · estados")]
  P <--> DB
  B["🖥️ Navegador o móvil"] --> P
  T -. ⑤ suena al vencer .-> V
```

Así se ve el inicio de un foco, paso a paso:

```mermaid
sequenceDiagram
  actor U as Tú
  participant A as Alexa
  participant S as /api/alexa
  participant D as MongoDB
  participant T as Timers API
  U->>A: "dile a mi pomodoro que empiece a enfocarme en la API"
  A->>S: IniciarFoco {tarea: "la API"} (firmado)
  S->>S: verifica firma, timestamp y dueño
  S->>D: reconcilia la sesión anterior
  S->>T: crea el timer de 25 min (y el del descanso si hay encadenado)
  S->>D: guarda la sesión ACTIVA
  S-->>A: "Listo, 25 minutos de foco en la API"
  A-->>U: responde y cierra la sesión del skill
  Note over T,U: 25 min después Alexa suena sola, sin pasar por el skill
```

## Requisitos

| Qué | Para qué | Costo |
|---|---|---|
| **Node.js 22+** y npm | Correr, probar y compilar el proyecto | Gratis |
| **MongoDB Atlas** (clúster M0) | Guardar sesiones y estado | Gratis |
| Cuenta de **Amazon Developer** ([developer.amazon.com](https://developer.amazon.com)) | Crear el skill en modo desarrollo | Gratis |
| Un **Echo** o la pestaña *Test* de la consola de Alexa | Hablarle al skill (los timers **solo suenan en un Echo real**) | Dispositivo existente |
| Cuenta de **Vercel** (plan Hobby) | Alojar el endpoint HTTPS y el panel | Gratis |

> Para solo ver el panel o correr las pruebas **no necesitas** cuenta de Amazon ni Vercel. Con Node y un clúster de Atlas es suficiente.

## Variables de entorno

Copia `.env.example` a `.env.local` (ignorado por git) y complétalo. En Vercel van en *Settings → Environment Variables*.

| Variable | Obligatoria | Descripción |
|---|:-:|---|
| `MONGODB_URI` | ✅ | Cadena de conexión de Atlas: `mongodb+srv://usuario:clave@cluster.mongodb.net/`. |
| `MONGODB_DB` | | Nombre de la base. Por defecto `pomodoro`. |
| `ALEXA_OWNER_ID` | ✅ | `userId` de Alexa del dueño del skill. Se descubre en los logs en la primera prueba ([ver cómo](#4-descubrir-tu-userid)). Para ver solo el panel sirve cualquier texto, p. ej. `demo-owner`. |
| `PANEL_PASSWORD` | ✅ | Contraseña para entrar al panel web. |
| `PANEL_SECRET` | ✅ | Secreto aleatorio para firmar la cookie de sesión: `openssl rand -hex 32`. |

> Los secretos viven solo en `.env.local` y en Vercel. **Nunca** se versionan.

## Probarlo en local

### 1. Instalar

```bash
git clone https://github.com/Jvrmmora/alexa-pomodoro.git
cd alexa-pomodoro
npm install
cp .env.example .env.local
```

### 2. Ver el panel con datos de ejemplo (sin Alexa)

Edita `.env.local` y usa una base **aparte** para la demo:

```bash
MONGODB_URI=mongodb+srv://usuario:clave@cluster.mongodb.net/
MONGODB_DB=pomodoro-demo
ALEXA_OWNER_ID=demo-owner
PANEL_PASSWORD=la-que-quieras
PANEL_SECRET=<salida de: openssl rand -hex 32>
```

```bash
npm run seed       # carga una semana de bloques de ejemplo y un foco en curso
npm run dev        # http://localhost:3000  → entra con PANEL_PASSWORD
npm run seed:limpiar   # borra solo lo que insertó la demo
```

El script se niega a escribir si `MONGODB_DB` no contiene la palabra `demo`, para que no ensucies tus datos reales.

### 3. Pruebas y chequeos

```bash
npm test                 # Vitest: ciclo, reconciliación, handlers del skill, timers, panel, edición
npm run lint             # ESLint
npx next typegen && npx tsc --noEmit   # tipos (typegen genera PageProps/LayoutProps)
npm run build            # build de producción
```

Las pruebas **no necesitan** Alexa, Mongo ni red: usan un repositorio en memoria, un timer falso y sobres de petición de ejemplo. El CI de GitHub Actions ejecuta exactamente esto en cada push.

### 4. Probar el skill contra tu máquina (opcional)

Alexa solo habla con URLs HTTPS públicas, así que necesitas un túnel hacia tu `npm run dev`:

```bash
npx cloudflared tunnel --url http://localhost:3000     # o: ngrok http 3000
```

Usa la URL que te dé (`https://xxxx.trycloudflare.com/api/alexa`) como *Endpoint* del skill (ver [Crear el skill](#crear-el-skill-de-alexa)). La firma y el timestamp de Alexa se verifican igual que en producción, así que es una prueba fiel. Comprueba que el endpoint rechaza lo que no viene de Alexa:

```bash
curl -i -X POST http://localhost:3000/api/alexa -d '{}'   # → 400 Request no válida
```

## Crear el skill de Alexa

El código del skill es la ruta `/api/alexa`. Falta registrarlo en Amazon. Necesitas antes una URL pública (ver [Desplegar en Vercel](#desplegar-en-vercel) o un túnel).

### 1. Crear el skill

1. Entra a la [consola de Alexa](https://developer.amazon.com/alexa/console/ask) → **Create Skill**.
2. Nombre `Mi Pomodoro`, idioma **Spanish (MX)**.
3. Experiencia **Other**, modelo **Custom**, hosting **Provision your own**.
4. Plantilla **Start from Scratch** → **Create skill**.

> El **invocation name** (`mi pomodoro`) viene en el modelo. Si quieres otro nombre, cámbialo en `invocationName` de [es-MX.json](skill-package/interactionModels/custom/es-MX.json).

### 2. Cargar el modelo de interacción

**Build → Interaction Model → JSON Editor**: borra todo, pega el contenido de [skill-package/interactionModels/custom/es-MX.json](skill-package/interactionModels/custom/es-MX.json), pulsa **Save Model** y **Build Model**. Repite este paso cada vez que cambies ese archivo.

### 3. Endpoint y permiso de timers

- **Build → Endpoint**: elige **HTTPS**, pega `https://TU-DOMINIO/api/alexa` y escoge el tipo de certificado:
  - dominio `*.vercel.app` (o de un túnel): *"My development endpoint is a **sub-domain of a domain that has a wildcard certificate** from a certificate authority"*;
  - dominio propio con certificado a su nombre: *"…has a certificate from a trusted certificate authority"*.
  Pulsa **Save**.
- **Build → Permissions**: activa **Timers** (`alexa::alerts:timers:skill:readwrite`).
- **Build skill**.

### 4. Descubrir tu `userId`

El skill es personal: solo atiende a un usuario (`ALEXA_OWNER_ID`). La primera vez no lo conoces, y el endpoint lo imprime en los logs:

1. Con `ALEXA_OWNER_ID` vacío, ve a la pestaña **Test**, selecciona **Development** y escribe `abre mi pomodoro`. Responderá que aún no está configurado.
2. Mira los logs (en Vercel: `npx vercel logs --since 10m -x`, o el panel *Logs*) y copia el valor de `userId de esta request: amzn1.ask.account…`. También aparece en el *JSON Input* del simulador (`session.user.userId`).
3. Guárdalo como `ALEXA_OWNER_ID` y redespliega.

### 5. Probar

En **Test** (sin decir "Alexa" en el simulador): `dile a mi pomodoro que empiece a enfocarme en la prueba`. La primera vez pedirá el permiso de timers: acéptalo en la app de Alexa (*Más → Skills y juegos → Mi Pomodoro → Configuración*) y repite. En un Echo con la misma cuenta de Amazon funciona igual, diciendo "Alexa" al principio.

## Desplegar en Vercel

1. Importa el repositorio en [vercel.com/new](https://vercel.com/new).
2. Agrega las [variables de entorno](#variables-de-entorno) (`ALEXA_OWNER_ID` puede ir vacía al principio).
3. **Deploy**. Tu endpoint es `https://<proyecto>.vercel.app/api/alexa`.
4. En *Settings → Deployment Protection* **desactiva Vercel Authentication** para producción. Si no, Alexa recibe un 302 hacia el login de Vercel y nunca llega al skill. La ruta sigue protegida: cada request se valida con la firma de Amazon y el `userId`.
5. Con la CLI: `npx vercel link`, `npx vercel env add NOMBRE production`, `npx vercel --prod`.

## Comandos de voz

Dilos completos y en una sola frase (los comandos cierran la sesión del skill):

| Quiero | Digo |
|---|---|
| Empezar a trabajar | *"Alexa, dile a mi pomodoro que empiece a enfocarme en [tarea]"* |
| Descansar | *"Alexa, dile a mi pomodoro que inicie un descanso"* |
| Ver cuánto falta | *"Alexa, pregúntale a mi pomodoro cuánto falta"* |
| Parar el bloque | *"Alexa, dile a mi pomodoro que cancele el bloque"* |
| Ver cómo voy hoy | *"Alexa, pídele a mi pomodoro que me dé el resumen de hoy"* |
| Cambiar una duración | *"Alexa, dile a mi pomodoro que configure el foco en 30 minutos"* |
| Volver a 25 / 5 / 15 | *"Alexa, dile a mi pomodoro que restablezca las duraciones"* |
| Programar el descanso con cada foco | *"Alexa, dile a mi pomodoro que active el encadenado"* |

| Intent | Qué hace |
|---|---|
| `IniciarFoco` | Sesión de foco + timer. Slot opcional `tarea`. |
| `IniciarDescanso` | Descanso corto (5) o largo (15) según el ciclo. |
| `CancelarBloque` | Cancela el timer y marca la sesión como interrumpida. |
| `ConsultarTiempo` | Dice cuánto falta. |
| `Resumen` | Completados e interrumpidos de hoy. |
| `ConfigurarDuracion` / `RestablecerDuraciones` | Duraciones por tipo de bloque. |
| `ActivarEncadenado` / `DesactivarEncadenado` | Programa el descanso junto con cada foco. |
| Integrados | Help, Cancel, Stop, Fallback, NavigateHome. |

### Descansos encadenados

Alexa no deja que un skill lance el siguiente bloque por sí solo: al vencer, un timer solo puede anunciar un texto, sonar, o (`LAUNCH_TASK`) preguntar y esperar un "sí", y eso exige estar en un programa de vista previa. Por eso, con el encadenado activo, un foco crea **dos timers** desde el inicio (foco y foco + descanso). Alexa avisa al terminar el foco ("Descansa 5 minutos") y otra vez al terminar el descanso. El descanso se registra en el historial la próxima vez que se consulta el estado, con su hora de inicio real (`reconciliar` cierra el foco, crea el descanso y sigue evaluando). Cancelar cancela ambos timers. El tipo de descanso (corto o largo) se decide al iniciar el foco.

Las duraciones por voz aplican desde el siguiente bloque. Límites: foco 5–120 min, descansos 1–60 (la Timers API admite hasta 2 h).

## Panel web

- **Login** con una contraseña y cookie firmada (HMAC) de 30 días.
- **Hoy:** anillo con cuenta regresiva en vivo, descanso programado, ciclo de 4 focos, completados, interrumpidos y minutos enfocados.
- **Esta semana:** gráfica de lunes a domingo en hora de Bogotá.
- **Historial** con edición: cambiar la tarea de un foco, marcarlo como completado o interrumpido, eliminarlo y registrar un bloque que ya hiciste (`origen: PANEL`).
- **Tu rutina diaria:** guía en 4 momentos con la frase exacta de cada paso.
- Se actualiza solo cada 30 s; diseño claro/oscuro según tu sistema y pensado primero para móvil.

Notas sobre la edición:

- Un bloque **en curso** no se edita desde el panel: tiene un timer vivo en Alexa y su token solo llega con las requests de voz. Se cancela por voz.
- Editar el historial **no recalcula** `focosEnCiclo`: ese contador es el estado vivo del ciclo de la voz, no una estadística.
- Cada Server Action vuelve a comprobar la sesión, porque se puede invocar por POST directo.

## Decisiones técnicas

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

## Modelo de datos

Base configurable (`MONGODB_DB`), dos colecciones:

- **`sesiones`**: `ownerId`, `tipo` (`FOCO` · `DESCANSO_CORTO` · `DESCANSO_LARGO`), `tarea?`, `inicio`, `finEsperado`, `fin?`, `estado` (`ACTIVA` · `COMPLETADA` · `INTERRUMPIDA`), `timerId?`, `siguiente?` (descanso ya programado), `origen` (`VOZ` · `PANEL`). Índice `{ ownerId: 1, inicio: -1 }`, creado solo.
- **`estados`**: `_id = ownerId`, `sesionActivaId?`, `focosEnCiclo` (0..4), `zonaHoraria`, `duraciones?`, `encadenar?`.

**Regla de ciclo:** un foco `COMPLETADA` suma 1 a `focosEnCiclo`; uno `INTERRUMPIDA` no suma. Con 4 focos, el siguiente descanso es largo (15 min) y el contador vuelve a 0 al completarlo.

## Estructura del proyecto

```
src/
├── app/
│   ├── page.tsx · login/        # panel y login
│   ├── acciones.ts              # Server Actions (login, edición del historial)
│   └── api/alexa/route.ts       # endpoint del skill
├── components/                  # Cuenta (anillo), gráfica, guía, iconos, logo, pie
└── lib/
    ├── tipos.ts · tiempo.ts     # dominio y "hoy"/"semana" en Bogotá
    ├── ciclo.ts                 # ciclo, duraciones y reconciliación
    ├── panel.ts · edicion.ts    # datos del panel y edición del historial
    ├── sesionPanel.ts           # cookie de sesión firmada
    ├── mongo.ts · repositorio.ts
    ├── repositories/            # SessionRepository · Mongo · InMemory
    └── alexa/                   # verificar · timers · servicio · skill
skill-package/                   # manifiesto y modelo de interacción es-MX
scripts/seed-demo.mjs            # datos de ejemplo
tests/                           # Vitest
docs/                            # logo y capturas
.github/workflows/ci.yml         # lint · tipos · pruebas · build
```

## Solución de problemas

| Síntoma | Causa probable y arreglo |
|---|---|
| *"No puedo conectarme con la Skill solicitada"* | Alexa no llega al endpoint. Revisa la URL y el **tipo de certificado**, pulsa **Save** en *Endpoint* y **Build skill**. Si usas Vercel, desactiva *Deployment Protection*. |
| *"El skill aún no está configurado"* | `ALEXA_OWNER_ID` está vacío: sácalo de los logs ([paso 4](#4-descubrir-tu-userid)) y redespliega. |
| *"Este skill es personal…"* | El `userId` no coincide con `ALEXA_OWNER_ID`. Si recreas el skill, el `userId` cambia. |
| *"No te entendí"* | Frase fuera del modelo. Dila completa y en una sola vez, sin "Alexa" en el simulador; recarga el modelo (**Save + Build**). |
| *"Algo salió mal"* | Mira los logs de `/api/alexa`. Un `Timers API respondió 404/403` suele ser el permiso de timers sin aceptar. |
| El panel redirige siempre a `/login` | Faltan `PANEL_PASSWORD` o `PANEL_SECRET` en el entorno. |
| `Request de Alexa rechazada` en los logs | Esperado cuando la petición no viene de Alexa (curl, bots). |
| `tsc` no encuentra `PageProps` / `LayoutProps` | Ejecuta antes `npx next typegen`. |
| El simulador se queda en blanco | A veces se cuelga: recarga la página de la consola y reintenta. |

## Hoja de ruta

- [x] **Fase 0:** proyecto Next.js, dependencias y decisiones de diseño.
- [x] **Fase 1 (MVP por voz):** verificación de firma, Timers API, endpoint, handlers y modelo es-MX.
- [x] **Fase 2:** panel de lectura (login, "Hoy", historial, gráfica semanal, versión móvil, guía de rutina).
- [x] **Fase 3:** edición desde el panel, más pruebas y CI con GitHub Actions.
- [x] **Fase 4:** descansos encadenados y duraciones configurables por voz.
- [x] **Rediseño:** identidad visual en azul Alexa, animaciones suaves, iconos y pie.

## Conceptos de Alexa (glosario rápido)

**Utterance**: frase del usuario · **Intent**: intención deducida · **Slot**: hueco variable (`{tarea}`) · **Invocation name**: nombre para abrir el skill · **Endpoint HTTPS**: URL que Alexa llama con el JSON del intent · **Timers API**: timers nativos que suenan aunque el skill ya haya terminado.

## Costos

Uso personal: costo cero o casi cero (Vercel Hobby, Atlas M0, skill en modo desarrollo, Echo existente). Sin cuenta de AWS.

## Licencia y marcas

[MIT](LICENSE) © 2026 Javier Montaño.

Proyecto personal independiente. *Alexa* y *Echo* son marcas de Amazon.com, Inc. y este proyecto no está afiliado ni avalado por Amazon. El anillo del logo es un dibujo propio inspirado en la voz de Alexa, no el logotipo oficial.
