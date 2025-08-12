// ===================== LECTEUR NAYZCINE – FULL JS =====================
// Tout passe par le proxy (manifest + segments + clés) via un loader Hls custom.
// Anti double-proxy (unwrap + rewrap 1 seule fois)
// Supporte :
//  - Source simple (string .m3u8/.mp4)
//  - Paire { video, audio, label } (vidéo sans audio + piste séparée)
//  - Auto-appairage vidéo + audio (index-a*.m3u8) du même dossier
//  - Menu "lecteur" avec labels
//  - Reprise de position lors du changement de lecteur
//  - PROBE côté client : n’affiche que les liens qui envoient un flux
//  - FAILOVER automatique : si la vidéo ne démarre pas / ne progresse pas, bascule sur le lien suivant
// =====================================================================

// ======= CONFIG =======
const PROXY_BASE = 'https://api.nayzcine.fr/api/proxy?url=';
const PROBE_TIMEOUT_MS = 10000;     // timeout par check de lien
const PROBE_PARALLEL   = 6;        // nb de checks en parallèle

// Failover runtime (auto-switch)
const STARTUP_TIMEOUT_MS = 10000;   // pas de démarrage -> switch
const STALL_GRACE_MS     = 10000;   // plus de progression -> switch
const MIN_PROGRESS_DELTA = 0.2;    // ~200ms de progression pour considérer "ça bouge"

// ======= SOURCES =======
const videoSources = [];
let currentSourceIndex = -1;
let triedIndices = new Set();

// ======= POPUP/PROGRESS (optionnels) =======
const popup = document.getElementById('loading-popup');
const progressFill = document.getElementById('progressFill');
let currentProgress = 0;
let progressTimer = setInterval(() => {
  if (currentProgress < 90) {
    currentProgress += 1;
    if (progressFill) progressFill.style.width = currentProgress + '%';
  }
}, 50);
function endLoading() {
  clearInterval(progressTimer);
  if (!popup || !progressFill) return;
  progressFill.style.transition = 'width 1s ease';
  void progressFill.offsetWidth;
  progressFill.style.width = '100%';
  setTimeout(() => {
    popup.style.transition = 'opacity 1s ease';
    void popup.offsetWidth;
    popup.style.opacity = '0';
    setTimeout(() => { popup.style.display = 'none'; }, 1000);
  }, 1000);
}

// ======= ÉCHEC CENTRALISÉ → RELOAD =======
function failReload(reason = '') {
  console.warn('[Nayzcine] échec, on recharge la page. Raison :', reason);
  endLoading();

  // Garde anti-boucle : max 2 reloads sur 2 minutes
  try {
    const KEY = 'nc_reload_guard';
    const now = Date.now();
    const guard = JSON.parse(sessionStorage.getItem(KEY) || '{"n":0,"t":0}');
    const within = now - (guard.t || 0) < 120000; // 2 min
    const n = within ? (guard.n || 0) + 1 : 1;
    sessionStorage.setItem(KEY, JSON.stringify({ n, t: now }));
    if (within && n > 2) {
      // on stoppe le reload pour éviter une boucle infinie
      if (typeof toast === 'function') toast('Impossible de charger la vidéo.');
      return;
    }
  } catch {}

  // Attente 10 s avant reload (tu peux réduire à 0 si tu veux immédiat)
  setTimeout(() => location.reload(), 10000);
}

// ======= SESSION =======
const rawFilmData = sessionStorage.getItem('nayzcine-current');
if (rawFilmData) {
  try {
    const film = JSON.parse(rawFilmData);
    console.log('🎬 Données film reçues :', film);

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
          if (data?.error && (
              data.error.includes('Aucune source disponible pour ce film') ||
              data.error.includes('Aucune source disponible pour cet épisode')
          )) {
            endLoading();
            location.reload();
            return;
          }

          if (!data || !Array.isArray(data.urls)) {
            endLoading();
            location.reload();
            return;
          }

          // ========= NORMALISATION DES LIENS =========
          const raw = dedupe(
            data.urls.filter(u =>
              typeof u === 'string' &&
              !u.endsWith('.html') &&
              !u.includes('voe.sx')
            )
          );
          if (!raw.length) {
            endLoading();
            location.reload();
            return;
          }

          // groupage vidéo/audio
          const groups = new Map(); // dirKey -> { videos:[], audios:[] }
          for (const u0 of raw) {
            const clean = unwrapProxy(u0);
            const key = dirKey(clean);
            if (!groups.has(key)) groups.set(key, { videos: [], audios: [] });

            if (isAudioOnlyUrl(clean)) {
              groups.get(key).audios.push(clean);
            } else if (isVideoManifest(clean) || /\.mp4(?:$|\?)/i.test(clean) || /\.m3u8(?:$|\?)/i.test(clean)) {
              groups.get(key).videos.push(clean);
            }
          }

          // Construit candidats
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
          if (!assembled.length) {
            endLoading();
            location.reload();
            return;
          }

          // ========= PROBE : ne garder que les liens qui streament =========
          const working = await filterWorkingEntries(assembled);

          if (!working.length) {
            endLoading();
            location.reload();
            return;
          }

          videoSources.length = 0;
          videoSources.push(...working);

          buildLecteurSelector();

          // Choix par défaut : favorise master.m3u8 si dispo
          let defaultIdx = 0;
          for (let i = 0; i < videoSources.length; i++) {
            const e = videoSources[i];
            const url = typeof e === 'string' ? e : e.video;
            if (/master\.m3u8/i.test(url)) { defaultIdx = i; break; }
          }

          endLoading();
          // Lancement avec watchdog (failover auto)
          playWithWatchdog(defaultIdx, 0);
        })
        .catch(err => {
          console.error('❌ API erreur :', err);
          endLoading();
          location.reload();
        });
    }
  } catch (err) {
    console.warn('⚠️ Erreur parsing film :', err);
    endLoading();
    location.reload();
  }
}

// ======= ÉLÉMENTS =======
const container      = document.querySelector('.video-container');
const video          = document.getElementById('video');
const playPauseBtn   = document.getElementById('playPause');
const timeDisplay    = document.getElementById('timeDisplay');
const progress       = document.getElementById('progress');
const progCont       = document.getElementById('progressContainer');
const fsBtn          = document.getElementById('fullscreenBtn');
const goBackBtn      = document.querySelector('.go-back');
const overlay        = document.querySelector('.pause-overlay');
const resolutionBtn  = document.getElementById('resolutionBtn');
const resolutionMenu = document.getElementById('resolutionMenu');

// ======= <audio> EXTERNE =======
const audioExt = document.createElement('audio');
audioExt.id = 'extAudio';
audioExt.preload = 'auto';
audioExt.style.display = 'none';
audioExt.crossOrigin = 'anonymous';
document.body.appendChild(audioExt);
if (video) video.crossOrigin = 'anonymous';

// ======= CANVAS =======
const canvas = document.createElement('canvas');
canvas.id = 'videoCanvas';
Object.assign(canvas.style, {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  backgroundColor: 'black',
  display: 'none',
  pointerEvents: 'auto',
  imageRendering: 'pixelated'
});
if (container && progCont) container.insertBefore(canvas, progCont);
const ctx = canvas.getContext('2d');

// ======= STYLE VIDÉO =======
if (video) {
  Object.assign(video.style, {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    backgroundColor: 'black',
    display: 'none',
    pointerEvents: 'auto'
  });
}

// ======= ÉTAT =======
let isSeeking = false;
let hideTimeout = null;
let aspectRatio = 16 / 9;
let currentResolution = '4k';
let currentBlur = 0;
let savedTime = 0;

// Watchdog / failover state
let watchdogTimer = null;
let stallTimer = null;
let playbackStarted = false;
let lastCurrentTime = 0;
let lastProgressWall = 0;
let isSwitching = false;
let sessionId = 0;

// ======= RÉSOLUTIONS / EFFETS =======
const resolutions = { '360p': 300, '480p': 400, '720p': 600, '1080p': 850, '4k': 3000 };
const effects = {
  '360p':  { pixelScale: 2,   blur: 1 },
  '480p':  { pixelScale: 1.5, blur: 1 },
  '720p':  { pixelScale: 1,   blur: 0.5 },
  '1080p': { pixelScale: 1,   blur: 0 },
  '4k':    { pixelScale: 1,   blur: 0 },
};

// ======= UTILES UI =======
function formatTime(sec) {
  const h = Math.floor(sec / 3600).toString().padStart(2, '0');
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}
function updateProgressUI(current = video.currentTime) {
  const pct = video.duration ? (current / video.duration) * 100 : 0;
  if (progress) progress.style.width = `${pct}%`;
  if (timeDisplay) timeDisplay.textContent = `${formatTime(current)} / ${formatTime(video.duration || 0)}`;
}
function showUI() { document.body.classList.remove('hide-ui'); }
function hideUI() { document.body.classList.add('hide-ui'); }
function resetHideTimer() {
  showUI();
  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(hideUI, 3000);
}
function seek(e) {
  const rect = progCont.getBoundingClientRect();
  let x = e.clientX - rect.left;
  x = Math.max(0, Math.min(x, rect.width));
  video.currentTime = (x / rect.width) * video.duration;
  updateProgressUI(video.currentTime);
}
function togglePlayPause() {
  if (video.paused) {
    video.play().catch(err => console.warn('⛔ Impossible de lancer la lecture :', err));
  } else {
    video.pause();
  }
}

// ======= Toast court (optionnel) =======
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

// ======= ANTI DOUBLE-PROXY (FRONT) =======
function isProxyUrl(u) {
  try {
    const x = new URL(u, location.origin);
    return /\/api\/proxy/i.test(x.pathname);
  } catch { return false; }
}
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
    return `${PROXY_BASE}${encodeURIComponent(real)}`;
  }
  return `${PROXY_BASE}${encodeURIComponent(u)}`;
}

// ======= HLS LOADER =======
class ProxyLoader extends Hls.DefaultConfig.loader {
  constructor(config) { super(config); }
  load(context, config, callbacks) {
    try { context.url = throughProxy(context.url); } catch (e) {}
    super.load(context, config, callbacks);
  }
}
function isM3U8(u) { return /\.m3u8(?:$|\?)/i.test(u || ''); }
function isMp4(u)  { return /\.mp4(?:$|\?)/i.test(u || ''); }
function canPlayHlsNatively() {
  return video.canPlayType('application/vnd.apple.mpegurl') === 'probably' ||
         video.canPlayType('application/vnd.apple.mpegurl') === 'maybe';
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
  const seen = new Set();
  const out = [];
  for (const u of arr) {
    const k = String(u).trim();
    if (!seen.has(k)) { seen.add(k); out.push(u); }
  }
  return out;
}
function absUrl(base, rel) {
  try { return new URL(rel, new URL(base)).toString(); }
  catch {
    try {
      const b = new URL(base);
      if (rel.startsWith('http')) return rel;
      const dir = b.pathname.slice(0, b.pathname.lastIndexOf('/') + 1);
      return `${b.origin}${rel.startsWith('/') ? '' : dir}${rel}`;
    } catch { return rel; }
  }
}

// ======= PROBES (via proxy) =======
async function fetchWithTimeout(url, opt = {}, timeoutMs = PROBE_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opt, signal: ctrl.signal });
    return r;
  } finally { clearTimeout(t); }
}
async function probeMp4(url) {
  const prox = throughProxy(url);
  try {
    const r = await fetchWithTimeout(prox, {
      method: 'GET',
      headers: { Range: 'bytes=0-1', Accept: '*/*' }
    });
    return r.ok || r.status === 206;
  } catch { return false; }
}
async function downloadManifest(url) {
  const prox = throughProxy(url);
  const r = await fetchWithTimeout(prox, {
    headers: {
      Accept: 'application/x-mpegURL,application/vnd.apple.mpegurl,*/*;q=0.8'
    }
  });
  if (!r.ok) return null;
  const txt = await r.text();
  return txt && txt.includes('#EXTM3U') ? txt : null;
}
function firstNonComment(lines, startIndex = 0) {
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && !line.startsWith('#')) return { line, idx: i };
  }
  return null;
}
async function probeHls(url) {
  const manifest = await downloadManifest(url);
  if (!manifest) return false;

  const lines = manifest.split(/\r?\n/);
  const hasMaster = lines.some(l => /^#EXT-X-STREAM-INF/i.test(l));

  if (hasMaster) {
    for (let i = 0; i < lines.length; i++) {
      if (/^#EXT-X-STREAM-INF/i.test(lines[i])) {
        const next = firstNonComment(lines, i + 1);
        if (!next) continue;
        const child = absUrl(url, next.line);
        const childManifest = await downloadManifest(child);
        if (!childManifest) continue;

        const cLines = childManifest.split(/\r?\n/);
        const seg = firstNonComment(cLines, 0);
        if (seg) {
          const segUrl = absUrl(child, seg.line);
          try {
            const rr = await fetchWithTimeout(throughProxy(segUrl), {
              method: 'GET',
              headers: { Range: 'bytes=0-1', Accept: '*/*' }
            }, Math.min(PROBE_TIMEOUT_MS, 4000));
            if (rr.ok || rr.status === 206) return true;
          } catch {}
          return true; // manifest ok → on accepte quand même
        } else {
          return true;
        }
      }
    }
    return true;
  }

  const seg = firstNonComment(lines, 0);
  if (seg) {
    const segUrl = absUrl(url, seg.line);
    try {
      const rr = await fetchWithTimeout(throughProxy(segUrl), {
        method: 'GET',
        headers: { Range: 'bytes=0-1', Accept: '*/*' }
      }, Math.min(PROBE_TIMEOUT_MS, 4000));
      if (rr.ok || rr.status === 206) return true;
    } catch {}
    return true;
  }
  return true;
}
async function probeEntry(entry) {
  let v = typeof entry === 'string' ? entry : entry.video;
  let a = typeof entry === 'object' ? entry.audio : null;

  v = unwrapProxy(v);
  if (a) a = unwrapProxy(a);

  const videoOk = isM3U8(v) ? await probeHls(v) : (isMp4(v) ? await probeMp4(v) : false);
  if (!videoOk) return null;

  if (a) {
    const audioOk = isM3U8(a) ? await probeHls(a) : (isMp4(a) ? await probeMp4(a) : false);
    if (!audioOk) {
      return unwrapProxy(v); // dégrade en vidéo seule
    }
    return { label: (entry.label || null), video: unwrapProxy(v), audio: unwrapProxy(a) };
  }
  return unwrapProxy(v);
}
async function filterWorkingEntries(entries) {
  const out = [];
  let idx = 0;
  async function worker() {
    while (true) {
      const i = idx++; if (i >= entries.length) return;
      const e = entries[i];
      try {
        const ok = await probeEntry(e);
        if (ok) out.push(ok);
      } catch {}
    }
  }
  const n = Math.min(PROBE_PARALLEL, entries.length);
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

// ======= CHARGEUR DE SOURCE =======
async function loadSource(src, startAt = 0) {
  const wasPlaying = !video.paused && !video.ended;

  if (window.hls)      { try { window.hls.destroy(); } catch(e){} window.hls = null; }
  if (window.hlsAudio) { try { window.hlsAudio.destroy(); } catch(e){} window.hlsAudio = null; }
  audioExt.pause();
  audioExt.removeAttribute('src');

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

  if (isM3U8(vUrl)) {
    if (Hls.isSupported()) {
      const hls = new Hls({ loader: ProxyLoader });
      window.hls = hls;
      hls.attachMedia(video);
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        hls.loadSource(throughProxy(vUrl));
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const seekIt = () => {
          if (!isNaN(startAt) && startAt > 0) { try { video.currentTime = startAt; } catch(e){} }
          if (wasPlaying) video.play().catch(()=>{});
        };
        if (video.readyState >= 1) seekIt(); else video.addEventListener('loadedmetadata', seekIt, { once: true });
        if (playPauseBtn) playPauseBtn.disabled = false;
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        console.error('❌ HLS video error', data);
        if (data?.fatal) {
          // on tente natif, sinon switch
          try { hls.destroy(); } catch(e){}
          if (canPlayHlsNatively()) {
            video.src = throughProxy(vUrl);
          } else {
            // switch immédiat
            tryNextSource('hls fatal');
          }
        }
      });
    } else if (canPlayHlsNatively()) {
      video.src = throughProxy(vUrl);
      if (playPauseBtn) playPauseBtn.disabled = false;
    } else {
      console.error('HLS non supporté dans ce navigateur.');
      tryNextSource('hls unsupported');
      return;
    }
  } else {
    video.src = throughProxy(vUrl);
    const onMeta = () => {
      if (!isNaN(startAt) && startAt > 0) { try { video.currentTime = startAt; } catch(e){} }
      if (wasPlaying) video.play().catch(()=>{});
      if (playPauseBtn) playPauseBtn.disabled = false;
    };
    if (video.readyState >= 1) onMeta(); else video.addEventListener('loadedmetadata', onMeta, { once: true });
  }

  if (aUrl && typeof aUrl === 'string') {
    video.muted = true;
    if (isM3U8(aUrl)) {
      if (Hls.isSupported()) {
        const hlsA = new Hls({ loader: ProxyLoader });
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

// ======= FAILOVER RUNTIME =======
function clearWatchdogs() {
  if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
  if (stallTimer)    { clearTimeout(stallTimer);    stallTimer = null; }
}
function armStartupWatchdog() {
  clearWatchdogs();
  playbackStarted = false;
  lastCurrentTime = 0;
  lastProgressWall = Date.now();
  watchdogTimer = setTimeout(() => {
    if (!playbackStarted) {
      tryNextSource('startup-timeout');
    }
  }, STARTUP_TIMEOUT_MS);
}
function armStallWatchdog() {
  if (stallTimer) clearTimeout(stallTimer);
  stallTimer = setTimeout(() => {
    const noProgressFor = Date.now() - lastProgressWall;
    if (noProgressFor >= STALL_GRACE_MS) {
      tryNextSource('stall-timeout');
    }
  }, STALL_GRACE_MS + 200);
}

function playWithWatchdog(idx, startAt = 0) {
  sessionId++;
  isSwitching = false;
  currentSourceIndex = idx;
  triedIndices.add(idx);

  // MAJ label bouton
  const btn = document.getElementById('lecteurBtn');
  if (btn) btn.textContent = `lecteur ${idx + 1}`;

  // léger offset pour éviter segment antérieur
  const resumeAt = startAt ? Math.max(0, startAt - 1) : 0;

  armStartupWatchdog();
  loadSource(videoSources[idx], resumeAt);
  toast(`Ouverture lecteur ${idx + 1}…`);
}

function tryNextSource(reason = '') {
  // Ne pas multiplier les switches
  if (isSwitching) return;

  // 🔎 On décide en regardant si la durée affichée est 0 (film non chargé)
  // 1) Vérif fiable: video.duration
  let zeroDisplay = false;
  try {
    zeroDisplay = (!video || isNaN(video.duration) || video.duration === 0);
    // 2) Vérif UI de secours: "xx:xx / 00:00" ou "xx:xx:xx / 00:00:00"
    if (!zeroDisplay && timeDisplay && typeof timeDisplay.textContent === 'string') {
      const t = timeDisplay.textContent.trim();
      // match "... / 00:00" ou "... / 00:00:00"
      if (/\/\s*0{2}:\d{2}(\:\d{2})?$/.test(t) || /\/\s*00:00(:00)?$/.test(t)) {
        // attention: si ton format c'est "00:00 / 00:00", c'est aussi non chargé
        zeroDisplay = true;
      }
      // plus simple et robuste: si ça finit par " / 00:00" ou " / 00:00:00"
      if (/\/\s*00:00(?::00)?\s*$/.test(t)) {
        zeroDisplay = true;
      }
    }
  } catch {}

  // 👉 Si la durée n'est PAS 0 (donc le média semble chargé), on ne switch pas.
  if (!zeroDisplay) {
    console.warn('tryNextSource ignoré: durée non nulle, le média semble chargé. Raison:', reason);
    return;
  }

  isSwitching = true;
  clearWatchdogs();

  // Cherche l'index suivant non encore essayé
  let next = -1;
  for (let i = 1; i <= videoSources.length; i++) {
    const cand = (currentSourceIndex + i) % videoSources.length;
    if (!triedIndices.has(cand)) { next = cand; break; }
  }

  if (next === -1) {
    // Toutes les sources ont été testées → on recharge la page
    console.warn('Aucun lecteur fonctionnel (toutes sources testées). Raison:', reason);
    // Laisse respirer l’UI 300 ms avant reload si tu veux garder une trace visuelle
    setTimeout(() => location.reload(), 300);
    return;
  }

  const keepTime = !isNaN(savedTime) ? savedTime : 0;
  toast(`Changement de lecteur (${currentSourceIndex + 1} → ${next + 1})`);
  // Petit délai pour laisser Hls nettoyer
  setTimeout(() => playWithWatchdog(next, keepTime || 0), 200);
}

// hooks vidéo pour watchdog
video.addEventListener('playing', () => {
  playbackStarted = true;
  lastCurrentTime = video.currentTime || 0;
  lastProgressWall = Date.now();
  clearTimeout(watchdogTimer);
  armStallWatchdog();
});
video.addEventListener('timeupdate', () => {
  if (!isSeeking) {
    updateProgressUI();
    savedTime = video.currentTime;
  }
  const ct = video.currentTime || 0;
  if (!playbackStarted && ct >= MIN_PROGRESS_DELTA) {
    playbackStarted = true;
    clearTimeout(watchdogTimer);
  }
  if (ct - lastCurrentTime >= MIN_PROGRESS_DELTA) {
    lastCurrentTime = ct;
    lastProgressWall = Date.now();
    armStallWatchdog();
  }
});
video.addEventListener('waiting', () => armStallWatchdog());
video.addEventListener('stalled', () => armStallWatchdog());
video.addEventListener('error', () => {
  console.warn('HTMLVideoElement error, switch.');
  tryNextSource('video-error');
});

// ======= QUALITÉ / CANVAS =======
function setQuality(label) {
  currentResolution = label;
  if (resolutionBtn) resolutionBtn.textContent = label;
  const isFullscreen = !!document.fullscreenElement;
  if (label === '4k' || isFullscreen) {
    canvas.style.display = 'none';
    video.style.display = 'block';
    video.style.filter = 'brightness(1.10) contrast(1.05) saturate(1.1)';
  } else {
    video.style.display = 'none';
    canvas.style.display = 'block';
    video.style.filter = 'none';
    const { pixelScale, blur } = effects[label];
    const baseH = resolutions[label];
    const h = Math.round(baseH / pixelScale);
    const w = Math.round(h * aspectRatio);
    canvas.width = w;
    canvas.height = h;
    currentBlur = blur;
  }
}
function render() {
  if (canvas.style.display === 'block') {
    ctx.imageSmoothingEnabled = ['1080p', '4k'].includes(currentResolution);
    canvas.style.imageRendering = ctx.imageSmoothingEnabled ? 'auto' : 'pixelated';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, canvas.width, canvas.height);
    if (currentBlur > 0) {
      ctx.filter = `blur(${currentBlur}px)`;
      ctx.drawImage(canvas, 0, 0);
      ctx.filter = 'none';
    }
    canvas.style.filter = currentResolution === '4k' ? 'saturate(1.25)' : 'none';
  }
  requestAnimationFrame(render);
}

// ======= MENU LECTEUR =======
function buildLecteurSelector() {
  const rightControls = document.querySelector('.right-controls');
  if (!rightControls || !fsBtn) return;

  const wrapper = document.createElement('div');
  wrapper.classList.add('resolution-selector', 'lecteur-selector');

  const btn = document.createElement('span');
  btn.classList.add('text-btn');
  btn.id = 'lecteurBtn';
  btn.textContent = 'lecteur 1';

  const menu = document.createElement('ul');
  menu.classList.add('resolution-menu', 'lecteur-menu');
  menu.id = 'lecteurMenu';

  videoSources.forEach((entry, idx) => {
    const li = document.createElement('li');
    const label = (entry && typeof entry === 'object' && entry.label) ? entry.label : `lecteur ${idx + 1}`;
    li.textContent = label;
    li.dataset.idx = idx;
    menu.appendChild(li);
  });

  wrapper.append(btn, menu);
  rightControls.insertBefore(wrapper, fsBtn);

  btn.addEventListener('click', e => {
    e.stopPropagation();
    menu.classList.toggle('active');
  });
  menu.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', () => menu.classList.remove('active'));

  menu.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      if (!isNaN(video.currentTime)) savedTime = video.currentTime;
      const idx = Number(li.dataset.idx);
      triedIndices = new Set([idx]); // reset le cycle de tentatives à partir du choix manuel
      playWithWatchdog(idx, savedTime || 0);
      btn.textContent = li.textContent;
      menu.classList.remove('active');
    });
  });
}

// ======= INIT & EVENTS =======
requestAnimationFrame(render);
if (playPauseBtn) playPauseBtn.disabled = true;

video.addEventListener('loadedmetadata', () => {
  aspectRatio = (video.videoWidth || 16) / (video.videoHeight || 9);
  updateProgressUI(0);
  if (overlay) overlay.style.display = video.paused ? 'block' : 'none';
  resetHideTimer();
  setQuality(currentResolution);
});
video.addEventListener('play', () => {
  if (overlay) overlay.style.display = 'none';
  if (playPauseBtn) playPauseBtn.innerHTML = '<svg class="icon"><use xlink:href="#icon-pause"/></svg>';
});
video.addEventListener('pause', () => {
  if (overlay) overlay.style.display = 'block';
  if (playPauseBtn) playPauseBtn.innerHTML = '<svg class="icon"><use xlink:href="#icon-play"/></svg>';
});

video.addEventListener('click', togglePlayPause);
canvas.addEventListener('click', togglePlayPause);
if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlayPause);

progCont.addEventListener('mousedown', e => { isSeeking = true; seek(e); });
document.addEventListener('mousemove', e => { if (isSeeking) seek(e); });
document.addEventListener('mouseup', () => { isSeeking = false; });

if (fsBtn) {
  fsBtn.addEventListener('click', () => {
    document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
  });
}
if (goBackBtn) goBackBtn.addEventListener('click', () => window.history.back());

document.addEventListener('mousemove', resetHideTimer);
document.addEventListener('touchstart', resetHideTimer);

if (resolutionBtn && resolutionMenu) {
  resolutionBtn.addEventListener('click', e => {
    e.stopPropagation();
    resolutionMenu.classList.toggle('active');
  });
  resolutionMenu.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      setQuality(li.dataset.res);
      resolutionMenu.classList.remove('active');
    });
  });
  document.addEventListener('click', () => resolutionMenu.classList.remove('active'));
}

document.addEventListener('fullscreenchange', () => {
  setQuality(currentResolution);
});
