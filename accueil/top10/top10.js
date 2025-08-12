// ======================= TOP 10 – TMDB (avec IDs préfixés "movie:" / "tv:") =======================
const apiKey          = '138e0046e0279e97e3c3034ff083446e';
const imageBaseUrl    = 'https://image.tmdb.org/t/p/w500';
const moviesContainer = document.getElementById('moviesContainer');
const btnFilms        = document.getElementById('btnFilms');
const btnSeries       = document.getElementById('btnSeries');

let currentType = 'movie'; // 'movie' ou 'tv'

// --- Utils ---
function parsePrefixedId(entry) {
  // accepte "movie:12345", "tv:67890", 12345, "12345"
  if (typeof entry === 'number') return { type: null, id: String(entry) };
  if (typeof entry !== 'string') return { type: null, id: null };

  const s = entry.trim();
  const colonIdx = s.indexOf(':');
  if (colonIdx === -1) return { type: null, id: s };

  const pfx = s.slice(0, colonIdx).toLowerCase();
  const id  = s.slice(colonIdx + 1);
  if (pfx === 'movie' || pfx === 'tv') return { type: pfx, id };
  return { type: null, id: s };
}

function tmdbUrl(type, id) {
  return `https://api.themoviedb.org/3/${type}/${id}?api_key=${apiKey}&language=fr-FR`;
}

// === Récupère détails TMDB pour un ID + type éventuel ===
async function fetchDetails(typeHint, id) {
  // Si on connaît le type, on tente directement
  if (typeHint === 'movie' || typeHint === 'tv') {
    const res = await fetch(tmdbUrl(typeHint, id));
    if (res.ok) {
      const data = await res.json();
      data.media_type = typeHint;
      return data;
    }
    // si l'appel échoue (id pas du bon type ?), on essaie l'autre
    const other = typeHint === 'movie' ? 'tv' : 'movie';
    const res2 = await fetch(tmdbUrl(other, id));
    if (res2.ok) {
      const data = await res2.json();
      data.media_type = other;
      return data;
    }
    return null;
  }

  // Type inconnu : on essaie d'abord movie puis tv
  let res = await fetch(tmdbUrl('movie', id));
  if (res.ok) {
    const data = await res.json();
    data.media_type = 'movie';
    return data;
  }
  res = await fetch(tmdbUrl('tv', id));
  if (res.ok) {
    const data = await res.json();
    data.media_type = 'tv';
    return data;
  }
  return null;
}

// === Appelle l'API Nayzcine (retourne des IDs préfixés), puis affiche ===
async function fetchAndDisplay(requestType) {
  const endpoint =
    requestType === 'movie'
      ? 'https://api.nayzcine.fr/api/top10-movies'
      : 'https://api.nayzcine.fr/api/top10-tv';

  try {
    const resp = await fetch(endpoint);
    if (!resp.ok) throw new Error(`API Nayzcine indisponible (${resp.status})`);
    const { tmdbIds } = await resp.json(); // ex: ["tv:119051","movie:671",...]

    // Normalise les entrées "type:id"
    const parsed = tmdbIds
      .map(parsePrefixedId)
      .filter(x => x.id); // garde seulement les valides

    // Récupère tous les détails en parallèle
    const detailsList = await Promise.all(
      parsed.map(({ type, id }) => fetchDetails(type ?? null, id))
    );

    // Remplace les nulls par objet minimal
    const items = detailsList.map((d, i) => {
      if (d) return d;
      const fallbackType = parsed[i]?.type || requestType || 'movie';
      return {
        id: parsed[i]?.id || '0',
        media_type: fallbackType,
        poster_path: null,
        backdrop_path: null,
        overview: '',
        title: null,
        name: null
      };
    });

    displayItems(items);
  } catch (e) {
    moviesContainer.innerHTML = `
      <p style="color:#f44336; text-align:center; width:100%;">
        Impossible de charger les données.
      </p>`;
    console.error(e);
  }
}

// === Affiche les cartes + gestion du clic ===
function displayItems(items) {
  moviesContainer.innerHTML = '';

  items.forEach((item, index) => {
    const poster = item.poster_path
      ? imageBaseUrl + item.poster_path
      : 'https://via.placeholder.com/500x750?text=Pas+d\'image';
    const title = item.title || item.name || 'Titre inconnu';
    const type  = item.media_type === 'tv' ? 'tv' : 'movie';

    const card = document.createElement('div');
    card.className = 'movie-card';
    card.title = title;

    card.innerHTML = `
      <img class="movie-poster" src="${poster}" alt="Affiche de ${title}" loading="lazy" />
      <div class="movie-number">${index + 1}</div>
      <div class="movie-title">${title}</div>
    `;

    card.addEventListener('click', () => {
      const detailUrl = new URL(
        window.location.origin + '/accueil/info-film/info-film.html'
      );
      detailUrl.searchParams.set('id', item.id);
      detailUrl.searchParams.set('type', type);
      window.location.href = detailUrl.toString();
    });

    moviesContainer.appendChild(card);
  });
}

// === Boutons film/série ===
btnFilms.addEventListener('click', () => {
  if (currentType !== 'movie') {
    currentType = 'movie';
    btnFilms.classList.add('active');
    btnSeries.classList.remove('active');
    fetchAndDisplay(currentType);
  }
});

btnSeries.addEventListener('click', () => {
  if (currentType !== 'tv') {
    currentType = 'tv';
    btnSeries.classList.add('active');
    btnFilms.classList.remove('active');
    fetchAndDisplay(currentType);
  }
});

// === Chargement initial ===
fetchAndDisplay(currentType);
