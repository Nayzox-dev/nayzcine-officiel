// recherche.js (IDs préfixés "movie:" / "tv:" acceptés partout)

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
  genre_action: 28, genre_aventure: 12, genre_animation: 16, genre_comedie: 35,
  genre_documentaire: 99, genre_drame: 18, genre_enfants: 10762, genre_famille: 10751,
  genre_fantastique: 14, genre_guerre: 10752, genre_histoire: 36, genre_horreur: 27,
  genre_musique: 10402, genre_mystere: 9648, genre_romance: 10749,
  genre_sciencefiction: 878, genre_thriller: 53, genre_telerealite: 10764, genre_western: 37
};

const GENRE_SLUG_MAP = {
  '28':'action','12':'adventure','16':'animation','35':'comedy','99':'documentary',
  '18':'drama','10751':'family','14':'fantasy','36':'history','27':'horror',
  '10402':'music','9648':'mystery','10749':'romance','878':'science+fiction',
  '53':'thriller','10752':'war','37':'western','10762':'kids','10764':'reality'
};

// === État global des filtres ===
let activeFilters = {
  mediaType: 'multi', // 'multi' | 'movie' | 'tv' (ignoré pour les recherches via filtres)
  genres: []          // slugs Cinepulse
};

// === Flag d’affichage des IDs TMDB ===
let displayId = true;

// === Utils ID préfixé ===
function parsePrefixedId(entry) {
  if (typeof entry === 'number') return { type: null, id: String(entry) };
  if (typeof entry !== 'string') return { type: null, id: null };
  const s = entry.trim();
  const colon = s.indexOf(':');
  if (colon === -1) return /^\d+$/.test(s) ? { type: null, id: s } : { type: null, id: null };
  const pfx = s.slice(0, colon).toLowerCase();
  const id  = s.slice(colon + 1);
  if ((pfx === 'movie' || pfx === 'tv') && /^\d+$/.test(id)) return { type: pfx, id };
  return { type: null, id: null };
}
function normalizeIdList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(parsePrefixedId).filter(x => x && x.id);
}

// === Cookies ===
function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

// === displayId init ===
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

// === Levenshtein tie-break ===
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
  return new Date(str).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
}
function formatDuration(mins) {
  if (!mins && mins !== 0) return '-';
  const h = Math.floor(mins/60), m = mins%60;
  return h>0 ? `${h}h ${m}min` : `${m}min`;
}
function clearResults() { resultsContainer.innerHTML = ''; }

// === TMDB ===
function tmdbUrl(type, id) {
  return `https://api.themoviedb.org/3/${type}/${id}?api_key=${apiKey}&language=fr-FR`;
}
async function fetchDetailsWithHint(typeHint, id) {
  if (typeHint === 'movie' || typeHint === 'tv') {
    let res = await fetch(tmdbUrl(typeHint, id));
    if (res.ok) {
      const data = await res.json();
      data.media_type = typeHint;
      return data;
    }
    const other = typeHint === 'movie' ? 'tv' : 'movie';
    res = await fetch(tmdbUrl(other, id));
    if (res.ok) {
      const data = await res.json();
      data.media_type = other;
      return data;
    }
    return null;
  }
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
async function fetchMovieRuntime(id) {
  const d = await fetchDetailsWithHint('movie', id);
  return d?.runtime ?? null;
}
async function fetchSeriesSeasons(id) {
  const d = await fetchDetailsWithHint('tv', id);
  return d?.number_of_seasons ?? null;
}

// === Carte ===
async function createCard(item) {
  const type   = item.media_type;
  const title  = item.title || item.name || 'Titre inconnu';
  const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '';
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
  if (displayId) infoHTML += `<span class="tmdb-id">ID : ${item.id}</span>`;
  infoHTML += `<p>${formatDate(date)} • ${extra}</p>`;

  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.tmdbId   = item.id;
  card.dataset.mediaType = type;

  card.innerHTML = `
    <div class="poster-container">
      <span class="badge-type ${cls}">${badge}</span>
      ${poster ? `<img src="${poster}" alt="${title}">` : `<div class="no-poster">Pas d'affiche</div>`}
    </div>
    <div class="card-info">${infoHTML}</div>
  `;
  card.addEventListener('click', ()=>{
    const detailUrl = new URL(window.location.origin + '/accueil/info-film/info-film.html');
    detailUrl.searchParams.set('id', card.dataset.tmdbId);
    detailUrl.searchParams.set('type', type);
    window.location.href = detailUrl.toString();
  });
  resultsContainer.appendChild(card);
}

// === Helpers URL ===
function buildAdvancedSearchURL(query, filters, page = 1) {
  const params = new URLSearchParams();
  if (query) params.set('query', query);
  if (filters?.mediaType === 'movie' || filters?.mediaType === 'tv') {
    params.append('types[]', filters.mediaType);
  }
  (filters?.genres || []).forEach(slug => params.append('genres[]', slug));
  params.set('sortBy', 'pertinence');
  params.set('page', String(page));
  return `https://api.nayzcine.fr/api/content/advanced-search?${params.toString()}`;
}

// === Spécifique: recherche UNIQUEMENT par GENRES (ignore type & query)
async function fetchAndDisplayByGenres() {
  loader.style.display = 'block';
  clearResults();
  try {
    const params = new URLSearchParams();
    // UNIQUEMENT les genres sélectionnés
    activeFilters.genres.forEach(slug => params.append('genres[]', slug));
    params.set('sortBy', 'pertinence');
    params.set('page', '1');

    // pas de query, pas de types[]
    const url = `https://api.nayzcine.fr/api/content/advanced-search?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`advanced-search ${res.status}`);

    const { tmdbIds } = await res.json();

    const parsed = normalizeIdList(tmdbIds);
    if (parsed.length === 0) {
      resultsContainer.innerHTML = `<p class="suggestion-message">Aucun résultat.</p>`;
      return;
    }

    // respecter exactement l'ordre renvoyé par l'API
    for (const ent of parsed.slice(0, 24)) {
      const data = await fetchDetailsWithHint(ent.type || 'movie', ent.id) || await fetchDetailsWithHint('tv', ent.id);
      if (data) await createCard(data);
    }
  } catch (err) {
    console.error('[fetchAndDisplayByGenres]', err);
    resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors du chargement des résultats.</p>`;
  } finally {
    loader.style.display = 'none';
  }
}

// === Recherche & affichage générique (Accueil, query seule, etc.)
async function fetchAndDisplayResults(query = '') {
  loader.style.display = 'block';
  clearResults();

  try {
    const hasType   = activeFilters.mediaType === 'movie' || activeFilters.mediaType === 'tv';
    const hasGenres = activeFilters.genres.length > 0;
    const hasQuery  = !!query;

    // Si on a une query => query seule (0 filtre)
    if (hasQuery) {
      const url = buildAdvancedSearchURL(query, { mediaType: 'multi', genres: [] }, 1);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`advanced-search ${res.status}`);
      const { tmdbIds } = await res.json();

      const parsed = normalizeIdList(tmdbIds);
      if (parsed.length === 0) {
        resultsContainer.innerHTML = `<p class="suggestion-message">Aucun résultat.</p>`;
        return;
      }

      for (const ent of parsed.slice(0, 24)) {
        const d = ent.type ? await fetchDetailsWithHint(ent.type, ent.id)
                           : (await fetchDetailsWithHint('movie', ent.id) || await fetchDetailsWithHint('tv', ent.id));
        if (d) await createCard(d);
      }
      return;
    }

    // Si des GENRES sont actifs -> passer par la routine genres ONLY
    if (hasGenres) {
      await fetchAndDisplayByGenres();
      return;
    }

    // Sinon : aucun filtre + aucune query => last_added (Accueil)
    const res = await fetch('https://api.nayzcine.fr/api/last_added');
    if (!res.ok) throw new Error(`last_added ${res.status}`);
    const { tmdbIds } = await res.json();

    const parsed = normalizeIdList(tmdbIds);
    if (parsed.length === 0) {
      resultsContainer.innerHTML = `<p class="suggestion-message">Pas assez de nouveautés disponibles.</p>`;
      return;
    }

    for (let i = 0; i < parsed.length && i < 24; i++) {
      const { type, id } = parsed[i];
      const details = await fetchDetailsWithHint(type, id);
      if (details) await createCard(details);
    }
  } catch (err) {
    console.error('[fetchAndDisplayResults]', err);
    resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors du chargement des résultats.</p>`;
  } finally {
    loader.style.display = 'none';
  }
}

// === Panneau filtres (GSAP) ===
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

// Reset complet des filtres
function resetFilters({ keepQuery = false } = {}) {
  activeFilters = { mediaType: 'multi', genres: [] };
  mediaTags.forEach(t => t.classList.remove('active'));
  genreTags.forEach(t => t.classList.remove('active'));
  if (!keepQuery) searchInput.value = '';
}

// === GENRES: toggle on/off + recherche GENRES SEULEMENT ===
genreTags.forEach(tag => {
  tag.addEventListener('click', () => {
    const tmdbId = tag.dataset.value;      // "28"
    const slug   = GENRE_SLUG_MAP[tmdbId]; // "action"
    if (!slug) return;

    // toggle (re-clic = désélection)
    const idx = activeFilters.genres.indexOf(slug);
    if (idx >= 0) activeFilters.genres.splice(idx, 1);
    else activeFilters.genres.push(slug);

    tag.classList.toggle('active');

    // on force l'affichage Accueil et on clear la query
    searchInput.value = '';
    setActiveButton(btnAccueil);

    // si plus aucun genre : Accueil (last_added), sinon recherche par genres
    if (activeFilters.genres.length === 0) {
      fetchAndDisplayResults();
    } else {
      fetchAndDisplayByGenres();
    }
  });
});

// === TYPE: toggle on/off ; ignoré dans la requête (seuls genres comptent)
mediaTags.forEach(tag => {
  tag.addEventListener('click', () => {
    const isActive = tag.classList.contains('active');
    const type = tag.dataset.value; // 'movie' | 'tv'

    if (isActive) {
      tag.classList.remove('active');
      activeFilters.mediaType = 'multi';
    } else {
      mediaTags.forEach(t => t.classList.remove('active'));
      tag.classList.add('active');
      activeFilters.mediaType = (type === 'movie' || type === 'tv') ? type : 'multi';
    }

    // afficher selon GENRES UNIQUEMENT (type ignoré)
    searchInput.value = '';
    setActiveButton(btnAccueil);
    if (activeFilters.genres.length === 0) {
      fetchAndDisplayResults(); // aucun genre -> Accueil
    } else {
      fetchAndDisplayByGenres();
    }
  });
});

// Bouton "Effacer filtres"
clearFiltersBtn?.addEventListener('click', ()=>{
  resetFilters({ keepQuery: false });
  setActiveButton(btnAccueil);
  fetchAndDisplayResults(); // Accueil (last_added)
});

// Recherche (Enter) → 0 filtre : query seule
searchInput.addEventListener('keydown', e=>{
  if(e.key==='Enter'){
    const q = searchInput.value.trim();
    resetFilters({ keepQuery: true });   // supprime TOUS les filtres, garde la query
    setActiveButton(btnAccueil);
    fetchAndDisplayResults(q);           // advanced-search avec query seule
  }
});

// Accueil → reset total
btnAccueil.addEventListener('click', ()=>{
  resetFilters({ keepQuery: false });
  setActiveButton(btnAccueil);
  fetchAndDisplayResults(); // last_added
});

// === Tous les Films / Toutes les Séries (inchangé) ===
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
    const parsed = normalizeIdList(tmdbIds).filter(x => !x.type || x.type === 'movie');
    if (parsed.length === 0) {
      resultsContainer.innerHTML = `<p class="suggestion-message">Aucun film trouvé.</p>`;
      return;
    }
    for (const { type, id } of parsed) {
      const d = await fetchDetailsWithHint(type || 'movie', id);
      if (d) await createCard(d);
    }
  } catch (err) {
    console.error('[Tous les Films]', err);
    resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors du chargement des films.</p>`;
  }
});

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
    const parsed = normalizeIdList(tmdbIds).filter(x => !x.type || x.type === 'tv');
    if (parsed.length === 0) {
      resultsContainer.innerHTML = `<p class="suggestion-message">Aucune série trouvée.</p>`;
      return;
    }
    for (const { type, id } of parsed) {
      const d = await fetchDetailsWithHint(type || 'tv', id);
      if (d) await createCard(d);
    }
  } catch (err) {
    console.error('[Toutes les Séries]', err);
    resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors du chargement des séries.</p>`;
  }
});

// === Suggestions (inchangé) ===
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
    const { data: profile, error } = await supabase
      .from('profile_genres')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !profile) {
      resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors de la récupération des préférences.</p>`;
      return;
    }

    const sortedSlugs = Object.entries(profile)
      .filter(([key,val]) => GENRE_ID_MAP[key] && val > 0)
      .sort((a,b) => b[1] - a[1])
      .map(([key]) => GENRE_SLUG_MAP[ GENRE_ID_MAP[key] ])
      .filter(Boolean);

    if (sortedSlugs.length === 0) {
      resultsContainer.innerHTML = `<p class="suggestion-message">Regardez quelques films pour activer les suggestions personnalisées.</p>`;
      return;
    }

    const params = new URLSearchParams();
    sortedSlugs.forEach(slug => params.append('genres[]', slug));
    params.append('types[]', 'movie');
    params.append('types[]', 'tv');
    params.set('sortBy', 'pertinence');
    params.set('page', '1');

    const url = `https://api.nayzcine.fr/api/content/advanced-search?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`advanced-search ${res.status}`);

    const { tmdbIds } = await res.json();
    const parsed = normalizeIdList(tmdbIds);

    if (parsed.length === 0) {
      resultsContainer.innerHTML = `<p class="suggestion-message">Aucune suggestion pour le moment.</p>`;
      return;
    }

    for (const ent of parsed.slice(0, 24)) {
      let chosen = null;
      if (ent.type) chosen = await fetchDetailsWithHint(ent.type, ent.id);
      else {
        const m = await fetchDetailsWithHint('movie', ent.id);
        const t = await fetchDetailsWithHint('tv', ent.id);
        chosen = m || t || null;
      }
      if (chosen) await createCard(chosen);
    }
  } catch (err) {
    console.error('[Suggestion]', err);
    resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors du chargement des suggestions personnalisées.</p>`;
  } finally {
    loader.style.display = 'none';
  }
});

// === Prochainement (optionnel) ===
btnProchainement?.addEventListener('click', async () => {
  setActiveButton(btnProchainement);
  loader.style.display = 'block';
  clearResults();
  try {
    const res = await fetch('https://api.nayzcine.fr/api/last_added');
    if (!res.ok) throw new Error(`API last_added indisponible (${res.status})`);
    const { tmdbIds } = await res.json();
    const parsed = normalizeIdList(tmdbIds);
    if (parsed.length === 0) {
      resultsContainer.innerHTML = `<p class="suggestion-message">Pas assez de nouveautés disponibles.</p>`;
      return;
    }
    for (let i = 0; i < parsed.length && i < 24; i++) {
      const { type, id } = parsed[i];
      const details = await fetchDetailsWithHint(type, id);
      if (details) await createCard(details);
    }
  } catch (err) {
    console.error('[Prochainement]', err);
    resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors du chargement des nouveautés.</p>`;
  } finally {
    loader.style.display = 'none';
  }
});

// === Initialisation ===
document.addEventListener('DOMContentLoaded', async ()=>{
  await initDisplayId();
  setActiveButton(btnAccueil);
  fetchAndDisplayResults(); // Accueil (last_added)
});
