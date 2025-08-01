// recherche.js

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://zkxyutfbebbrmxybkmhy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpreHl1dGZiZWJicm14eWJrbWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNDkwMTksImV4cCI6MjA2NTgyNTAxOX0.GPlNoHjfXLv7M4NOXbKH8OLVuACiCfnRXLDc6PiYVCk';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// === Constantes ===
const apiKey           = '138e0046e0279e97e3c3034ff083446e';
const searchInput      = document.getElementById('searchInput');
const resultsContainer = document.getElementById('results');
const filterToggle     = document.getElementById('filterToggle');
const filterPanel      = document.querySelector('.filter-panel');
const genreTags        = document.querySelectorAll('.filter-tag[data-type="genre"]');
const mediaTags        = document.querySelectorAll('.filter-tag[data-type="media"]');
const btnAccueil       = document.getElementById('btnAccueil');
const btnFilms         = document.getElementById('btnTousFilms');
const btnSeries        = document.getElementById('btnToutesSeries');
const btnSuggestion    = document.getElementById('btnSuggestion');
const btnProchainement = document.querySelector('.btn-right');
const clearFiltersBtn  = document.getElementById('btnClearFilters');
const loader = document.getElementById('loader');

// === Mapping SQL → TMDB genres ===
const GENRE_ID_MAP = {
  genre_action:           28,
  genre_aventure:         12,
  genre_animation:        16,
  genre_comedie:          35,
  genre_documentaire:     99,
  genre_drame:            18,
  genre_enfants:          10762,
  genre_famille:          10751,
  genre_fantastique:      14,
  genre_guerre:           10752,
  genre_histoire:         36,
  genre_horreur:          27,
  genre_musique:          10402,
  genre_mystere:          9648,
  genre_romance:          10749,
  genre_sciencefiction:   878,
  genre_thriller:         53,
  genre_telerealite:      10764,
  genre_western:          37
};

const GENRE_SLUG_MAP = {
  '28':   'action',
  '12':   'adventure',
  '16':   'animation',
  '35':   'comedy',
  '99':   'documentary',
  '18':   'drama',
  '10751':'family',
  '14':   'fantasy',
  '36':   'history',
  '27':   'horror',
  '10402':'music',
  '9648': 'mystery',
  '10749':'romance',
  '878':  'science+fiction',
  '53':   'thriller',
  '10752':'war',
  '37':   'western',
  '10762':'kids',
  '10764':'reality'
};

// === État global des filtres ===
let activeFilters = {
  mediaType: 'multi', // 'multi' | 'movie' | 'tv'
  genres: []          // [ '28', '35', ... ]
};

// === Flag d’affichage des IDs TMDB ===
let displayId = false;

// === Utilitaires cookies ===
function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

// === Initialisation du flag displayId ===
async function initDisplayId() {
  const userId = getCookie('user_id');
  if (!userId) return;
  try {
    const { data, error } = await supabase
      .from('user_accounts')
      .select('user_id')
      .eq('user_id', userId)
      .single();
    displayId = !error && !!data;
  } catch (err) {
    console.error('Erreur Supabase initDisplayId:', err);
  }
}

// === Levenshtein distance pour le tri ===
function levenshtein(a, b) {
  const dp = Array.from({length: b.length+1}, (_,i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j-1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[b.length];
}

// === Affichage utilitaires ===
function formatDate(str) {
  if (!str) return 'Date inconnue';
  return new Date(str).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}
function formatDuration(mins) {
  if (!mins) return '-';
  const h = Math.floor(mins/60), m = mins%60;
  return h>0 ? `${h}h ${m}min` : `${m}min`;
}
function clearResults() {
  resultsContainer.innerHTML = '';
}
function shuffleArray(arr) {
  for (let i = arr.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function hasAllGenres(itemGenres, required) {
  if (!required.length) return true;
  return required.every(g => itemGenres.includes(Number(g)));
}

// === Appels TMDB ===
async function fetchDetails(id, type) {
  const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${apiKey}&language=fr-FR`;
  const res = await fetch(url);
  return res.ok ? res.json() : null;
}
async function fetchMovieRuntime(id) {
  return (await fetchDetails(id,'movie'))?.runtime ?? null;
}
async function fetchSeriesSeasons(id) {
  return (await fetchDetails(id,'tv'))?.number_of_seasons ?? null;
}

// === Création de la carte ===
async function createCard(item) {
  const type   = item.media_type;
  const title  = item.title || item.name || 'Titre inconnu';
  const poster = item.poster_path
    ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
    : '';
  const date   = item.release_date || item.first_air_date || '';
  let extra = '-';
  if (type==='movie') {
    const rt = item.runtime ?? await fetchMovieRuntime(item.id);
    extra = formatDuration(rt);
  } else {
    const ns = item.number_of_seasons ?? await fetchSeriesSeasons(item.id);
    extra = ns!=null ? `${ns} saison${ns>1?'s':''}` : '-';
  }
  const cls   = type==='tv'?'serie':'film';
  const badge = type==='tv'?'Série':'Film';

  let infoHTML = `<h3>${title}</h3>`;
  if (displayId) {
    infoHTML += `<span class="tmdb-id">ID : ${item.id}</span>`;
  }
  infoHTML += `<p>${formatDate(date)} • ${extra}</p>`;

  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.tmdbId   = item.id;
  card.dataset.mediaType = type;

  card.innerHTML = `
    <div class="poster-container">
      <span class="badge-type ${cls}">${badge}</span>
      ${poster
        ? `<img src="${poster}" alt="${title}">`
        : `<div class="no-poster">Pas d'affiche</div>`}
    </div>
    <div class="card-info">
      ${infoHTML}
    </div>
  `;
  card.addEventListener('click', ()=>{
    const detailUrl = new URL(
      window.location.origin +
      '/accueil/info-film/info-film.html'
    );
    detailUrl.searchParams.set('id', card.dataset.tmdbId);
    detailUrl.searchParams.set('type', type);
    window.location.href = detailUrl.toString();
  });
  resultsContainer.appendChild(card);
}

// === Recherche & affichage ===
async function fetchAndDisplayResults(query = '') {
  // Affiche le loader
  loader.style.display = 'block';
  clearResults();

  try {
    const hasFilters = activeFilters.mediaType !== 'multi' || activeFilters.genres.length > 0;

    if (!query && !hasFilters) {
      // --- Sans recherche ni filtre : affichage des derniers ajouts (inchangé) ---
      try {
        const res = await fetch('https://api.nayzcine.fr/api/last_added');
        const { tmdbIds } = await res.json();

        if (!Array.isArray(tmdbIds)) {
          resultsContainer.innerHTML = `<p class="suggestion-message">Erreur : aucune donnée reçue.</p>`;
          return;
        }

        for (let i = 0; i < tmdbIds.length && i < 25; i++) {
          const id = tmdbIds[i];
          let type = 'movie';
          if (i >= 12 && i < 25) type = 'tv';
          else if (i >= 24)       type = 'anime';

          const d = await fetchDetails(id, type);
          if (d) await createCard({ ...d, media_type: type });
        }
      } catch (err) {
        console.error('[Last Added]', err);
        resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors du chargement des derniers ajouts.</p>`;
      }

    } else {
      // --- Recherche / Filtre : appel à /api/search avec query, types[] et genres[] ---
      try {
        const params = new URLSearchParams();

        // texte de recherche éventuel
        if (query) {
          params.set('query', query);
        }

        // type film/série éventuel
        if (activeFilters.mediaType === 'movie' || activeFilters.mediaType === 'tv') {
          params.append('types[]', activeFilters.mediaType);
        }

        // genres[] en utilisant directement les data-value (TMDB genre IDs)
        activeFilters.genres.forEach(id => {
          params.append('genres[]', id);
        });

        const res = await fetch(`https://api.nayzcine.fr/api/search?${params}`);
        if (!res.ok) throw new Error(`API search indisponible (${res.status})`);

        const { tmdbIds } = await res.json();
        if (!Array.isArray(tmdbIds) || tmdbIds.length === 0) {
          resultsContainer.innerHTML = `<p class="suggestion-message">Aucun résultat.</p>`;
          return;
        }

        const qLower = query.toLowerCase();

        // Pour chaque ID : d'abord film, sinon série, puis choix par Levenshtein si les deux sont dispo
        for (const id of tmdbIds.slice(0, 24)) {
          const movieDetails = await fetchDetails(id, 'movie');
          const tvDetails    = await fetchDetails(id, 'tv');
          let chosen = null;

          if (movieDetails && tvDetails) {
            const distMovie = levenshtein(qLower, (movieDetails.title || '').toLowerCase());
            const distTv    = levenshtein(qLower, (tvDetails.name  || '').toLowerCase());
            chosen = distMovie <= distTv
              ? { ...movieDetails, media_type: 'movie' }
              : { ...tvDetails,   media_type: 'tv' };
          } else if (movieDetails) {
            chosen = { ...movieDetails, media_type: 'movie' };
          } else if (tvDetails) {
            chosen = { ...tvDetails, media_type: 'tv' };
          }

          if (chosen) {
            await createCard(chosen);
          }
        }
      } catch (err) {
        console.error('[Recherche]', err);
        resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors du chargement des résultats.</p>`;
      }
    }
  } finally {
    // Cache le loader quoi qu'il arrive
    loader.style.display = 'none';
  }
}

// === Gestion du panneau de filtres (GSAP) ===
let panelVisible = false;
filterToggle?.addEventListener('click', ()=>{
  if(panelVisible){
    gsap.to(filterPanel,{opacity:0,y:-20,duration:0.3,onComplete:()=>filterPanel.style.display='none'});
  } else {
    filterPanel.style.display='flex';
    gsap.fromTo(filterPanel,{opacity:0,y:-20},{opacity:1,y:0,duration:0.4});
  }
  panelVisible = !panelVisible;
});

// === Helpers UI ===
function setActiveButton(btn){
  [btnAccueil, btnSuggestion, btnFilms, btnSeries, btnProchainement]
    .forEach(b => b?.classList.toggle('active-btn', b===btn));
}

// === Évènements filtres ===
genreTags.forEach(tag => {
  tag.addEventListener('click', () => {
    const tmdbId = tag.dataset.value;           // ex. "28"
    const slug   = GENRE_SLUG_MAP[tmdbId];      // ex. "action"
    if (!slug) return;                          // pas de slug défini → on ignore

    const idx = activeFilters.genres.indexOf(slug);
    if (idx >= 0) {
      activeFilters.genres.splice(idx, 1);
    } else {
      activeFilters.genres.push(slug);
    }
    tag.classList.toggle('active');
    fetchAndDisplayResults(searchInput.value.trim());
  });
});

// === Évènements filtres « Type » (Films / Séries) ===
mediaTags.forEach(tag => {
  tag.addEventListener('click', () => {
    const type = tag.dataset.value; // 'movie' ou 'tv'

    // On efface les filtres de genres et recherche en cours
    activeFilters.genres = [];
    genreTags.forEach(g => g.classList.remove('active'));
    searchInput.value = '';

    if (type === 'movie') {
      // Active le bouton « Tous les Films » et déclenche son handler
      btnFilms.click();
    } else if (type === 'tv') {
      // Active le bouton « Toutes les Séries » et déclenche son handler
      btnSeries.click();
    }
  });
});

clearFiltersBtn?.addEventListener('click',()=>{
  activeFilters={mediaType:'multi',genres:[]};
  mediaTags.forEach(t=>t.classList.remove('active'));
  genreTags.forEach(t=>t.classList.remove('active'));
  searchInput.value = '';
  setActiveButton(btnAccueil);
  fetchAndDisplayResults();
});
searchInput.addEventListener('keydown',e=>{
  if(e.key==='Enter'){
    setActiveButton(btnAccueil);
    fetchAndDisplayResults(searchInput.value.trim());
  }
});
btnAccueil.addEventListener('click',()=>{
  setActiveButton(btnAccueil);
  searchInput.value = '';
  fetchAndDisplayResults();
});
// Quand on clique sur "Tous les Films"
btnFilms.addEventListener('click', async () => {
  setActiveButton(btnFilms);
  searchInput.value = '';
  activeFilters.mediaType = 'movie';
  mediaTags.forEach(t => t.classList.toggle('active', t.dataset.value === 'movie'));
  clearResults();

  try {
    const res = await fetch('https://api.nayzcine.fr/api/all-movie');
    if (!res.ok) throw new Error(`API all-movie indisponible (${res.status})`);

    const { tmdbIds } = await res.json();
    if (!Array.isArray(tmdbIds) || tmdbIds.length === 0) {
      resultsContainer.innerHTML = `<p class="suggestion-message">Aucun film trouvé.</p>`;
      return;
    }

    for (const id of tmdbIds) {
      const d = await fetchDetails(id, 'movie');
      if (d) await createCard({ ...d, media_type: 'movie' });
    }

  } catch (err) {
    console.error('[Tous les Films]', err);
    resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors du chargement des films.</p>`;
  }
});

// Quand on clique sur "Toutes les Séries"
btnSeries.addEventListener('click', async () => {
  setActiveButton(btnSeries);
  searchInput.value = '';
  activeFilters.mediaType = 'tv';
  mediaTags.forEach(t => t.classList.toggle('active', t.dataset.value === 'tv'));
  clearResults();

  try {
    const res = await fetch('https://api.nayzcine.fr/api/all-tv');
    if (!res.ok) throw new Error(`API all-tv indisponible (${res.status})`);

    const { tmdbIds } = await res.json();
    if (!Array.isArray(tmdbIds) || tmdbIds.length === 0) {
      resultsContainer.innerHTML = `<p class="suggestion-message">Aucune série trouvée.</p>`;
      return;
    }

    for (const id of tmdbIds) {
      const d = await fetchDetails(id, 'tv');
      if (d) await createCard({ ...d, media_type: 'tv' });
    }

  } catch (err) {
    console.error('[Toutes les Séries]', err);
    resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors du chargement des séries.</p>`;
  }
});

// === Suggestions via /api/search ===
btnSuggestion.addEventListener('click', async () => {
  setActiveButton(btnSuggestion);
  loader.style.display = 'block';
  clearResults();

  const userId = getCookie('user_id');
  if (!userId) {
    resultsContainer.innerHTML = `
      <div style="grid-column:1/-1; justify-self:center; margin-top:10vh; text-align:center;">
        <p style="font-size:1.2rem;margin-bottom:1.5rem;">
          Veuillez créer un compte pour avoir vos propres suggestions.
        </p>
        <button id="goLogin" style="padding:0.75rem 1.5rem; font-size:1rem; border:none; border-radius:4px; background-color:#e50914; color:white; cursor:pointer;">
          Se connecter / S'inscrire
        </button>
      </div>`;
    document.getElementById('goLogin')?.addEventListener('click', () => {
      window.location.href = '/accueil/compte/connexion/connexion.html';
    });
    loader.style.display = 'none';
    return;
  }

  try {
    // 1. Récupérer les préférences
    const { data: profile, error } = await supabase
      .from('profile_genres')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !profile) {
      resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors de la récupération des préférences.</p>`;
      return;
    }

    // 2. Trier par affinité et convertir en slugs Cinepulse
    const sortedSlugs = Object.entries(profile)
      .filter(([key,val]) => GENRE_ID_MAP[key] && val > 0)
      .sort((a,b) => b[1] - a[1])
      .map(([key]) => GENRE_SLUG_MAP[ GENRE_ID_MAP[key] ])
      .filter(slug => !!slug);

    if (sortedSlugs.length === 0) {
      resultsContainer.innerHTML = `<p class="suggestion-message">Regardez quelques films pour activer les suggestions personnalisées.</p>`;
      return;
    }

    // 3. Construire l'URL /api/search avec genres[] et types[] si souhaité
    const params = new URLSearchParams();
    sortedSlugs.forEach(slug => params.append('genres[]', slug));
    // Par défaut, on veut films et séries
    params.append('types[]', 'movie');
    params.append('types[]', 'tv');
    // Tri par pertinence
    params.set('sortBy', 'pertinence');

    const res = await fetch(`https://api.nayzcine.fr/api/search?${params}`);
    if (!res.ok) throw new Error(`API search indisponible (${res.status})`);

    const { tmdbIds } = await res.json();
    if (!Array.isArray(tmdbIds) || tmdbIds.length === 0) {
      resultsContainer.innerHTML = `<p class="suggestion-message">Aucune suggestion pour le moment.</p>`;
      return;
    }

    // 4. Afficher jusqu'à 24 suggestions
    for (const id of tmdbIds.slice(0, 24)) {
      // même logique que pour la recherche : film d'abord, sinon série, choix via Levenshtein
      const movieDetails = await fetchDetails(id, 'movie');
      const tvDetails    = await fetchDetails(id, 'tv');
      let chosen = null;

      if (movieDetails && tvDetails) {
        const qLower = ''; // pas de query, on peut comparer aux titres si on veut
        const distMovie = levenshtein(qLower, (movieDetails.title || '').toLowerCase());
        const distTv    = levenshtein(qLower, (tvDetails.name  || '').toLowerCase());
        chosen = distMovie <= distTv
          ? { ...movieDetails, media_type: 'movie' }
          : { ...tvDetails,     media_type: 'tv' };
      } else if (movieDetails) {
        chosen = { ...movieDetails, media_type: 'movie' };
      } else if (tvDetails) {
        chosen = { ...tvDetails, media_type: 'tv' };
      }

      if (chosen) {
        await createCard(chosen);
      }
    }

  } catch (err) {
    console.error('[Suggestion]', err);
    resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors du chargement des suggestions personnalisées.</p>`;
  } finally {
    loader.style.display = 'none';
  }
});

// === Prochaines sorties (12 films + 12 séries via last_added) ===
btnProchainement.addEventListener('click', async () => {
  setActiveButton(btnProchainement);
  loader.style.display = 'block';
  clearResults();

  try {
    const res = await fetch('https://api.nayzcine.fr/api/last_added');
    if (!res.ok) throw new Error(`API last_added indisponible (${res.status})`);
    const { tmdbIds } = await res.json();
    if (!Array.isArray(tmdbIds) || tmdbIds.length < 24) {
      resultsContainer.innerHTML = `<p class="suggestion-message">Pas assez de nouveautés disponibles.</p>`;
      return;
    }

    // Afficher 12 films
    for (let i = 0; i < 12; i++) {
      const id = tmdbIds[i];
      const details = await fetchDetails(id, 'movie');
      if (details) {
        details.media_type = 'movie';
        await createCard(details);
      }
    }

    // Afficher 12 séries
    for (let i = 12; i < 25; i++) {
      const id = tmdbIds[i];
      const details = await fetchDetails(id, 'tv');
      if (details) {
        details.media_type = 'tv';
        await createCard(details);
      }
    }

  } catch (err) {
    console.error('[Prochainement]', err);
    resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors du chargement des nouveautés.</p>`;
  } finally {
    loader.style.display = 'none';
  }
});

// === Initialisation ===
document.addEventListener('DOMContentLoaded',async()=>{
  await initDisplayId();
  setActiveButton(btnAccueil);
  fetchAndDisplayResults();
});
