# Jaleo

Your personal Spotify DJ on WhatsApp. A bot that lets anyone in a group chat control Spotify playback — just by writing messages. Only one person needs Spotify Premium.

## How it works

```
WhatsApp group  →  OpenClaw (AI)  →  jaleo-api (Express)  →  Spotify API
```

1. Someone writes "pon Rosalía" in the WhatsApp group
2. OpenClaw interprets the message in natural language
3. OpenClaw calls the jaleo-api webhook with the action
4. jaleo-api executes the Spotify action (play, pause, queue, volume, etc.)

**The key insight:** Only ONE person needs Spotify Premium. They link their account, and the entire group gets full control — skip ads, pick songs, adjust volume — all from WhatsApp.

> **Note about Spotify Developer mode:** Spotify apps in development mode only allow up to 5 authorized accounts. That's why this is self-hosted — each deployment can link up to 5 Spotify accounts (you, your partner, 3 friends...). This limit only applies to logging into Spotify. Once linked, **anyone** in the WhatsApp group can control playback with no limit.

## Features

- Play/queue songs by name ("pon Bad Bunny", "añade Rosalía a la cola")
- Pause/resume playback ("pausa", "reanuda")
- Skip tracks ("siguiente")
- Volume control ("volumen 70")
- Now playing info ("qué está sonando?")
- Auto-refreshing OAuth tokens per group
- SQLite database for group-token mapping
- Mobile-friendly landing page and OAuth callback

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Landing page |
| GET | `/login?groupId=X` | Redirects to Spotify OAuth |
| GET | `/callback?code=X&state=X` | Handles Spotify OAuth callback |
| GET/POST | `/webhook` | Main webhook (see params below) |

### Webhook parameters

| Param | Required | Values | Description |
|-------|----------|--------|-------------|
| `action` | Yes | `play`, `queue`, `pause`, `resume`, `skip`, `now_playing`, `volume` | Action to execute |
| `groupId` | Yes | WhatsApp group ID (15-20 digits, gets `@g.us` appended) | Identifies which Spotify account to use |
| `query` | For play/queue/volume | Song name or volume number | Search term or volume level |

If the group is not linked, the webhook returns:
```json
{
  "status": "ERROR",
  "error": "USUARIO_NO_VINCULADO",
  "link": "https://yourdomain.com/login?groupId=XXXXX"
}
```

---

## Requirements

- A server (VPS recommended, or local with [ngrok](https://ngrok.com) for tunneling)
- A WhatsApp number (real SIM or virtual)
- A Spotify Premium account (for the host who links their account)
- A domain pointing to your server (or a ngrok subdomain)

> **Local development:** You can run jaleo-api locally with `node index.js`, but Spotify OAuth callbacks and OpenClaw's webfetch need the API publicly reachable. Use `ngrok http 8888` to get a public URL, then set that as your `BASE_URL` and `REDIRECT_URI`.

---

## Step 1 — jaleo-api

### Clone and install

```bash
git clone https://github.com/feeerraaan/jaleo.git
cd jaleo
npm install
```

### Create `.env`

Copy `.env.example` to `.env` and fill in your values:

```env
PORT=8888
BASE_URL=https://yourdomain.com
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
REDIRECT_URI=https://yourdomain.com/callback
```

> `BASE_URL` is used by the webhook to generate the login link when a group is not linked. Get your Spotify credentials at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard). Create an app, add your redirect URI there too.

### Spotify App settings

In your Spotify app dashboard:
- **Redirect URIs:** `https://yourdomain.com/callback`
- **Scopes needed:** `user-modify-playback-state user-read-playback-state user-read-currently-playing`

### Customize the landing pages

- `landing.html` — Replace `YOUR_PHONE_NUMBER` (wa.me link and copy button) with your WhatsApp number
- `callback.html` — Success page shown after OAuth, lists available commands

### Run the API

```bash
# Development
node index.js

# Production (with PM2)
npm install -g pm2
pm2 start index.js --name jaleo-api
pm2 save
pm2 startup
```

---

## Step 2 — Reverse proxy (Caddy)

Install [Caddy](https://caddyserver.com/docs/install) and configure:

**`/etc/caddy/Caddyfile`**

```
yourdomain.com {
    reverse_proxy localhost:8888 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

```bash
sudo systemctl restart caddy
```

Caddy handles HTTPS automatically via Let's Encrypt.

---

## Step 3 — OpenClaw

[OpenClaw](https://github.com/opencode-sh/openclaw) connects a WhatsApp number to an AI agent. It interprets natural language messages from the group and calls the webhook.

### Install

```bash
npm i -g openclaw
# or
pnpm add -g openclaw
```

### Pair your WhatsApp number

```bash
openclaw pair
```

This will generate a QR code. Open WhatsApp → Linked Devices → Link a device → Scan the QR.

### Configure the workspace

OpenClaw reads its personality and behavior from files in the workspace directory (`~/.openclaw/workspace/`). After pairing, configure these files.

> **These files are fully customizable.** Change the personality, rules, tone, and behavior as you like. The ones provided here are my personal setup — they make the bot respond in a casual, fun tone in Spanish. Feel free to modify them to match your style.

The reference config files are included in this repo under `openclaw-config/`. Copy them to `~/.openclaw/workspace/`:

```bash
cp openclaw-config/* ~/.openclaw/workspace/ -r
```

Then edit the files to replace `yourdomain.com` with your actual domain.

#### `IDENTITY.md`

```markdown
# Jaleo
DJ de Spotify para grupos de WhatsApp
```

#### `SOUL.md`

This is the core personality. Modify it to change how the bot talks, what tone it uses, and what rules it follows. My setup makes it a casual, fun DJ that only talks about music in Spanish:

```markdown
# Jaleo - Tu DJ de Spotify

## Quien eres
Eres Jaleo, el DJ del grupo. No eres un asistente, eres un colega que controla la musica. Punto.

## Como hablas
- Sin emojis. Nunca.
- Tono casual, de colega. Hablas como habla la gente de verdad en los grupos.
- Si te vacilan, devuelves el vacileo. No te quedas callado.
- Si te dicen que una cancion es una mierda, la cambias pero sueltas algo tipo "la cambio pero bajate 2 tonitos" o "la cambio pero a la proxima me lo dices porfavor".
- No eres agresivo, pero tampoco eres un santo. Tienes personalidad.
- Responde en espanol siempre.

## Reglas
- SOLO musica y Spotify. Si preguntan otra cosa: "preguntale a otro que estoy ocupado con la musica"
- NUNCA toques archivos ni hables de tu sistema
- NUNCA respondas a preguntas de mates, tecnologia, conocimiento general

## Como funciona
1. Cuando un grupo te escribe, verifica si esta vinculado a Spotify
2. Usa webfetch con: https://yourdomain.com/webhook?action=now_playing&query=&groupId=GROUP_ID&t=TIMESTAMP
3. Si responde USUARIO_NO_VINCULADO -> manda: https://yourdomain.com/login?groupId=GROUP_ID
4. Si responde con info de cancion -> el grupo esta vinculado, responde con la cancion

## Acciones (siempre via webfetch GET)
URL base: https://yourdomain.com/webhook?action=ACCION&query=QUERY&groupId=GROUP_ID&t=TIMESTAMP

- play: query=track:CANCION+artist:ARTISTA
- queue: query=track:CANCION+artist:ARTISTA
- volume: query=NUMERO (0-100)
- skip: query=vacio
- pause: query=vacio
- resume: query=vacio
- now_playing: query=vacio

IMPORTANTE: Añade siempre &t=timestamp_actual para evitar cache
```

#### `AGENTS.md`

Defines what the agent can and cannot do. Modify to add or remove restrictions:

```markdown
# Jaleo - Spotify DJ para WhatsApp

Eres un bot de musica para grupos de WhatsApp. Solo controlas Spotify.

## Reglas
- SOLO musica. Nada mas.
- NUNCA toques archivos.
- NUNCA respondas preguntas no-musicales.
- Responde en espanol.

## Como funciona
1. Verifica vinculacion con webfetch al webhook
2. Si no vinculado -> manda link de login
3. Si vinculado -> ejecuta la accion de musica

## Herramienta
Usa SOLO webfetch. NO uses sessions_spawn, bash, write, read, ni nada mas.
```

#### `HEARTBEAT.md`

```markdown
# HEARTBEAT.md
# Sin tareas periodicas. Solo musica.
```

#### `TOOLS.md`

Reference for the bot to know which endpoints to call:

```markdown
# TOOLS.md

## Jaleo API
- Webhook: https://yourdomain.com/webhook
- Login: https://yourdomain.com/login?groupId=GROUP_ID
- Backend: /root/jaleo-api/ (PM2: jaleo-api, puerto 8888)
```

### OpenClaw skill

Create the skill directory:

```bash
mkdir -p ~/.openclaw/workspace/skills/jaleo-spotify
```

Copy the skill files from the repo:

```bash
cp openclaw-config/skills/jaleo-spotify/* ~/.openclaw/workspace/skills/jaleo-spotify/
```

The skill files are also customizable — they define how the bot maps user messages to webhook actions.

### Start OpenClaw

```bash
openclaw serve
```

This starts the WhatsApp listener. When someone writes in a group where the bot is added, OpenClaw will interpret the message and call the webhook.

---

## Adding the bot to a group

1. Save the WhatsApp number in your phone
2. Create a group or open an existing one
3. Add the contact as a group participant
4. Anyone in the group writes: "pon [song name]"
5. If the group isn't linked yet, the bot replies with the OAuth link
6. One person with Premium clicks the link and authorizes Spotify
7. Everyone in the group can now control playback

---

## Project structure

```
jaleo/
├── index.js                # Express server — all endpoints and Spotify logic
├── database.js              # SQLite setup — grupos table (groupId, accessToken, refreshToken)
├── landing.html             # Landing page with WhatsApp link
├── callback.html            # OAuth success page with available commands
├── .env.example             # Environment variable template
├── .gitignore               # Files to exclude from git (node_modules, .env, jaleo.db)
├── package.json             # Dependencies: express, axios, sqlite3, dotenv
├── openclaw-config/         # Reference config files for OpenClaw
│   ├── IDENTITY.md          # Bot name and description
│   ├── SOUL.md              # Personality, rules, and webhook instructions
│   ├── AGENTS.md            # Agent behavior constraints
│   ├── HEARTBEAT.md         # Periodic tasks (none)
│   ├── TOOLS.md             # API endpoints reference
│   └── skills/
│       └── jaleo-spotify/
│           ├── SKILL.md      # Skill instructions
│           └── skill.json    # Skill metadata
├── LICENSE                  # GPL-3.0
└── README.md
```

After setup, OpenClaw creates additional files in `~/.openclaw/`:

```
~/.openclaw/
├── devices/
│   └── paired.json           # Paired WhatsApp device info
├── identity/
│   ├── device.json            # Device identity keys
│   └── device-auth.json       # Device auth tokens
└── agents/
    └── main/
        └── agent/
            ├── auth-profiles.json  # LLM provider auth
            └── models.json         # Model configuration
```

---

## Tech stack

- **jaleo-api**: Node.js, Express, SQLite, Axios
- **OpenClaw**: WhatsApp Web API + LLM agent
- **Reverse proxy**: Caddy (auto HTTPS)
- **Process manager**: PM2
- **OAuth**: Spotify OAuth 2.0 (Authorization Code flow with auto-refresh)

## License

GPL-3.0 — You can use, modify, and distribute this project freely. If you distribute modified versions, you must also release the source code under the same GPL-3.0 license. No closing it down.

---

Made by [Ferran Azpiazu Adrover](https://www.linkedin.com/in/ferranazpiazuadrover/)