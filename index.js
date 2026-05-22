require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const db = require('./database');
const app = express();
app.use(express.json());

// --- 1. LANDING PAGE ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'landing.html'));
});

// --- 2. NORMALIZE GROUP ID ---
function normalizeGroupId(id) {
    if (!id) return id;
    if (/^\d{15,20}$/.test(id)) {
        return id + '@g.us';
    }
    return id;
}

// --- 3. GESTIÓN DE TOKENS (Auto-Refresco) ---
async function getValidToken(groupId) {
    const normalId = normalizeGroupId(groupId);
    
    return new Promise((resolve) => {
        db.get("SELECT * FROM grupos WHERE groupId = ?", [normalId], async (err, row) => {
            if (!row) {
                console.log(`[TOKEN] No token found for ${normalId} (original: ${groupId})`);
                return resolve(null);
            }
            
            try {
                await axios.get('https://api.spotify.com/v1/me', { 
                    headers: { 'Authorization': `Bearer ${row.accessToken}` } 
                });
                console.log(`[TOKEN] Valid for ${row.groupId}`);
                resolve(row.accessToken);
            } catch (e) {
                if (e.response?.status === 401 && row.refreshToken) {
                    try {
                        const resp = await axios.post('https://accounts.spotify.com/api/token', new URLSearchParams({
                            grant_type: 'refresh_token', 
                            refresh_token: row.refreshToken
                        }), {
                            headers: { 
                                'Authorization': 'Basic ' + Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64'),
                                'Content-Type': 'application/x-www-form-urlencoded'
                            }
                        });
                        const newToken = resp.data.access_token;
                        db.run("UPDATE grupos SET accessToken = ? WHERE groupId = ?", [newToken, row.groupId]);
                        console.log(`[TOKEN] Refreshed for ${row.groupId}`);
                        resolve(newToken);
                    } catch (refreshErr) { 
                        console.error(`[TOKEN] Refresh failed for ${row.groupId}:`, refreshErr.response?.data?.error || refreshErr.message);
                        resolve(null); 
                    }
                } else {
                    console.error(`[TOKEN] Check failed for ${row.groupId}:`, e.response?.status || e.message);
                    resolve(null);
                }
            }
        });
    });
}

// --- 4. ENDPOINT DE LOGIN ---
app.get('/login', (req, res) => {
    const groupId = normalizeGroupId(req.query.groupId);
    const authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
        response_type: 'code', 
        client_id: process.env.SPOTIFY_CLIENT_ID,
        scope: 'user-modify-playback-state user-read-playback-state user-read-currently-playing',
        redirect_uri: process.env.REDIRECT_URI, 
        state: groupId
    });
    console.log(`[LOGIN] Redirecting to Spotify auth for groupId=${groupId}`);
    res.redirect(authUrl);
});

// --- 5. CALLBACK DE SPOTIFY ---
app.get('/callback', async (req, res) => {
    const { code, state: groupId } = req.query;
    const normalId = normalizeGroupId(groupId);
    
    console.log(`[CALLBACK] code=${code ? code.substring(0,10)+'...' : 'null'}, groupId=${normalId} (raw: ${groupId})`);
    
    if (!code) {
        return res.status(400).send('Missing authorization code.');
    }
    
    try {
        const resp = await axios.post('https://accounts.spotify.com/api/token', new URLSearchParams({
            code, redirect_uri: process.env.REDIRECT_URI, grant_type: 'authorization_code'
        }), {
            headers: { 
                'Authorization': 'Basic ' + Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        console.log(`[CALLBACK] Token received, saving for groupId=${normalId}`);
        
        db.run("INSERT OR REPLACE INTO grupos (groupId, accessToken, refreshToken) VALUES (?, ?, ?)", 
               [normalId, resp.data.access_token, resp.data.refresh_token], function(err) {
            if (err) console.error(`[CALLBACK] DB error: ${err.message}`);
            else console.log(`[CALLBACK] Saved successfully, changes=${this.changes}`);
        });
        
        res.sendFile(path.join(__dirname, 'callback.html'));
    } catch (e) { 
        console.error(`[CALLBACK] Error: ${e.response?.status} ${JSON.stringify(e.response?.data)}`);
        res.status(500).send(`Error linking account: ${e.response?.data?.error_description || e.response?.data?.error || e.message}`); 
    }
});

// --- 6. EL WEBHOOK MAESTRO (GET + POST) ---
async function handleWebhook(req, res) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    
    let { action, query, groupId } = req.body || {};
    if (req.query && req.query.action) {
        action = action || req.query.action;
        query = query || req.query.query;
        groupId = groupId || req.query.groupId;
    }
    
    console.log(`[WEBHOOK] action=${action}, query=${query}, groupId=${groupId}`);
    const fullBody = JSON.stringify(req.body || req.query || {});

    if (action === 'volume' && (!query || query === "undefined")) {
        const matches = fullBody.match(/\b(?!(34))\d{1,3}\b/g);
        if (matches) query = matches[matches.length - 1]; 
    }

    const token = await getValidToken(groupId);
    
    if (!token) {
        console.log(`[WEBHOOK] Chat not linked: ${groupId}`);
        return res.status(200).send({ 
            status: "ERROR", 
            error: "USUARIO_NO_VINCULADO", 
            link: `${process.env.BASE_URL}/login?groupId=${groupId}` 
        });
    }

    const h = { 'Authorization': `Bearer ${token}` };

    try {
        let responseData = { status: "OK" };

        if (action === 'play' || action === 'queue') {
            let q = query || "";
            q = q.replace(/ de /gi, ' artist:');
            if (!q.includes('track:') && q !== "") q = 'track:' + q;

            const s = await axios.get('https://api.spotify.com/v1/search', { 
                params: { q: q, type: 'track', limit: 1 }, headers: h 
            });
            const t = s.data.tracks.items[0];
            if (t) {
                if (action === 'play') {
                    await axios.put('https://api.spotify.com/v1/me/player/play', { uris: [t.uri] }, { headers: h });
                    console.log(`[WEBHOOK] Now playing: ${t.name}`);
                } else {
                    await axios.post(`https://api.spotify.com/v1/me/player/queue?uri=${t.uri}`, {}, { headers: h });
                    console.log(`[WEBHOOK] Queued: ${t.name}`);
                }
                responseData.track = t.name;
            }
        } 
        else if (action === 'volume') {
            await axios.put(`https://api.spotify.com/v1/me/player/volume?volume_percent=${query}`, {}, { headers: h });
            console.log(`[WEBHOOK] Volume: ${query}%`);
            responseData.level = query;
        } 
        else if (action === 'pause') {
            await axios.put('https://api.spotify.com/v1/me/player/pause', {}, { headers: h });
        } 
        else if (action === 'resume') {
            await axios.put('https://api.spotify.com/v1/me/player/play', {}, { headers: h });
        } 
        else if (action === 'next' || action === 'skip') {
            await axios.post('https://api.spotify.com/v1/me/player/next', {}, { headers: h });
            console.log('[WEBHOOK] Skipped track');
        } 
        else if (action === 'now_playing') {
            const np = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', { headers: h });
            if (np.data && np.data.item) {
                const info = `${np.data.item.name} by ${np.data.item.artists[0].name}`;
                console.log(`[WEBHOOK] Now playing info: ${info}`);
                responseData.info = info;
            } else {
                responseData.info = "nothing playing";
            }
        }
        
        res.status(200).send(responseData);
    } catch (e) {
        console.error("[WEBHOOK] API Error:", e.response?.data || e.message);
        res.status(200).send({ error: "Spotify API error (active device?)" });
    }
}

app.post('/webhook', handleWebhook);
app.get('/webhook', handleWebhook);

// --- 7. START ---
const PORT = process.env.PORT || 8888;
app.listen(PORT, () => console.log(`Jaleo API Online (Port ${PORT})`));