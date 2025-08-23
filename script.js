const apiKey       = '138e0046e0279e97e3c3034ff083446e';
const heroTitle    = document.getElementById('hero-title');
const heroMeta     = document.getElementById('hero-meta');
const heroOverview = document.getElementById('hero-overview');
const heroLink     = document.getElementById('hero-link');
const heroContent  = document.getElementById('hero-content');
const bg1          = document.getElementById('bg1');
const bg2          = document.getElementById('bg2');

let medias = [];
let currentIndex = 0;
let timer;
let activeBg = 1;

// ---------- utils ----------
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function formatDuration(mins) {
  if (!mins) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h${m ? m : ''}` : `${m}min`;
}

function buildMeta(item) {
  const parts = [];
  if (item.genres) {
    for (const g of item.genres) parts.push(`<span>${g.name}</span>`);
  }
  parts.push(`<span>${item.media_type === 'movie' ? 'Film' : 'Série'}</span>`);
  parts.push(`<span>⭐ ${item.vote_average?.toFixed(1) || '?'}/10</span>`);
  if (item.media_type === 'movie' && item.runtime) {
    parts.push(`<span>${formatDuration(item.runtime)}</span>`);
  }
  if (item.media_type === 'tv' && item.number_of_seasons != null) {
    parts.push(`<span>${item.number_of_seasons} saison${item.number_of_seasons > 1 ? 's' : ''}</span>`);
    if (item.number_of_episodes) {
      parts.push(`<span>${item.number_of_episodes} épisodes</span>`);
    }
  }
  return parts.join('');
}

function crossfadeBackground(imgUrl) {
  const nextBg    = activeBg === 1 ? bg2 : bg1;
  const currentBg = activeBg === 1 ? bg1 : bg2;
  nextBg.style.backgroundImage = `url(${imgUrl})`;
  nextBg.style.opacity = 1;
  currentBg.style.opacity = 0;
  activeBg = activeBg === 1 ? 2 : 1;
}

// "movie:12345" -> { type:"movie", id:"12345" }
// "tv:6789"     -> { type:"tv", id:"6789" }
//  "12345"      -> { type:null, id:"12345" }  (fallback)
function parsePrefixedId(entry) {
  if (typeof entry === 'number') return { type: null, id: String(entry) };
  if (typeof entry !== 'string') return { type: null, id: null };

  const s = entry.trim();
  const m = s.match(/^(movie|tv):(\d+)$/i);
  if (m) return { type: m[1].toLowerCase(), id: m[2] };

  // si c'est juste un nombre en string
  if (/^\d+$/.test(s)) return { type: null, id: s };

  return { type: null, id: null };
}

// ---------- affichage ----------
async function showMedia(idx) {
  const item = medias[idx];
  if (!item) return;

  const over = item.overview || item.name || 'Aucune description.';
  const trimmed = over.length > 200 ? over.slice(0, 197) + '…' : over;

  const imgPath = item.backdrop_path || item.poster_path;
  if (imgPath) {
    crossfadeBackground(`https://image.tmdb.org/t/p/original${imgPath}`);
  }

  heroContent.style.opacity = 0;
  setTimeout(() => {
    heroTitle.textContent    = item.title || item.name || 'Sans titre';
    heroMeta.innerHTML       = buildMeta(item);
    heroOverview.textContent = trimmed;

    const detailUrl = new URL(window.location.origin + '/accueil/info-film/info-film.html');
    detailUrl.searchParams.set('id', item.id);
    detailUrl.searchParams.set('type', item.media_type); // 'movie' | 'tv'
    heroLink.href             = detailUrl.toString();
    heroLink.style.display    = 'inline-flex';
    heroContent.style.opacity = 1;
  }, 200);
}

function nextMedia() {
  if (medias.length > 1) {
    let nextIdx;
    do {
      nextIdx = Math.floor(Math.random() * (medias.length));
    } while (nextIdx === currentIndex);
    currentIndex = nextIdx;
  }
  showMedia(currentIndex);
  clearTimeout(timer);
  timer = setTimeout(nextMedia, 5000);
}

// ---------- TMDB fetch ----------
async function fetchDetailsKnownType(type, id) {
  const base = 'https://api.themoviedb.org/3';
  const url  = type === 'movie'
    ? `${base}/movie/${id}?api_key=${apiKey}&language=fr-FR`
    : `${base}/tv/${id}?api_key=${apiKey}&language=fr-FR`;

  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  data.media_type = type;
  return data;
}

// fallback si pas de type fourni
async function fetchDetailsFallback(id) {
  const base = 'https://api.themoviedb.org/3';
  let res = await fetch(`${base}/movie/${id}?api_key=${apiKey}&language=fr-FR`);
  if (res.ok) {
    const data = await res.json();
    data.media_type = 'movie';
    return data;
  }
  res = await fetch(`${base}/tv/${id}?api_key=${apiKey}&language=fr-FR`);
  if (res.ok) {
    const data = await res.json();
    data.media_type = 'tv';
    return data;
  }
  return null;
}

async function fetchDetailsFromEntry(entry) {
  const { type, id } = parsePrefixedId(entry);
  if (!id) return null;
  if (type === 'movie' || type === 'tv') {
    return fetchDetailsKnownType(type, id);
  }
  // si l’API renvoie juste "12345" sans préfixe
  return fetchDetailsFallback(id);
}

// ---------- init ----------
async function init() {
  try {
    const resp = await fetch('https://api.nayzcine.fr/api/index');
    const payload = await resp.json();

    // Attendu: { tmdbIds: ["movie:123", "tv:456", ...] }
    const list = Array.isArray(payload?.tmdbIds) ? payload.tmdbIds : [];

    const detailsList = await Promise.all(list.map(fetchDetailsFromEntry));

    medias = detailsList.filter(x =>
      x &&
      (x.backdrop_path || x.poster_path) &&
      (x.overview || x.name)
    );

    if (!medias.length) return;

    shuffle(medias);
    currentIndex = 0;
    showMedia(0);
    timer = setTimeout(nextMedia, 5000);
  } catch (err) {
    console.error('Erreur init :', err);
  }
}

init();
