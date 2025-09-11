/* ===================== LECTEUR NAYZCINE – JS CLEAN (namespacé) =====================
   - Pas de collisions globales (tout est dans window.NC_PLAYER).
   - Popup/chargement: 10s -> 100%, reste ~99.5% tant que video.duration == 0.
   - Sources: normalisation + groupage vidéo/audio, priorité master.m3u8, menu "lecteur" manuel.
   - Proxy HLS custom pour tout (manifest/segments/keys).
   - Supabase: reprise exacte (minutes entières), tracking minute/minute (pause = pas d’envoi), RLS via JWT si dispo.
============================================================================== */
(function () {
  'use strict';

  // ========= CONFIG (scopé) =========
  const CONFIG = {
    PROXY_BASE: 'https://api.nayzcine.fr/api/proxy?url=',
    SB_URL: 'https://zkxyutfbebbrmxybkmhy.supabase.co',
    SB_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpreHl1dGZiZWJicm14eWJrbWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNDkwMTksImV4cCI6MjA2NTgyNTAxOX0.GPlNoHjfXLv7M4NOXbKH8OLVuACiCfnRXLDc6PiYVCk',
    RESOLUTIONS: { '360p': 300, '480p': 400, '720p': 600, '1080p': 850, '4k': 3000 },
    EFFECTS: {
      '360p':  { pixelScale: 2,   blur: 1   },
      '480p':  { pixelScale: 1.5, blur: 1   },
      '720p':  { pixelScale: 1,   blur: 0.5 },
      '1080p': { pixelScale: 1,   blur: 0   },
      '4k':    { pixelScale: 1,   blur: 0   },
    },
    LOAD: { TOTAL_MS: 10000, TICK_MS: 50 }
  };

  // ========= DOM refs =========
  const container      = document.querySelector('.video-container');
  const video          = document.getElementById('video');
  const playPauseBtn   = document.getElementById('playPause');
  const timeDisplay    = document.getElementById('timeDisplay');
  const progressBar    = document.getElementById('progress');
  const progCont       = document.getElementById('progressContainer');
  const fsBtn          = document.getElementById('fullscreenBtn');
  const goBackBtn      = document.querySelector('.go-back');
  const overlay        = document.querySelector('.pause-overlay');
  const resolutionBtn  = document.getElementById('resolutionBtn');
  const resolutionMenu = document.getElementById('resolutionMenu');
  const settingsBtn = document.getElementById('settingsBtn');
  let popup            = document.getElementById('loading-popup');
  let progressFill     = document.getElementById('progressFill');

  // ========= ÉTAT lecteur =========
  const state = {
    disableSeekOnce: false,
    currentResolution: '4k',
    aspectRatio: 16 / 9,
    isSeeking: false,
    hideTimeout: null,
    currentBlur: 0,
    savedTime: 0,
    currentProgressPct: 0,
    progressTimer: null,
    loadingClosed: false,
    sources: [],
    currentSourceIndex: -1,
    __resumeDone: false,
    __lastSentMinute: null,
    __minuteLoop: null,
    __seekAllowedAt: 0,
    SEEK_BLOCK_MS: 10000,
    controlsLocked: false,
    lastSeekRequest: 0,
    seekThrottleMs: 120,  
    pendingSeekSec: null,
  };

  // utilitaire pour verrouiller souris/clavier
  function lockControls(ms = 1000) {
    state.controlsLocked = true;
    setTimeout(() => { state.controlsLocked = false; }, ms);
  }

    // 🔒 Bloquer toutes les interactions utilisateur (clavier + souris)
  let unlockCooldown = false; // état global pour filtrer les faux clics

  // 🔒 Bloquer toutes les interactions utilisateur (clavier + souris + barre)
  function lockAllInteractions() {
    document.body.style.pointerEvents = 'none';
    if (progCont) progCont.style.pointerEvents = 'none';

    document.addEventListener('keydown', blockKeys, true);
    document.addEventListener('keyup', blockKeys, true);
  }

  // 🔓 Réactiver toutes les interactions
  function unlockAllInteractions() {
    document.body.style.pointerEvents = '';
    if (progCont) progCont.style.pointerEvents = '';

    document.removeEventListener('keydown', blockKeys, true);
    document.removeEventListener('keyup', blockKeys, true);

    // 🚫 Activer un cooldown pour ignorer les "faux clics" ou la souris déjà posée
    unlockCooldown = true;
    setTimeout(() => { unlockCooldown = false; }, 200);
  }

  // Fonction interne : empêche les touches
  function blockKeys(e) {
    e.stopPropagation();
    e.preventDefault();
    return false;
  }

  // ========= <audio> externe + canvas =========
  const audioExt = document.createElement('audio');
  audioExt.id = 'extAudio';
  audioExt.preload = 'auto';
  audioExt.style.display = 'none';
  audioExt.crossOrigin = 'anonymous';
  document.body.appendChild(audioExt);
  if (video) video.crossOrigin = 'anonymous';

  const canvas = document.createElement('canvas');
  canvas.id = 'videoCanvas';
  Object.assign(canvas.style, {
    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    width: '100%', height: '100%', objectFit: 'contain', backgroundColor: 'black',
    display: 'none', pointerEvents: 'auto', imageRendering: 'pixelated'
  });
  if (container && progCont) container.insertBefore(canvas, progCont);
  const ctx = canvas.getContext('2d');

  if (video) {
    Object.assign(video.style, {
      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      width: '100%', height: '100%', objectFit: 'contain', backgroundColor: 'black',
      display: 'block', pointerEvents: 'auto'
    });
  }

  // ========= Utils Supabase (RLS) =========
  function getSupabaseAccessTokenFromStorage() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
          const raw = localStorage.getItem(k);
          const obj = JSON.parse(raw || '{}');
          const token = obj?.access_token;
          if (typeof token === 'string' && token.length > 20) return token;
        }
      }
    } catch {}
    return null;
  }

  function buildSBHeaders() {
    const token = getSupabaseAccessTokenFromStorage();
    return {
      apikey: CONFIG.SB_KEY,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token || CONFIG.SB_KEY}`,
    };
  }

  function getCookie(name) {
    const cookies = document.cookie ? document.cookie.split(';') : [];
    const prefix = name + '=';
    for (let c of cookies) {
      c = c.trim();
      if (c.startsWith(prefix)) {
        const raw = c.slice(prefix.length);
        try { return decodeURIComponent(raw); } catch { return raw; }
      }
    }
    return '';
  }

  function tryGetSupabaseUidFromStorage() {
    try {
      const t = getSupabaseAccessTokenFromStorage();
      if (!t) return null;
      const parts = t.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload?.sub || null;
    } catch {}
    return null;
  }

  async function getUserId() {
    const uidFromToken = tryGetSupabaseUidFromStorage();
    if (uidFromToken) return uidFromToken;
    const cookieUid = getCookie('user_id');
    if (cookieUid) return cookieUid;
    return null;
  }

  function keyForProgress(ctx) {
    if (!ctx) return null;
    const is_movie = ctx.type === 'movie';
    return {
      is_movie,
      media_id: String(ctx.id),
      season: is_movie ? null : Number(ctx.saison || 1),
      episode: is_movie ? null : Number(ctx.episode || 1),
    };
  }
  
  async function fetchProgressRow(uid, ctx) {
    const k = keyForProgress(ctx); if (!k) return null;

    async function doFetch(params) {
      params.append('select', 'time_watched,total_duration');
      params.append('user_id', `eq.${uid}`);
      params.append('media_id', `eq.${k.media_id}`);
      params.append('is_movie', `eq.${k.is_movie}`);
      params.append('limit', '1');
      const res = await fetch(`${CONFIG.SB_URL}/rest/v1/user_progress?${params.toString()}`, { headers: buildSBHeaders() });
      if (!res.ok) return null;
      const arr = await res.json();
      return Array.isArray(arr) && arr[0] ? arr[0] : null;
    }

    if (!k.is_movie) {
      const p = new URLSearchParams();
      p.append('season', `eq.${k.season}`);
      p.append('episode', `eq.${k.episode}`);
      return await doFetch(p);
    } else {
      const pNull = new URLSearchParams(); pNull.append('season', 'is.null'); pNull.append('episode', 'is.null');
      let row = await doFetch(pNull);
      if (row) return row;
      const pZero = new URLSearchParams(); pZero.append('season', 'eq.0'); pZero.append('episode', 'eq.0');
      return await doFetch(pZero);
    }
  }

  async function setTimeWatched(uid, ctx, minuteVal) {
    const k = keyForProgress(ctx); if (!k) return;
    const base = new URLSearchParams({
      user_id: `eq.${uid}`,
      media_id: `eq.${k.media_id}`,
      is_movie: `eq.${k.is_movie}`
    });
    const body = JSON.stringify({ time_watched: Math.max(0, Math.floor(minuteVal)) });

    if (!k.is_movie) {
      base.append('season', `eq.${k.season}`);
      base.append('episode', `eq.${k.episode}`);
      await fetch(`${CONFIG.SB_URL}/rest/v1/user_progress?${base.toString()}`, {
        method: 'PATCH', headers: { ...buildSBHeaders(), 'Prefer': 'return=minimal' }, body
      }).catch(()=>{});
    } else {
      const pNull = new URLSearchParams(base); pNull.append('season','is.null'); pNull.append('episode','is.null');
      let r = null;
      try {
        r = await fetch(`${CONFIG.SB_URL}/rest/v1/user_progress?${pNull.toString()}`, {
          method: 'PATCH', headers: { ...buildSBHeaders(), 'Prefer': 'return=minimal' }, body
        });
      } catch {}
      if (!r || !r.ok) {
        const pZero = new URLSearchParams(base); pZero.append('season','eq.0'); pZero.append('episode','eq.0');
        await fetch(`${CONFIG.SB_URL}/rest/v1/user_progress?${pZero.toString()}`, {
          method: 'PATCH', headers: { ...buildSBHeaders(), 'Prefer': 'return=minimal' }, body
        }).catch(()=>{});
      }
    }
  }

  // ========= Utilitaires UI =========
  function formatTime(sec) {
    const h = Math.floor(sec / 3600).toString().padStart(2, '0');
    const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function updateProgressUI(current = video.currentTime) {
    const pct = video?.duration ? (current / video.duration) * 100 : 0;
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (timeDisplay) timeDisplay.textContent = `${formatTime(current)} / ${formatTime(video?.duration || 0)}`;
  }

  function showUI() { document.body.classList.remove('hide-ui'); }
  function hideUI() { document.body.classList.add('hide-ui'); }
  function resetHideTimer() {
    showUI();
    clearTimeout(state.hideTimeout);
    state.hideTimeout = setTimeout(hideUI, 3000);
  }

  function toast(msg) {
    try {
      let t = document.getElementById('nc-toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'nc-toast';
        Object.assign(t.style, {
          position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,.75)', color: '#fff', padding: '8px 12px', borderRadius: '6px',
          fontSize: '12px', zIndex: 9999, pointerEvents: 'none', opacity: '0', transition: 'opacity .2s'
        });
        (container || document.body).appendChild(t);
      }
      t.textContent = msg;
      t.style.opacity = '1';
      setTimeout(() => { t.style.opacity = '0'; }, 1800);
    } catch {}
  }

  function closeAllMenus() {
    document.querySelectorAll('.resolution-menu.active, .settings-submenu.active, .settings-menu.active')
      .forEach(m => m.classList.remove('active'));
  }

  // ========= Utilitaire langues =========
  function normalizeLangLabel(code) {
    if (!code) return 'Inconnu';
    const c = code.toLowerCase();
    if (['fr','fra','fre'].includes(c)) return 'Français';
    if (['en','eng'].includes(c)) return 'Anglais';
    if (['es','spa'].includes(c)) return 'Espagnol';
    return code.toUpperCase();
  }

  // ========= Barre de chargement =========
  function ensureLoadingPopup() {
    popup = document.getElementById('loading-popup');
    progressFill = document.getElementById('progressFill');
    if (popup && progressFill) return;
    popup = document.createElement('div');
    popup.id = 'loading-popup';
    Object.assign(popup.style, {
      position: 'fixed', inset: 0, background: '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, opacity: '1', transition: 'opacity 1s ease'
    });
    const box = document.createElement('div');
    box.className = 'loading-box';
    const bar = document.createElement('div');
    Object.assign(bar.style, { width: '60%', maxWidth: '560px', height: '6px', background: '#333', borderRadius: '4px', overflow: 'hidden' });
    progressFill = document.createElement('div');
    progressFill.id = 'progressFill';
    Object.assign(progressFill.style, { width: '0%', height: '100%', background: '#e50914', transition: 'width .2s linear' });
    bar.appendChild(progressFill);
    box.appendChild(bar);
    popup.appendChild(box);
    document.body.appendChild(popup);
  }

  function hasNonZeroDuration() {
    try {
      if (!video) return false;
      const d = video.duration;
      if (Number.isFinite(d)) return d > 0;
      return d !== 0;
    } catch { return false; }
  }

  function finishLoading() {
    if (!popup || !progressFill || state.loadingClosed) return;

    // Faire la barre aller à 100%
    progressFill.style.transition = 'width 1s ease';
    void progressFill.offsetWidth; // forcer un reflow
    progressFill.style.width = '100%';

    setTimeout(() => {
      // Faire disparaître le popup en fondu
      popup.style.transition = 'opacity 1s ease';
      void popup.offsetWidth;
      popup.style.opacity = '0';

      setTimeout(() => { 
        popup.style.display = 'none'; 
        state.loadingClosed = true; 
        unlockAllInteractions();   // 🔓 rend la main à l’utilisateur
      }, 1000); // attendre la fin du fondu
    }, 1000); // attendre que la barre arrive à 100%
  }

  function maybeFinishLoading() {
    if (state.loadingClosed || !popup || !progressFill) return;
    if (!hasNonZeroDuration()) return;
    if (state.currentProgressPct < 100) return;
    finishLoading();
  }

  function startLoadingBar() {
    if (!progressFill) return;
    if (state.progressTimer) clearInterval(state.progressTimer);
    const INCR = 100 / (CONFIG.LOAD.TOTAL_MS / CONFIG.LOAD.TICK_MS);
    state.progressTimer = setInterval(() => {
      if (state.loadingClosed) { clearInterval(state.progressTimer); return; }
      if (state.currentProgressPct < 100) state.currentProgressPct = Math.min(100, state.currentProgressPct + INCR);
      if (state.currentProgressPct >= 100 && !hasNonZeroDuration()) state.currentProgressPct = 99.5;
      progressFill.style.width = state.currentProgressPct + '%';
      if (hasNonZeroDuration() && state.currentProgressPct >= 100) {
        clearInterval(state.progressTimer);
        finishLoading();
      }
    }, CONFIG.LOAD.TICK_MS);
  }

  // ========= Proxy / HLS utils =========
  function isProxyUrl(u) { try { return /\/api\/proxy/i.test(new URL(u, location.origin).pathname); } catch { return false; } }
  function unwrapProxy(u) {
    try {
      let s = u;
      for (let i = 0; i < 3; i++) {
        const m = s.match(/\/api\/proxy\?url=([^&]+)/i);
        if (!m) break;
        s = decodeURIComponent(m[1]);
      }
      return s;
    } catch { return u; }
  }

  function throughProxy(u) {
    if (!u || typeof u !== 'string') return u;
    if (isProxyUrl(u)) {
      const real = unwrapProxy(u);
      return `${CONFIG.PROXY_BASE}${encodeURIComponent(real)}`;
    }
    return `${CONFIG.PROXY_BASE}${encodeURIComponent(u)}`;
  }
  
  class ProxyLoader extends (window.Hls ? Hls.DefaultConfig.loader : class {}) {
    constructor(config) { super(config); }
    load(context, config, callbacks) {
      try { context.url = throughProxy(context.url); } catch {}
      if (super.load) super.load(context, config, callbacks);
    }
  }

  function createHlsInstance() {
    return new Hls({
      loader: ProxyLoader,
      enableWorker: true,
      lowLatencyMode: false,           // VOD
      backBufferLength: 30,            // moins de mémoire / seeks plus rapides
      maxBufferLength: 30,             // ~30s de tampon
      maxBufferSize: 30 * 1000 * 1000, // 30 MB
      startFragPrefetch: true,
      fragLoadingTimeOut: 8000,
      fragLoadingMaxRetry: 1,
      manifestLoadingTimeOut: 8000,
      nudgeMaxRetry: 3,
    });
  }

  function isM3U8(u) { return /\.m3u8(?:$|\?)/i.test(u || ''); }
  function isMp4(u)  { return /\.mp4(?:$|\?)/i.test(u || ''); }
  function canPlayHlsNatively() {
    return video?.canPlayType('application/vnd.apple.mpegurl') === 'probably' ||
           video?.canPlayType('application/vnd.apple.mpegurl') === 'maybe';
  }

  function dirKey(u) {
    try {
      const url = new URL(u);
      const path = url.pathname;
      const dir = path.slice(0, path.lastIndexOf('/') + 1);
      return url.origin + dir;
    } catch { return u; }
  }

  function isAudioOnlyUrl(u) {
    if (!u) return false;
    const s = u.toLowerCase();
    return /index-a\d+\.m3u8/.test(s) || /\/audio\//.test(s) || /-a\d+\.m3u8/.test(s);
  }
  
  function isVideoManifest(u) {
    if (!u) return false;
    const s = u.toLowerCase();
    if (!/\.m3u8(?:$|\?)/.test(s)) return false;
    if (isAudioOnlyUrl(s)) return false;
    return /master\.m3u8/.test(s) || /index-v\d/.test(s) || /urlset\/master\.m3u8/.test(s) || /\/tv\/\d+\//.test(s);
  }

  function scoreVideoManifest(u) {
    const s = (u || '').toLowerCase();
    if (/master\.m3u8/.test(s)) return 3;
    if (/index-v\d/.test(s))    return 2;
    if (/urlset\/master\.m3u8/.test(s)) return 2;
    if (/\.m3u8/.test(s))       return 1;
    return 0;
  }

  function dedupe(arr) {
    const seen = new Set(); const out = [];
    for (const u of arr) { const k = String(u).trim(); if (!seen.has(k)) { seen.add(k); out.push(u); } }
    return out;
  }

  // ========= Sources (session) =========
  const rawFilmData = sessionStorage.getItem('nayzcine-current');
  let mediaCtx = null; // { id, type, saison, episode, title }
  if (rawFilmData) { try { mediaCtx = JSON.parse(rawFilmData); } catch {} }

  if (rawFilmData && mediaCtx) {
    try {
      const film = mediaCtx;
      requestAnimationFrame(() => {
        const titleDiv = document.getElementById('film-title');
        if (titleDiv) {
          let titre = film.title || film.name || '';
          if (film.type === 'tv') {
            const saison = film.saison || 1;
            const episode = film.episode || 1;
            titre += ` S${saison} E${episode}`;
          }
          titleDiv.textContent = titre;
        }
      });

      let apiUrl = '';
      if (film.type === 'movie') {
        apiUrl = `https://api.nayzcine.fr/api/sources/film/${film.id}`;
      } else if (film.type === 'tv') {
        const saison = film.saison || 1;
        const episode = film.episode || 1;
        apiUrl = `https://api.nayzcine.fr/api/sources/serie/${film.id}/${saison}/${episode}`;
      }

      if (apiUrl) {
        fetch(apiUrl)
          .then(res => res.json())
          .then(async data => {
            if (data && typeof data === 'object' && Object.keys(data).length === 1 && data.error === 'Aucune source trouvée.') {
              location.href = '/accueil/movie-indisponible/movie-indisponible.html';
              return;
            }
            if (!data || !Array.isArray(data.urls)) return;

            const raw = dedupe(
              data.urls.filter(u =>
                typeof u === 'string' &&
                !u.endsWith('.html') &&
                !u.includes('voe.sx')
              )
            );
            if (!raw.length) return;

            const groups = new Map(); // dirKey -> { videos:[], audios:[] }
            for (const u0 of raw) {
              const clean = unwrapProxy(u0);
              const key = dirKey(clean);
              if (!groups.has(key)) groups.set(key, { videos: [], audios: [] });

              if (isAudioOnlyUrl(clean)) {
                groups.get(key).audios.push(clean);
              } else if (isVideoManifest(clean) || isMp4(clean) || isM3U8(clean)) {
                groups.get(key).videos.push(clean);
              }
            }

            const assembled = [];
            for (const [, { videos, audios }] of groups.entries()) {
              videos.sort((a, b) => scoreVideoManifest(b) - scoreVideoManifest(a));
              const v = videos[0];
              if (v) {
                const a = audios[0] || null;
                if (a) assembled.push({ label: `lecteur ${assembled.length + 1}`, video: v, audio: a });
                else   assembled.push(v);
              }
            }
            if (!assembled.length) return;

            state.sources.length = 0;
            state.sources.push(...assembled);
            buildLecteurSelector();
            initSettingsBtn();

            // choix par défaut: master si dispo
            let defaultIdx = 0;
            for (let i = 0; i < state.sources.length; i++) {
              const e = state.sources[i];
              const url = typeof e === 'string' ? e : e.video;
              if (/master\.m3u8/i.test(url)) { defaultIdx = i; break; }
            }
            playNoWatchdog(defaultIdx, 0);
          })
          .catch(err => { console.error('❌ API erreur :', err); });
      }
    } catch (err) {
      console.warn('⚠️ Erreur parsing film :', err);
    }
  }

  // Helper ultra-défensif
  function hardDisableAllSubtitles(hlsOpt = null) {
    try { if (hlsOpt && typeof hlsOpt.subtitleTrack !== 'undefined') hlsOpt.subtitleTrack = -1; } catch {}
    try {
      // retire l'attribut default sur les <track>
      if (video) {
        const tracksEl = video.querySelectorAll('track');
        tracksEl.forEach(tr => tr.removeAttribute('default'));
      }
    } catch {}
    try {
      if (video && video.textTracks) {
        for (const t of video.textTracks) {
          try { t.mode = 'disabled'; } catch {}
          try { t.default = false; } catch {}
        }
      }
    } catch {}
  }

// Planifie plusieurs passes pour contrer les réactivations auto
function scheduleSubtitleOff(hlsOpt = null) {
  [0, 50, 150, 400, 1000, 2000].forEach(delay =>
    setTimeout(() => hardDisableAllSubtitles(hlsOpt), delay)
  );
}

async function loadSource(src, startAt = 0) {
  if (!video) return;
  const wasPlaying = !video.paused && !video.ended;

  // Reset ancien HLS + audio
  if (window.hls)      { try { window.hls.destroy(); } catch(e){} window.hls = null; }
  if (window.hlsAudio) { try { window.hlsAudio.destroy(); } catch(e){} window.hlsAudio = null; }
  audioExt.pause(); audioExt.removeAttribute('src');

  let vUrl, aUrl;
  if (typeof src === 'string') {
    vUrl = unwrapProxy(src);
  } else if (src && typeof src === 'object') {
    vUrl = unwrapProxy(src.video || src.src || src.url);
    aUrl = src.audio ? unwrapProxy(src.audio) : null;
  }
  if (!vUrl || typeof vUrl !== 'string') {
    console.error('Source vidéo invalide', src);
    return;
  }

  // ==== VIDEO ====
  if (isM3U8(vUrl)) {
    if (window.Hls && Hls.isSupported()) {
      const hls = createHlsInstance();
      window.hls = hls;
      hls.attachMedia(video);

      // éteindre tout de suite (et re-éteindre plus tard)
      scheduleSubtitleOff(hls);

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        scheduleSubtitleOff(hls);
        hls.loadSource(throughProxy(vUrl));
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // force OFF encore ici
        scheduleSubtitleOff(hls);

        const seekIt = () => {
          if (!isNaN(startAt) && startAt > 0) {
            try { video.currentTime = startAt; } catch(e){}
          }
          if (wasPlaying) video.play().catch(()=>{});
        };
        if (video.readyState >= 1) seekIt();
        else video.addEventListener('loadedmetadata', seekIt, { once: true });

        if (playPauseBtn) playPauseBtn.disabled = false;
      });

      // Pistes sous-titres mises à jour par Hls.js
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, data) => {
        scheduleSubtitleOff(hls);  // OFF par défaut, encore
        if (data?.subtitleTracks?.length) {
          buildSubtitlesMenu(hls, data.subtitleTracks);
        }
      });

      // Au cas où: pistes <track> natives
      video.addEventListener('loadedmetadata', () => {
        scheduleSubtitleOff(hls);
        if (video.textTracks && video.textTracks.length) {
          buildSubtitlesMenu(null, Array.from(video.textTracks));
        }
      }, { once: true });

      hls.on(Hls.Events.ERROR, (_, data) => {
        console.error('❌ HLS video error', data);
      });

    } else if (canPlayHlsNatively()) {
      video.src = throughProxy(vUrl);
      if (playPauseBtn) playPauseBtn.disabled = false;

      // OFF dès maintenant et après metadata
      scheduleSubtitleOff(null);
      const onMeta = () => {
        scheduleSubtitleOff(null);
        if (video.textTracks && video.textTracks.length) {
          buildSubtitlesMenu(null, Array.from(video.textTracks));
        }
      };
      if (video.readyState >= 1) onMeta();
      else video.addEventListener('loadedmetadata', onMeta, { once: true });

    } else {
      console.error('HLS non supporté dans ce navigateur.');
      return;
    }
  } else {
    // MP4 ou autre
    video.src = throughProxy(vUrl);
    // OFF immédiatement et après metadata
    scheduleSubtitleOff(null);

    const onMeta = () => {
      scheduleSubtitleOff(null);
      if (!isNaN(startAt) && startAt > 0) {
        try { video.currentTime = startAt; } catch(e){}
      }
      if (wasPlaying) video.play().catch(()=>{});
      if (playPauseBtn) playPauseBtn.disabled = false;

      if (video.textTracks && video.textTracks.length) {
        buildSubtitlesMenu(null, Array.from(video.textTracks));
      }
    };
    if (video.readyState >= 1) onMeta();
    else video.addEventListener('loadedmetadata', onMeta, { once: true });
  }

  // ==== AUDIO EXTERNE (inchangé) ====
  if (aUrl && typeof aUrl === 'string') {
    video.muted = true;
    if (isM3U8(aUrl)) {
      if (window.Hls && Hls.isSupported()) {
        const hlsA = createHlsInstance();
        window.hlsAudio = hlsA;
        hlsA.attachMedia(audioExt);
        hlsA.on(Hls.Events.MEDIA_ATTACHED, () => {
          hlsA.loadSource(throughProxy(aUrl));
        });
      } else if (canPlayHlsNatively()) {
        audioExt.src = throughProxy(aUrl);
      } else {
        console.warn('HLS audio externe non supporté; abandon piste audio externe.');
      }
    } else {
      audioExt.src = throughProxy(aUrl);
    }

    const syncTime = () => { try { audioExt.currentTime = video.currentTime; } catch(e){} };
    video.addEventListener('play',  () => { audioExt.play().catch(()=>{}); });
    video.addEventListener('pause', () => { audioExt.pause(); });
    video.addEventListener('seeking', syncTime);
    video.addEventListener('ratechange', () => { audioExt.playbackRate = video.playbackRate; });
    audioExt.addEventListener('loadedmetadata', syncTime);
  } else {
    video.muted = false;
  }
}


  function playNoWatchdog(idx, startAt = 0) {
    state.currentSourceIndex = idx;
    const btn = document.getElementById('lecteurBtn');
    if (btn) btn.textContent = `lecteur ${idx + 1}`;
    const resumeAt = startAt ? Math.max(0, startAt - 1) : 0;
    loadSource(state.sources[idx], resumeAt);
    toast(`Ouverture lecteur ${idx + 1}…`);
  }

  // ========= Qualité forcée 4K + filtres colorimétriques =========
  function setQuality() {
    state.currentResolution = '4k';
    if (resolutionBtn) resolutionBtn.textContent = '4k';

    // Toujours la vidéo brute (pas de canvas)
    canvas.style.display = 'none';
    video.style.display = 'block';

    // Filtres CSS principaux
    video.style.filter = `
      contrast(1.18)       /* +18 contraste */
      brightness(0.92)     /* -8 exposition */
      saturate(1.22)       /* +22 saturation */
      hue-rotate(-4deg)    /* température froide */
    `;

    // === Vibrance (≈ saturation des tons moyens) ===
    // simulée par une overlay semi-transparente
    let vibrance = document.getElementById('nc-vibrance');
    if (!vibrance) {
      vibrance = document.createElement('div');
      vibrance.id = 'nc-vibrance';
      Object.assign(vibrance.style, {
        position: 'absolute',
        top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none',
        zIndex: 9,
        background: 'rgba(40,120,255,0.1)', // léger bleu saturé
        mixBlendMode: 'overlay',
        opacity: '0.25'  // ≈ vibrance +25
      });
      container.appendChild(vibrance);
    }

    // === Ombres & Hautes lumières ===
    // simulées via un dégradé overlay
    let tones = document.getElementById('nc-tones');
    if (!tones) {
      tones = document.createElement('div');
      tones.id = 'nc-tones';
      Object.assign(tones.style, {
        position: 'absolute',
        top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none',
        zIndex: 8,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.12), rgba(255,255,255,0.15))',
        mixBlendMode: 'overlay'
      });
      container.appendChild(tones);
    }

    // === Netteté / Clarté ===
    // pas de sharpen natif → astuce via backdrop-filter (Chrome/Edge uniquement)
    video.style.backdropFilter = 'contrast(1.12)';

    // === Grain ===
    let grain = document.getElementById('nc-grain');
    if (!grain) {
      grain = document.createElement('div');
      grain.id = 'nc-grain';
      Object.assign(grain.style, {
        position: 'absolute',
        top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none',
        zIndex: 10,
        backgroundImage: 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2NkYGD4DwABAwEAf1Wn9wAAAABJRU5ErkJggg==")',
        opacity: '0.07',  // ≈ grain +7
        mixBlendMode: 'overlay'
      });
      container.appendChild(grain);
    }
  }

  // ========= Rendu (ne touche plus le canvas) =========
  function render() {
    requestAnimationFrame(render);
  }


  // ========= Menu “lecteur” =========
  function buildLecteurSelector() {
    const rightControls = document.querySelector('.right-controls');
    if (!rightControls || !fsBtn) return;

    // === Bouton lecteur (texte) ===
    const btn = document.createElement('span');
    btn.classList.add('text-btn');
    btn.id = 'lecteurBtn';
    btn.textContent = 'lecteur 1';

    const placeholder = document.getElementById('lecteurBtnPlaceholder');
    if (placeholder) placeholder.replaceWith(btn);
    else rightControls.insertBefore(btn, fsBtn);

    // === Menu sources (style paramètres) ===
    let menu = document.getElementById('sourceMenu');
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'settings-menu';
      menu.id = 'sourceMenu';
      menu.innerHTML = '<p class="settings-title">Source :</p><ul id="sourceList"></ul>';
      document.body.appendChild(menu);
    }

    const ul = menu.querySelector('#sourceList');
    ul.innerHTML = '';

    state.sources.forEach((entry, idx) => {
      const li = document.createElement('li');
      const label =
        entry && typeof entry === 'object' && entry.label
          ? entry.label
          : `lecteur ${idx + 1}`;
      li.textContent = label;
      li.dataset.idx = idx;
      if (idx === 0) li.classList.add('active'); // par défaut 1er actif

      li.addEventListener('click', () => {
        if (!isNaN(video.currentTime)) state.savedTime = video.currentTime;

        // reset ancien actif
        ul.querySelectorAll('li').forEach(el => el.classList.remove('active'));
        li.classList.add('active');

        const index = Number(li.dataset.idx);
        playNoWatchdog(index, state.savedTime || 0);
        btn.textContent = li.textContent;
        menu.classList.remove('active');
      });

      ul.appendChild(li);
    });

    // === Événements ouverture/fermeture ===
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('active');
    });

    document.addEventListener('click', () => menu.classList.remove('active'));
  }

  // ========= Init bouton paramètres =========
  function initSettingsBtn() {
    if (!settingsBtn) return;

    let menu = document.getElementById('settingsMenu');
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'settings-menu';
      menu.id = 'settingsMenu';
      menu.innerHTML = '<ul></ul>';
      document.body.appendChild(menu);
    }

    // toggle affichage
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('active');
    });

    // fermeture clic extérieur
    document.addEventListener('click', () => menu.classList.remove('active'));
  }

  function buildSubtitlesMenu(hls, tracks = []) {
    let menu = document.getElementById('settingsMenu');
    if (!menu) return;

    const ul = menu.querySelector('ul');
    if (!ul) return;

    // Effacer contenu
    ul.innerHTML = '';

    // Entrée principale
    const mainLi = document.createElement('li');
    mainLi.textContent = 'Sous-titres';
    mainLi.style.cursor = 'pointer';
    mainLi.style.fontWeight = 'bold';
    ul.appendChild(mainLi);

    mainLi.addEventListener('click', (e) => {
      e.stopPropagation();
      ul.innerHTML = '';

      // Retour
      const backLi = document.createElement('li');
      backLi.textContent = '◂ Retour';
      backLi.style.cursor = 'pointer';
      backLi.style.fontWeight = 'bold';
      ul.appendChild(backLi);
      backLi.addEventListener('click', () => {
        buildSubtitlesMenu(hls, tracks);
      });

      // Détecter piste active
      let activeLabel = 'Désactivés';
      if (hls && hls.subtitleTrack >= 0 && tracks[hls.subtitleTrack]) {
        activeLabel = normalizeLangLabel(tracks[hls.subtitleTrack].lang || tracks[hls.subtitleTrack].name);
      } else if (video.textTracks) {
        for (let t of video.textTracks) {
          if (t.mode === 'showing') {
            activeLabel = normalizeLangLabel(t.language || t.label);
            break;
          }
        }
      }

      // Désactivés
      const liNone = document.createElement('li');
      liNone.textContent = 'Désactivés';
      liNone.style.cursor = 'pointer';
      if (activeLabel === 'Désactivés') {
        liNone.style.color = '#ff6b6b'; // rouge si actif
        liNone.style.fontWeight = 'bold';
      }
      liNone.addEventListener('click', () => {
        if (hls) hls.subtitleTrack = -1;
        if (video.textTracks) for (let t of video.textTracks) t.mode = 'disabled';
        toast('Sous-titres désactivés');
        buildSubtitlesMenu(hls, tracks); // refresh
      });
      ul.appendChild(liNone);

      let added = false;

      // Pistes via Hls.js
      if (hls && tracks.length) {
        tracks.forEach((track, i) => {
          const li = document.createElement('li');
          li.textContent = normalizeLangLabel(track.lang || track.name || `Piste ${i+1}`);
          li.style.cursor = 'pointer';

          // Si c’est la piste active → rouge
          if (activeLabel === li.textContent) {
            li.style.color = '#ff6b6b';
            li.style.fontWeight = 'bold';
          }

          li.addEventListener('click', () => {
            hls.subtitleTrack = i;
            toast(`Sous-titres : ${li.textContent}`);
            buildSubtitlesMenu(hls, tracks); // refresh
          });

          ul.appendChild(li);
          added = true;
        });
      }

      // Pistes natives <track>
      if (!hls && video.textTracks && video.textTracks.length) {
        Array.from(video.textTracks).forEach((track, i) => {
          const li = document.createElement('li');
          li.textContent = normalizeLangLabel(track.language || track.label || `Piste ${i+1}`);
          li.style.cursor = 'pointer';

          // Si actif → rouge
          if (activeLabel === li.textContent) {
            li.style.color = '#ff6b6b';
            li.style.fontWeight = 'bold';
          }

          li.addEventListener('click', () => {
            for (let t of video.textTracks) t.mode = 'disabled';
            track.mode = 'showing';
            toast(`Sous-titres : ${li.textContent}`);
            buildSubtitlesMenu(hls, tracks); // refresh
          });

          ul.appendChild(li);
          added = true;
        });
      }

      if (!added) {
        const liNone2 = document.createElement('li');
        liNone2.textContent = '(aucun disponible)';
        liNone2.style.opacity = '0.6';
        ul.appendChild(liNone2);
      }
    });
  }

  // ========= Reprise & Tracking =========
  let progRAF = null;
  function startProgRAF() {
    stopProgRAF();
    const step = () => {
      if (video && !state.isSeeking) updateProgressUI(video.currentTime);
      progRAF = requestAnimationFrame(step);
    };
    progRAF = requestAnimationFrame(step);
  }
  function stopProgRAF() { if (progRAF) { cancelAnimationFrame(progRAF); progRAF = null; } }

  let __forceResumeTimer = null;
  function forceSeekUntilLocked(targetSec) {
    clearInterval(__forceResumeTimer);
    let tries = 0;
    __forceResumeTimer = setInterval(() => {
      tries++;
      const dur = video.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;
      if (Math.abs((video.currentTime || 0) - targetSec) > 0.5) {
        try { video.currentTime = targetSec; } catch {}
      } else {
        clearInterval(__forceResumeTimer);
      }
      if (tries >= 100) clearInterval(__forceResumeTimer);
    }, 50);
  }

  function clampResumeSeconds(dur, seconds) {
    if (!Number.isFinite(dur) || dur <= 0) return Math.max(0, seconds);
    const maxSafe = Math.max(0, dur - 15);
    return Math.max(0, Math.min(seconds, maxSafe));
  }

  async function resumeExactFromSupabase() {
    const uid = await getUserId();
    if (!uid || !mediaCtx) return;

    const row = await fetchProgressRow(uid, mediaCtx);
    if (!row) { 
      state.__resumeDone = true; 
      state.__lastSentMinute = 0; 
      state.__seekAllowedAt = Date.now() + state.SEEK_BLOCK_MS; 
      return; 
    }

    const watchedMin = Math.max(0, Math.floor(Number(row.time_watched) || 0));
    if (watchedMin === 0) {
      state.__resumeDone = true;
      state.__lastSentMinute = 0;
      state.__seekAllowedAt = Date.now() + state.SEEK_BLOCK_MS;
      return;
    }

    const wantSec = watchedMin * 60;
    const doSeek = () => {
      const safeSec = clampResumeSeconds(video.duration, wantSec);
      try { video.currentTime = safeSec; } catch {}
      forceSeekUntilLocked(safeSec);
      updateProgressUI(video.currentTime);
      state.__seekAllowedAt = Date.now() + state.SEEK_BLOCK_MS;
      state.__lastSentMinute = watchedMin;
      state.__resumeDone = true;
      toast(`Reprise à ${watchedMin} min`);
      lockControls(); // 🔒 blocage 1s
    };

    if (Number.isFinite(video.duration) && video.duration > 0) doSeek();
    else video.addEventListener('loadedmetadata', doSeek, { once: true });
  }

  async function maybePushMinute() {
    if (!video || video.paused || video.ended) return;
    const uid = await getUserId();
    if (!uid || !mediaCtx) return;

    const curMin = Math.max(0, Math.floor((Number.isFinite(video.currentTime) ? video.currentTime : 0) / 60));
    if (state.__lastSentMinute === null) state.__lastSentMinute = 0;
    if (curMin > state.__lastSentMinute) {
      await setTimeWatched(uid, mediaCtx, curMin);
      state.__lastSentMinute = curMin;
    }
  }

  function startMinuteLoop() { stopMinuteLoop(); state.__minuteLoop = setInterval(maybePushMinute, 1000); }
  function stopMinuteLoop()  { if (state.__minuteLoop) clearInterval(state.__minuteLoop); state.__minuteLoop = null; }

  // ========= Events init =========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { 
      ensureLoadingPopup(); 
      startLoadingBar(); 
      lockAllInteractions();   // 🔒 bloque dès le départ
    });
  } else { 
    ensureLoadingPopup(); 
    startLoadingBar(); 
    lockAllInteractions();     // 🔒 bloque aussi si déjà chargé
  }

  requestAnimationFrame(render);
  if (playPauseBtn) playPauseBtn.disabled = true;

  if (video) {
    video.addEventListener('loadedmetadata', async () => {
      // sous-titres OFF coûte que coûte
      hardDisableAllSubtitles(window.hls || null);
      scheduleSubtitleOff(window.hls || null);

      state.aspectRatio = (video.videoWidth || 16) / (video.videoHeight || 9);
      updateProgressUI(0);
      if (overlay) overlay.style.display = video.paused ? 'block' : 'none';
      resetHideTimer();
      setQuality(state.currentResolution);
      maybeFinishLoading();
      try { await resumeExactFromSupabase(); } catch {}
    });
    video.addEventListener('durationchange', () => { maybeFinishLoading(); });

    video.addEventListener('play', () => {
      if (overlay) overlay.style.display = 'none';
      if (playPauseBtn) playPauseBtn.innerHTML = '<svg class="icon"><use xlink:href="#icon-pause"/></svg>';
      startProgRAF();
      if (!state.__resumeDone && Number.isFinite(video.duration)) { resumeExactFromSupabase().catch(()=>{}); }
      startMinuteLoop();
    });
    video.addEventListener('pause', () => {
      if (overlay) overlay.style.display = 'block';
      if (playPauseBtn) playPauseBtn.innerHTML = '<svg class="icon"><use xlink:href="#icon-play"/></svg>';
      stopProgRAF();
      stopMinuteLoop();
    });
    video.addEventListener('ended', async () => {
      stopProgRAF(); stopMinuteLoop();
      updateProgressUI(video.duration || video.currentTime || 0);
      const uid = await getUserId();
      if (uid && mediaCtx && Number.isFinite(video.duration)) {
        const endMin = Math.max(0, Math.floor(video.duration / 60));
        if (endMin > (state.__lastSentMinute ?? -1)) {
          try { await setTimeWatched(uid, mediaCtx, endMin); state.__lastSentMinute = endMin; } catch {}
        }
      }
    });

    function commitSeek(sec) {
      if (!Number.isFinite(sec)) return;

      // Stopper HLS le temps de repositionner, pour forcer un nouveau plan de fetch
      if (window.hls && typeof window.hls.stopLoad === 'function') {
        try { window.hls.stopLoad(); } catch {}
      }

      try {
        if ('fastSeek' in video && typeof video.fastSeek === 'function') {
          video.fastSeek(sec);
        } else {
          video.currentTime = sec;
        }
      } catch {}

      // Redémarrer HLS côté réseau sur la nouvelle position
      if (window.hls && typeof window.hls.startLoad === 'function') {
        try { window.hls.startLoad(sec + 0.001); } catch {}
      }

      updateProgressUI(video.currentTime);
    }

    let seekDebounce = null;
    function scheduleSeekTo(sec) {
      if (!Number.isFinite(sec)) return;
      state.pendingSeekSec = sec;

      // coalescing des seeks rapides (dernier clic gagne)
      if (seekDebounce) clearTimeout(seekDebounce);

      const now = performance.now();
      const left = Math.max(0, state.seekThrottleMs - (now - state.lastSeekRequest));

      seekDebounce = setTimeout(() => {
        seekDebounce = null;
        state.lastSeekRequest = performance.now();
        commitSeek(state.pendingSeekSec);
      }, left);
    }

    // Interactions
    function seek(e) {
      if (!progCont || !video) return;

      // 🚫 Bloquer si le lecteur est encore en chargement (popup pas finie)
      if (!state.loadingClosed) return;

      // 🚫 Bloquer si on est encore dans le cooldown après unlock
      if (unlockCooldown) return;

      // 🚫 Bloquer si ce n’est pas un vrai clic souris ou tactile
      if (!(e.type === "mousedown" || e.type === "touchstart" || e.buttons === 1)) {
        return; // On ignore les mousemove tout seul
      }

      const rect = progCont.getBoundingClientRect();

      // Support souris + tactile
      let clientX = e.clientX;
      if (!clientX && e.touches && e.touches[0]) {
        clientX = e.touches[0].clientX;
      }
      if (!clientX) return;

      // Position cliquée dans la barre
      let x = clientX - rect.left;
      x = Math.max(0, Math.min(x, rect.width));

      // Durée totale
      const dur = Number.isFinite(video.duration) ? video.duration : 0;
      if (dur <= 0) return;

      // Temps visé
      const sec = (x / rect.width) * dur;

      // Mise à jour immédiate de l’UI
      updateProgressUI(sec);

      // Seek réel (Hls ou natif)
      scheduleSeekTo(sec);
    }

    function togglePlayPause() {
      if (video.paused) video.play().catch(err => console.warn('⛔ play() impossible :', err));
      else video.pause();
    }

    video.addEventListener('click', togglePlayPause);
    canvas.addEventListener('click', togglePlayPause);
    if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlayPause);

    if (progCont) {
      // Clic ou touche sur la barre
      progCont.addEventListener('mousedown', e => {
        state.isSeeking = true;
        seek(e); // vrai clic → seek
      });
      progCont.addEventListener('touchstart', e => {
        state.isSeeking = true;
        seek(e);
      });

      // Déplacement uniquement si clic/touch en cours
      document.addEventListener('mousemove', e => {
        if (state.isSeeking && e.buttons === 1) seek(e);
      });
      document.addEventListener('touchmove', e => {
        if (state.isSeeking) seek(e);
      });

      // Relâchement → fin du seek
      document.addEventListener('mouseup',   () => { state.isSeeking = false; });
      document.addEventListener('touchend',  () => { state.isSeeking = false; });
    }

    // Événement interne du player → synchro UI quand on seek
    video.addEventListener('seeking', () => {
      state.isSeeking = true;
      updateProgressUI(video.currentTime);
    });

    video.addEventListener('seeked', () => {
      state.isSeeking = false;
      updateProgressUI(video.currentTime);

      // Si Hls.js est utilisé, assure-toi qu'il recharge bien à la nouvelle position
      if (!window.hls) return;
      try {
        const t = Number.isFinite(video.currentTime) ? video.currentTime : 0;
        const buf = video.buffered;
        let inBuf = false;

        for (let i = 0; i < buf.length; i++) {
          if (t >= buf.start(i) - 0.3 && t <= buf.end(i) + 0.01) { // petite tolérance
            inBuf = true;
            break;
          }
        }

        if (!inBuf && typeof window.hls.startLoad === 'function') {
          window.hls.startLoad(t + 0.001);
        }
      } catch {}
    });

    video.addEventListener('timeupdate', () => { if (!progRAF && !state.isSeeking) updateProgressUI(video.currentTime); });
  }

  // FS + retour
  if (fsBtn) {
    fsBtn.addEventListener('click', () => {
      document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    });
  }
  
  if (goBackBtn) goBackBtn.addEventListener('click', () => window.history.back());

  // Masquage auto UI
  document.addEventListener('mousemove', resetHideTimer);
  document.addEventListener('touchstart', resetHideTimer);

  // Menu résolution
  if (resolutionBtn && resolutionMenu) {
    resolutionBtn.addEventListener('click', e => { e.stopPropagation(); resolutionMenu.classList.toggle('active'); });
    resolutionMenu.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => { setQuality(li.dataset.res); resolutionMenu.classList.remove('active'); });
    });
    document.addEventListener('click', () => resolutionMenu.classList.remove('active'));
  }
  document.addEventListener('fullscreenchange', () => { setQuality(state.currentResolution); });
  
  // Raccourcis clavier
  document.addEventListener('keydown', (e) => {
    if (state.controlsLocked) { e.preventDefault(); return; } // ⛔ blocage si controlsLocked
    if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

    // barre d'espace
    if (e.key === ' ' || e.code === 'Space' || e.code === 'Spacebar') {
      e.preventDefault();
      if (video.paused) video.play().catch(()=>{});
      else video.pause();
      return;
    }

    // flèche droite
    if (e.code === 'ArrowRight') {
      if (video && Number.isFinite(video.duration)) {
        video.currentTime = Math.min(video.duration, video.currentTime + 30);
      }
      return;
    }

    // flèche gauche
    if (e.code === 'ArrowLeft') {
      if (video) video.currentTime = Math.max(0, video.currentTime - 30);
      return;
    }

    // touche "F"
    if (e.key.toLowerCase() === 'f') {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(()=>{});
      } else {
        document.documentElement.requestFullscreen().catch(()=>{});
      }
      return;
    }
  });

  // Nettoyage
  window.addEventListener('beforeunload', () => { stopMinuteLoop(); });

  // Expose quelques hooks si besoin (debug)
  window.NC_PLAYER = {
    playNoWatchdog,
    loadSource,
    state
  };
})();
