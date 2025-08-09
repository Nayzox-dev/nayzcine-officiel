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

// shuffle Fisher–Yates
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

async function showMedia(idx) {
  const item = medias[idx];
  if (!item) return;

  // résumé
  const over = item.overview || item.name || 'Aucune description.';
  const trimmed = over.length > 200 ? over.slice(0, 197) + '…' : over;

  // fond
  const imgPath = item.backdrop_path || item.poster_path;
  if (imgPath) {
    crossfadeBackground(`https://image.tmdb.org/t/p/original${imgPath}`);
  }

  // affichage
  heroContent.style.opacity = 0;
  setTimeout(() => {
    heroTitle.textContent    = item.title || item.name || 'Sans titre';
    heroMeta.innerHTML       = buildMeta(item);
    heroOverview.textContent = trimmed;

    const detailUrl = new URL(window.location.origin + '/accueil/info-film/info-film.html');
    detailUrl.searchParams.set('id', item.id);
    detailUrl.searchParams.set('type', item.media_type);
    heroLink.href             = detailUrl.toString();
    heroLink.style.display    = 'inline-flex';
    heroContent.style.opacity = 1;
  }, 200);
}

function nextMedia() {
  if (medias.length > 1) {
    let nextIdx;
    do {
      nextIdx = Math.floor(Math.random() * medias.length);
    } while (nextIdx === currentIndex);
    currentIndex = nextIdx;
  }
  showMedia(currentIndex);
  clearTimeout(timer);
  timer = setTimeout(nextMedia, 5000);
}

// tente d'abord /movie/{id}, sinon /tv/{id}
async function fetchDetails(id) {
  let res = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${apiKey}&language=fr-FR`);
  if (res.ok) {
    const data = await res.json();
    data.media_type = 'movie';
    return data;
  }
  res = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${apiKey}&language=fr-FR`);
  if (res.ok) {
    const data = await res.json();
    data.media_type = 'tv';
    return data;
  }
  return null;
}

// initialisation : récupération des IDs puis des détails TMDB
async function init() {
  try {
    const resp = await fetch('https://api.nayzcine.fr/api/index');
    const { tmdbIds } = await resp.json();
    const detailsList = await Promise.all(tmdbIds.map(id => fetchDetails(id)));
    medias = detailsList.filter(x =>
      x &&
      (x.backdrop_path || x.poster_path) &&
      (x.overview || x.name)
    );
    if (!medias.length) return;
    shuffle(medias);
    showMedia(0);
    timer = setTimeout(nextMedia, 5000);
  } catch (err) {
    console.error('Erreur init :', err);
  }
}

init();
