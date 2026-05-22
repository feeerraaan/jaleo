---
name: jaleo-spotify
description: Control Spotify playback via webhook. Use for music requests.
---

# jaleo-spotify

Usa webfetch GET:
https://yourdomain.com/webhook?action=ACCION&query=QUERY&groupId=GROUP_ID&t=TIMESTAMP

Acciones: play, queue, volume, skip, pause, resume, now_playing
Si USUARIO_NO_VINCULADO -> manda https://yourdomain.com/login?groupId=GROUP_ID