// ======= CONFIGURATION DES LIENS =======
const videoSources = [];

const popup = document.getElementById('loading-popup');
const progressFill = document.getElementById('progressFill');

// Simule une barre qui avance doucement (max 90%)
let currentProgress = 0;
let progressTimer = setInterval(() => {
  if (currentProgress < 90) {
    currentProgress += 1;
    progressFill.style.width = currentProgress + '%';
  }
}, 50);

// Fonction pour finir proprement le chargement
function endLoading() {
  clearInterval(progressTimer);
  progressFill.style.transition = 'width 1s ease';
  
  // Forcer le reflow pour que la transition soit bien prise en compte
  void progressFill.offsetWidth;

  progressFill.style.width = '100%';

  setTimeout(() => {
    popup.style.transition = 'opacity 1s ease';

    // Forcer encore une fois pour éviter les skips visuels
    void popup.offsetWidth;

    popup.style.opacity = '0';
    setTimeout(() => {
      popup.style.display = 'none';
    }, 1000);
  }, 1000); // attend la fin de la barre avant le fade
}

// ======= RÉCUPÉRATION DES DONNÉES SESSION =======
const rawFilmData = sessionStorage.getItem('nayzcine-current');
if (rawFilmData) {
  try {
    const film = JSON.parse(rawFilmData);
    console.log('🎬 Données film reçues :', film);

    // 🎬 Affichage du titre formaté
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
        .then(data => {
          endLoading();

          if (
            data?.error &&
            (
              data.error.includes('Aucune source disponible pour ce film') ||
              data.error.includes('Aucune source disponible pour cet épisode')
            )
          ) {
            window.location.href = '/accueil/movie-indisponible/movie-indisponible.html';
            return;
          }

          if (!data || !Array.isArray(data.urls)) {
            window.location.href = '/accueil/movie-indisponible/movie-indisponible.html';
            return;
          }

          const validUrls = data.urls.filter(url =>
            typeof url === 'string' &&
            !url.endsWith('.html') &&
            !url.includes('voe.sx')
          );

          if (!validUrls.length) {
            window.location.href = '/accueil/movie-indisponible/movie-indisponible.html';
            return;
          }

          videoSources.push(...validUrls);
          buildLecteurSelector();
          loadSource(videoSources[0]);
        })
        .catch(err => {
          console.error('❌ API erreur :', err);
          endLoading();
          window.location.href = '/accueil/movie-indisponible/movie-indisponible.html';
        });
    }
  } catch (err) {
    console.warn('⚠️ Erreur parsing film :', err);
    endLoading();
    window.location.href = '/accueil/movie-indisponible/movie-indisponible.html';
  }
}

// ======= SÉLECTION DES ÉLÉMENTS =======
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

// ======= CRÉATION DU CANVAS =======
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
container.insertBefore(canvas, progCont);
const ctx = canvas.getContext('2d');

// ======= STYLE VIDÉO ORIGINAL =======
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

// ======= ÉTAT =======
let isSeeking = false;
let hideTimeout = null;
let aspectRatio = 16 / 9;
let currentResolution = '4k';
let currentBlur = 0;
let savedTime = 0;

// ======= RÉSOLUTIONS FIXES =======
const resolutions = {
  '360p': 300,
  '480p': 400,
  '720p': 600,
  '1080p': 850,
  '4k': 3000,
};

// ======= EFFETS PAR RÉSOLUTION =======
const effects = {
  '360p':  { pixelScale: 2,   blur: 1 },
  '480p':  { pixelScale: 1.5, blur: 1 },
  '720p':  { pixelScale: 1,   blur: 0.5 },
  '1080p': { pixelScale: 1,   blur: 0 },
  '4k':    { pixelScale: 1,   blur: 0 },
};

// ======= UTILES =======
function formatTime(sec) {
  const h = Math.floor(sec / 3600).toString().padStart(2, '0');
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function updateProgressUI(current = video.currentTime) {
  const pct = video.duration ? (current / video.duration) * 100 : 0;
  progress.style.width = `${pct}%`;
  timeDisplay.textContent = `${formatTime(current)} / ${formatTime(video.duration || 0)}`;
}

function togglePlayPause() {
  video.paused ? video.play() : video.pause();
}

function showUI() {
  document.body.classList.remove('hide-ui');
}
function hideUI() {
  document.body.classList.add('hide-ui');
}
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

function loadSource(url, startTime = 0) {
  if (window.hls) {
    window.hls.destroy();
    window.hls = null;
  }

  video.pause();
  video.removeAttribute("src");
  video.innerHTML = '';
  video.load();

  const isM3U8 = url.endsWith(".m3u8") || url.includes("master.m3u8");
  const isDirectVideo = url.match(/\.(mp4|webm|ogg)(\?|$)/i);

  if (isM3U8) {
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.addEventListener('loadedmetadata', () => {
          video.currentTime = startTime;
          video.play().catch(err => {
            console.warn('⛔ Lecture impossible :', err);
          });
        }, { once: true });
      });
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.error('❌ HLS fatal error, impossible de lire la vidéo.');
        }
      });
      window.hls = hls;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.addEventListener('loadedmetadata', () => {
        video.currentTime = startTime;
        video.play().catch(err => {
          console.warn('⛔ Lecture impossible :', err);
        });
      }, { once: true });
    }
  } else if (isDirectVideo) {
    video.src = url;
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = startTime;
      video.play().catch(err => {
        console.warn('⛔ Lecture impossible :', err);
      });
    }, { once: true });
  } else {
    console.warn('❌ Format vidéo non supporté :', url);
  }
}

function setQuality(label) {
  currentResolution = label;
  resolutionBtn.textContent = label;

  const isFullscreen = !!document.fullscreenElement;

  // 👉 Si 4k OU plein écran : on affiche directement la vidéo, pas le canvas
  if (label === '4k' || isFullscreen) {
    canvas.style.display = 'none';
    video.style.display = 'block';

    // 🌟 Ajout du filtre spécial pour 4k
    video.style.filter = 'brightness(1.10) contrast(1.05) saturate(1.1)';
  } else {
    video.style.display = 'none';
    canvas.style.display = 'block';

    // 🔄 On retire tout filtre
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

    canvas.style.filter = currentResolution === '4k' ? "saturate(1.25)" : "none";
  }
  requestAnimationFrame(render);
}

function buildLecteurSelector() {
  const rightControls = document.querySelector('.right-controls');
  const wrapper = document.createElement('div');
  wrapper.classList.add('resolution-selector', 'lecteur-selector');

  const btn = document.createElement('span');
  btn.classList.add('text-btn');
  btn.id = 'lecteurBtn';
  btn.textContent = 'lecteur 1';

  const menu = document.createElement('ul');
  menu.classList.add('resolution-menu', 'lecteur-menu');
  menu.id = 'lecteurMenu';

  videoSources.forEach((url, idx) => {
    const li = document.createElement('li');
    li.textContent = `lecteur ${idx + 1}`;
    li.dataset.src = url;
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
      if (!video.paused && !isNaN(video.currentTime)) {
        savedTime = video.currentTime;
      }
      const currentTime = savedTime || 0;
      loadSource(li.dataset.src, currentTime);
      btn.textContent = li.textContent;
      menu.classList.remove('active');
    });
  });
}

// ======= INITIALISATION & ÉVÉNEMENTS =======
requestAnimationFrame(render);

video.addEventListener('loadedmetadata', () => {
  aspectRatio = video.videoWidth / video.videoHeight;
  updateProgressUI(0);
  overlay.style.display = video.paused ? 'block' : 'none';
  resetHideTimer();
  setQuality(currentResolution);
});

video.addEventListener('timeupdate', () => {
  if (!isSeeking) {
    updateProgressUI();
    savedTime = video.currentTime; // 🔥 ici on stocke la position
  }
});

video.addEventListener('play', () => {
  overlay.style.display = 'none';
  playPauseBtn.innerHTML = '<svg class="icon"><use xlink:href="#icon-pause"/></svg>';
});
video.addEventListener('pause', () => {
  overlay.style.display = 'block';
  playPauseBtn.innerHTML = '<svg class="icon"><use xlink:href="#icon-play"/></svg>';
});

video.addEventListener('click', togglePlayPause);
canvas.addEventListener('click', togglePlayPause);
playPauseBtn.addEventListener('click', togglePlayPause);

progCont.addEventListener('mousedown', e => { isSeeking = true; seek(e); });
document.addEventListener('mousemove', e => { if (isSeeking) seek(e); });
document.addEventListener('mouseup', () => { isSeeking = false; });

fsBtn.addEventListener('click', () => {
  document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
});
goBackBtn.addEventListener('click', () => window.history.back());

document.addEventListener('mousemove', resetHideTimer);
document.addEventListener('touchstart', resetHideTimer);

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

document.addEventListener('fullscreenchange', () => {
  setQuality(currentResolution);
});
