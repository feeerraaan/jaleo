# Jaleo
> **Tu DJ de Spotify en WhatsApp.** Controla la música desde cualquier grupo con mensajes de texto.
Solo **una persona** necesita Spotify Premium. El resto del grupo escribe canciones en el chat y el bot las reproduce al instante.
📖 **Documentación completa:** [docs.jaleo.azpy.es](https://docs.jaleo.azpy.es)
---
## Cómo funciona
```
WhatsApp group -> OpenClaw (AI) -> jaleo-api (Express) -> Spotify API
```
1. Alguien escribe "pon Rosalía" en el grupo de WhatsApp
2. OpenClaw interpreta el mensaje con un modelo de lenguaje
3. OpenClaw llama al webhook de jaleo-api con la acción
4. jaleo-api ejecuta la acción en Spotify (play, pause, queue, volume...)
Aunque Spotify tiene la opción de Jam, Jaleo elimina la fricción: cualquiera escribe en el grupo y ya está. No hace falta que todos tengan la aplicación instalada.
## Funcionalidades
| Acción | Ejemplo |
|--------|---------|
| Reproducir | "pon Bad Bunny", "pon Rosalía saoko" |
| Cola | "añade esta a la cola" |
| Pausar / Reanudar | "pausa", "sigue" |
| Saltar | "siguiente", "salta esta" |
| Volumen | "volumen 50", "sube el volumen" |
| Qué suena | "qué está sonando?" |
Lenguaje natural: no hace falta usar comandos exactos. El bot interpreta lo que escribes.
## Documentación
La instalación paso a paso está en **[docs.jaleo.azpy.es](https://docs.jaleo.azpy.es)** con guía completa desde cero:
1. Requisitos previos (VPS, dominio, número de WhatsApp)
2. Crear app de Spotify
3. Configurar VPS y dominio
4. Instalar jaleo-api
5. Reverse proxy con Caddy
6. Número de WhatsApp
7. Instalar OpenClaw
8. Configurar el workspace
9. Añadir el bot a un grupo
## Requisitos
- Un VPS con Ubuntu (o un servidor con Node.js 20+)
- Un dominio con DNS apuntando al servidor
- Un número de WhatsApp dedicado
- Una cuenta de Spotify Premium
- Una app de Spotify Developer (Client ID + Client Secret)
- Una API key de un proveedor de IA (OpenCode, DeepSeek, Claude...)
Puedes usar cualquier proveedor para cada servicio. Las guías incluyen recomendaciones probadas.
## API
### Endpoints
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Landing page |
| GET | `/login?groupId=X` | Inicia OAuth con Spotify |
| GET | `/callback?code=X&state=X` | Callback OAuth |
| GET/POST | `/webhook` | Webhook principal |
### Parámetros del webhook
| Parámetro | Requerido | Descripción |
|-----------|-----------|-------------|
| `action` | Sí | `play`, `queue`, `pause`, `resume`, `skip`, `now_playing`, `volume` |
| `groupId` | Sí | ID del grupo de WhatsApp |
| `query` | Para play/queue/volume | Término de búsqueda o nivel de volumen |
### Respuestas
**Grupo no vinculado:**
```json
{
  "status": "ERROR",
  "error": "USUARIO_NO_VINCULADO",
  "link": "https://tudominio.com/login?groupId=XXXXX"
}
```
**Éxito:**
```json
{
  "status": "OK",
  "track": "SAOKO"
}
```
## Tech stack
- **jaleo-api:** Node.js, Express, SQLite, Axios
- **OpenClaw:** WhatsApp + agente de IA
- **Reverse proxy:** Caddy con Let's Encrypt
- **Process manager:** PM2
- **OAuth:** Spotify OAuth 2.0 con auto-refresh
## Estructura del proyecto
```
jaleo/
├── index.js                # Servidor Express
├── database.js              # SQLite
├── landing.html             # Landing page
├── callback.html            # Página post-OAuth
├── .env.example             # Plantilla de entorno
├── openclaw-config/         # Configuración de OpenClaw
│   ├── IDENTITY.md
│   ├── SOUL.md
│   ├── AGENTS.md
│   ├── HEARTBEAT.md
│   ├── TOOLS.md
│   └── skills/jaleo-spotify/
│       ├── SKILL.md
│       └── skill.json
├── package.json
└── LICENSE
```
## Licencia
GPL-3.0 — Puedes usar, modificar y distribuir libremente. Si distribuyes versiones modificadas, debes publicar el código fuente bajo la misma licencia.
---
Hecho por [Ferran Azpiazu Adrover](https://www.linkedin.com/in/ferranazpiazuadrover/)