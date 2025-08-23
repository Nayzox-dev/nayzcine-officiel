// ================================
// recherche.js – FULL (sans CSS injecté)
// ================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ---- Supabase ----
const SUPABASE_URL = 'https://zkxyutfbebbrmxybkmhy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpreHl1dGZiZWJicm14eWJrbWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNDkwMTksImV4cCI6MjA2NTgyNTAxOX0.GPlNoHjfXLv7M4NOXbKH8OLVuACiCfnRXLDc6PiYVCk';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- Constantes DOM & API ----
const apiKey           = '138e0046e0279e97e3c3034ff083446e';
const searchInput      = document.getElementById('searchInput');
const resultsContainer = document.getElementById('results');
const filterToggle     = document.getElementById('filterToggle');
const filterPanel      = document.querySelector('.filter-panel');
const genreTags        = document.querySelectorAll('.filter-tag[data-type="genre"]');
const mediaTags        = document.querySelectorAll('.filter-tag[data-type="media"]');
const btnAccueil       = document.getElementById('btnAccueil');
const btnFilms         = document.getElementById('btnTousFilms');
const btnSeries        = document.getElementById('btnToutesSeries') || document.getElementById('btnTodasSeries');
const btnSuggestion    = document.getElementById('btnSuggestion');
const btnProchainement = document.querySelector('.btn-right');
const clearFiltersBtn  = document.getElementById('btnClearFilters');
const loader           = document.getElementById('loader');

// ---- Maps Genres (utiles pour Suggestions / filtres) ----
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

// ---- Helper: profil Supabase -> slugs de genres[] (triés par poids desc) ----
function getPreferenceSlugs(profile) {
  return Object.entries(profile || {})
    .filter(([key, val]) => GENRE_ID_MAP[key] && Number(val) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([key]) => GENRE_SLUG_MAP[String(GENRE_ID_MAP[key])])
    .filter(Boolean);
}

// ---- État ----
let activeFilters = { mediaType: 'multi', genres: [] };
let displayId = true;

// ================================
// Utils
// ================================
function parsePrefixedId(entry) {
  if (typeof entry === 'number') return { type: null, id: String(entry) };
  if (typeof entry !== 'string') return { type: null, id: null };
  const s = entry.trim();
  const i = s.indexOf(':');
  if (i === -1) return /^\d+$/.test(s) ? { type: null, id: s } : { type: null, id: null };
  const pfx = s.slice(0, i).toLowerCase();
  const id  = s.slice(i + 1);
  if ((pfx === 'movie' || pfx === 'tv') && /^\d+$/.test(id)) return { type: pfx, id };
  return { type: null, id: null };
}
function normalizeIdList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(parsePrefixedId).filter(x => x && x.id);
}
function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
async function getUserId() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) return user.id;
  } catch {}
  return getCookie('user_id');
}
async function initDisplayId() {
  const userId = await getUserId();
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
function formatDate(str) {
  if (!str) return 'Date inconnue';
  return new Date(str).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
}
function formatDuration(mins) {
  if (!mins && mins !== 0) return '-';
  const h = Math.floor(mins/60), m = mins%60;
  return h>0 ? `${h}h ${m}min` : `${m}min`;
}
function clearResults(){ resultsContainer.innerHTML = ''; }
function setActiveButton(btn){
  [btnAccueil, btnSuggestion, btnFilms, btnSeries, btnProchainement]
    .forEach(b => b?.classList.toggle('active-btn', b === btn));
}

// ================================
// TMDB helpers
// ================================
function tmdbUrl(type, id) {
  return `https://api.themoviedb.org/3/${type}/${id}?api_key=${apiKey}&language=fr-FR`;
}
async function fetchDetailsWithHint(typeHint, id) {
  if (typeHint === 'movie' || typeHint === 'tv') {
    let r = await fetch(tmdbUrl(typeHint, id));
    if (r.ok) {
      const d = await r.json();
      d.media_type = typeHint;
      return d;
    }
    const other = typeHint === 'movie' ? 'tv' : 'movie';
    r = await fetch(tmdbUrl(other, id));
    if (r.ok) {
      const d = await r.json();
      d.media_type = other;
      return d;
    }
    return null;
  }
  let r = await fetch(tmdbUrl('movie', id));
  if (r.ok) {
    const d = await r.json();
    d.media_type = 'movie';
    return d;
  }
  r = await fetch(tmdbUrl('tv', id));
  if (r.ok) {
    const d = await r.json();
    d.media_type = 'tv';
    return d;
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

// ================================
// Cartes (progress + badge SxEx pour séries)
// ================================
async function createCard(item, { progressPct = null, episodeBadge = null } = {}) {
  const type   = item.media_type;
  const title  = item.title || item.name || 'Titre inconnu';
  const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '';
  const date   = item.release_date || item.first_air_date || '';
  let extra = '-';

  if (type === 'movie') {
    const rt = item.runtime ?? await fetchMovieRuntime(item.id);
    extra = formatDuration(rt);
  } else {
    const ns = item.number_of_seasons ?? await fetchSeriesSeasons(item.id);
    extra = ns != null ? `${ns} saison${ns>1?'s':''}` : '-';
  }

  const cls   = type === 'tv' ? 'serie' : 'film';
  const typeBadge = type === 'tv' ? 'Série' : 'Film';

  let infoHTML = `<h3>${title}</h3>`;
  if (displayId) infoHTML += `<span class="tmdb-id">ID : ${item.id}</span>`;
  infoHTML += `<p>${formatDate(date)} • ${extra}</p>`;

  const bar =
    typeof progressPct === 'number'
      ? `<div class="nc-progress-wrap"><div class="nc-progress-fill" style="width:${Math.max(0, Math.min(100, progressPct))}%"></div></div>`
      : ``;

  const epBadgeHTML =
    (type === 'tv' && episodeBadge && Number.isFinite(+episodeBadge.season) && Number.isFinite(+episodeBadge.episode))
      ? `<span class="badge-episode">S${Number(episodeBadge.season)}E${Number(episodeBadge.episode)}</span>`
      : ``;

  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.tmdbId    = item.id;
  card.dataset.mediaType = type;

  card.innerHTML = `
    <div class="poster-container">
      <span class="badge-type ${cls}">${typeBadge}</span>
      ${epBadgeHTML}
      ${poster ? `<img src="${poster}" alt="${title}">` : `<div class="no-poster">Pas d'affiche</div>`}
      ${bar}
    </div>
    <div class="card-info">${infoHTML}</div>
  `;

  card.addEventListener('click', ()=>{
    const detailUrl = new URL(window.location.origin + '/accueil/info-film/info-film.html');
    detailUrl.searchParams.set('id', String(item.id));
    detailUrl.searchParams.set('type', type);
    window.location.href = detailUrl.toString();
  });

  resultsContainer.appendChild(card);
}

// ================================
// Advanced Search unifiée
// ================================
function buildAdvancedSearchURL({ query = '', mediaType = 'multi', genres = [], page = 1 } = {}) {
  const params = new URLSearchParams();
  if (query && query.trim()) params.set('query', query.trim());
  if (mediaType === 'movie' || mediaType === 'tv') params.append('types[]', mediaType);
  (genres || []).forEach(slug => params.append('genres[]', slug));
  params.set('sortBy', 'pertinence');
  params.set('page', String(page));
  return `https://api.nayzcine.fr/api/content/advanced-search?${params.toString()}`;
}
function shouldUseAdvancedSearch(query, { mediaType, genres }) {
  const hasQuery  = !!(query && query.trim());
  const hasType   = mediaType === 'movie' || mediaType === 'tv';
  const hasGenres = Array.isArray(genres) && genres.length > 0;
  return hasQuery || hasType || hasGenres;
}

async function fetchAndDisplaySearch({ query = '' } = {}) {
  loader.style.display = 'block';
  clearResults();
  try {
    if (shouldUseAdvancedSearch(query, activeFilters)) {
      const url = buildAdvancedSearchURL({
        query,
        mediaType: activeFilters.mediaType,
        genres: activeFilters.genres,
        page: 1
      });
      const res = await fetch(url);
      if (!res.ok) throw new Error(`advanced-search ${res.status}`);
      const { tmdbIds } = await res.json();

      const parsed = normalizeIdList(tmdbIds);
      if (parsed.length === 0) {
        resultsContainer.innerHTML = `<p class="suggestion-message">Aucun résultat.</p>`;
        return;
      }
      for (const ent of parsed.slice(0, 24)) {
        const d = ent.type
          ? await fetchDetailsWithHint(ent.type, ent.id)
          : (await fetchDetailsWithHint('movie', ent.id) || await fetchDetailsWithHint('tv', ent.id));
        if (d) await createCard(d);
      }
    } else {
      // Aucun critère => montrer les récemment ajoutés
      await fetchAndDisplayRecentAdded(24);
    }
  } catch (err) {
    console.error('[fetchAndDisplaySearch]', err);
    resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors du chargement des résultats.</p>`;
  } finally {
    loader.style.display = 'none';
  }
}

// ================================
// Récemment ajoutés (flux par défaut)
// ================================
async function fetchAndDisplayRecentAdded(limit = 24) {
  loader.style.display = 'block';
  clearResults();
  try {
    const res = await fetch('https://api.nayzcine.fr/api/last_added');
    if (!res.ok) throw new Error(`last_added ${res.status}`);
    const { tmdbIds } = await res.json();

    const parsed = normalizeIdList(tmdbIds);
    if (!parsed || parsed.length === 0) {
      resultsContainer.innerHTML = `<p class="suggestion-message">Pas assez de nouveautés disponibles.</p>`;
      return;
    }

    for (let i = 0; i < parsed.length && i < limit; i++) {
      const { type, id } = parsed[i];
      const details = await fetchDetailsWithHint(type, id);
      if (details) await createCard(details); // pas de progression ici
    }
  } catch (err) {
    console.error('[fetchAndDisplayRecentAdded]', err);
    resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors du chargement des nouveautés.</p>`;
  } finally {
    loader.style.display = 'none';
  }
}

// ================================
// Historique utilisateur (Accueil)
// ================================
async function fetchAndDisplayHistory(limit = 48) {
  loader.style.display = 'block';
  clearResults();

  try {
    const userId = await getUserId();
    if (!userId) {
      resultsContainer.innerHTML = `
        <div class="empty-history">
          Ici tu pourras retrouver les films et séries que tu as entamés.
          <br><br>
          <button id="goLogin" class="btn-login-empty">Se connecter / S'inscrire</button>
        </div>`;
      document.getElementById('goLogin')?.addEventListener('click', () => {
        window.location.href = '/accueil/compte/connexion/connexion.html';
      });
      return;
    }

    const { data, error } = await supabase
      .from('user_progress')
      .select('media_id,is_movie,season,episode,time_watched,total_duration,updated_at')
      .eq('user_id', userId)
      .gt('time_watched', 0)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      resultsContainer.innerHTML = `
        <div class="empty-history">
          Ici tu pourras retrouver les films et séries que tu as entamés.
        </div>`;
      return;
    }

    const movieLatestById = new Map(); // media_id -> row (le plus récent)
    const tvRowsById     = new Map();  // media_id -> rows[]

    for (const row of data) {
      if (row.is_movie) {
        if (!movieLatestById.has(row.media_id)) movieLatestById.set(row.media_id, row);
      } else {
        const arr = tvRowsById.get(row.media_id) || [];
        arr.push(row);
        tvRowsById.set(row.media_id, arr);
      }
    }

    // Pour chaque série, choisir (saison max, puis épisode max). Tiebreak updated_at.
    function pickBestTvRow(rows) {
      return rows.reduce((best, r) => {
        const s  = Number(r.season ?? 0);
        const e  = Number(r.episode ?? 0);
        if (!best) return r;
        const bs = Number(best.season ?? 0);
        const be = Number(best.episode ?? 0);
        if (s !== bs) return s > bs ? r : best;
        if (e !== be) return e > be ? r : best;
        return new Date(r.updated_at) > new Date(best.updated_at) ? r : best;
      }, null);
    }

    const entries = [];
    for (const row of movieLatestById.values()) entries.push({ type: 'movie', row });
    for (const rows of tvRowsById.values()) {
      const best = pickBestTvRow(rows);
      if (best) entries.push({ type: 'tv', row: best });
    }

    // Tri global par récence
    entries.sort((a, b) => new Date(b.row.updated_at) - new Date(a.row.updated_at));

    // Affichage
    for (const { type, row } of entries.slice(0, limit)) {
      const details = await fetchDetailsWithHint(type, row.media_id);
      if (!details) continue;

      let pct = null;
      if (typeof row.total_duration === 'number' && row.total_duration > 0) {
        pct = Math.floor((row.time_watched / row.total_duration) * 100);
        if (!isFinite(pct)) pct = null;
        if (pct != null) pct = Math.max(0, Math.min(100, pct));
      }

      const epBadge = (type === 'tv')
        ? { season: Number(row.season ?? 0), episode: Number(row.episode ?? 0) }
        : null;

      await createCard(details, { progressPct: pct, episodeBadge: epBadge });
    }
  } catch (err) {
    console.error('[fetchAndDisplayHistory]', err);
    resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors du chargement de l’historique.</p>`;
  } finally {
    loader.style.display = 'none';
  }
}

// ================================
// Panneau filtres (GSAP)
// ================================
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

// ================================
// Interactions Filtres / Boutons
// ================================
function resetFilters({ keepQuery = false } = {}) {
  activeFilters = { mediaType: 'multi', genres: [] };
  mediaTags.forEach(t => t.classList.remove('active'));
  genreTags.forEach(t => t.classList.remove('active'));
  if (!keepQuery) searchInput.value = '';
}

// GENRES → toggle + recherche unifiée (ou "récemment ajoutés" si plus de critère)
genreTags.forEach(tag => {
  tag.addEventListener('click', () => {
    const tmdbId = tag.dataset.value;
    const slug   = GENRE_SLUG_MAP[tmdbId];
    if (!slug) return;

    const idx = activeFilters.genres.indexOf(slug);
    if (idx >= 0) activeFilters.genres.splice(idx, 1);
    else activeFilters.genres.push(slug);

    tag.classList.toggle('active');
    setActiveButton(null);

    fetchAndDisplaySearch({ query: searchInput.value.trim() });
  });
});

// TYPE → toggle + recherche unifiée
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

    setActiveButton(null);
    fetchAndDisplaySearch({ query: searchInput.value.trim() });
  });
});

// Effacer filtres → revient aux "récemment ajoutés"
clearFiltersBtn?.addEventListener('click', ()=>{
  resetFilters({ keepQuery: false });
  setActiveButton(null);
  fetchAndDisplayRecentAdded();
});

// Recherche (Enter) → advanced-search avec filtres actifs ; si query vide et aucun filtre -> récemment ajoutés
searchInput.addEventListener('keydown', e=>{
  if (e.key === 'Enter') {
    const q = searchInput.value.trim();
    setActiveButton(null);
    fetchAndDisplaySearch({ query: q });
  }
});

// Accueil → ACTIF + historique utilisateur (trié par date desc)
btnAccueil.addEventListener('click', ()=>{
  resetFilters({ keepQuery: false });
  setActiveButton(btnAccueil);
  fetchAndDisplayHistory();
});

// Tous les Films (listing complet via endpoint dédié)
btnFilms.addEventListener('click', async () => {
  setActiveButton(btnFilms);
  resetFilters({ keepQuery: false });
  clearResults();

  try {
    loader.style.display = 'block';
    const res = await fetch('https://api.nayzcine.fr/api/all-movie');
    if (!res.ok) throw new Error(`API all-movie indisponible (${res.status})`);
    const { tmdbIds } = await res.json();
    const parsed = normalizeIdList(tmdbIds).filter(x => !x.type || x.type === 'movie');
    if (parsed.length === 0) {
      resultsContainer.innerHTML = `<p class="suggestion-message">Aucun film trouvé.</p>`;
    } else {
      for (const { type, id } of parsed.slice(0, 48)) {
        const d = await fetchDetailsWithHint(type || 'movie', id);
        if (d) await createCard(d);
      }
    }
  } catch (err) {
    console.error('[Tous les Films]', err);
    resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors du chargement des films.</p>`;
  } finally {
    loader.style.display = 'none';
  }
});

// Toutes les Séries (listing complet via endpoint dédié)
btnSeries?.addEventListener('click', async () => {
  setActiveButton(btnSeries);
  resetFilters({ keepQuery: false });
  clearResults();

  try {
    loader.style.display = 'block';
    const res = await fetch('https://api.nayzcine.fr/api/all-tv');
    if (!res.ok) throw new Error(`API all-tv indisponible (${res.status})`);
    const { tmdbIds } = await res.json();
    const parsed = normalizeIdList(tmdbIds).filter(x => !x.type || x.type === 'tv');
    if (parsed.length === 0) {
      resultsContainer.innerHTML = `<p class="suggestion-message">Aucune série trouvée.</p>`;
    } else {
      for (const { type, id } of parsed.slice(0, 48)) {
        const d = await fetchDetailsWithHint(type || 'tv', id);
        if (d) await createCard(d);
      }
    }
  } catch (err) {
    console.error('[Toutes les Séries]', err);
    resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors du chargement des séries.</p>`;
  } finally {
    loader.style.display = 'none';
  }
});

// Suggestions (même pipeline que la recherche filtrée)
btnSuggestion.addEventListener('click', async () => {
  setActiveButton(btnSuggestion);
  resetFilters({ keepQuery: false });
  clearResults();
  loader.style.display = 'block';

  try {
    const userId = await getUserId();
    if (!userId) {
      resultsContainer.innerHTML = `
        <div style="grid-column:1/-1; justify-self:center; margin-top:10vh; text-align:center;">
          <p style="font-size:1.2rem;margin-bottom:1.5rem;">
            Veuillez créer un compte pour avoir vos propres suggestions.
          </p>
          <button id="goLogin" class="btn-login-empty">Se connecter / S'inscrire</button>
        </div>`;
      document.getElementById('goLogin')?.addEventListener('click', () => {
        window.location.href = '/accueil/compte/connexion/connexion.html';
      });
      return;
    }

    const { data: profile, error } = await supabase
      .from('profile_genres')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    const prefSlugs = getPreferenceSlugs(profile);

    if (!prefSlugs.length) {
      resultsContainer.innerHTML = `<p class="suggestion-message">Regardez quelques films/séries pour activer les suggestions personnalisées.</p>`;
      return;
    }

    // ✅ Applique les préférences comme si l’utilisateur avait coché les filtres
    activeFilters.mediaType = 'multi';     // films + séries
    activeFilters.genres    = prefSlugs;

    // UI visuelle des tags (optionnel)
    genreTags.forEach(tag => {
      const tmdbId = tag.dataset.value;           // ex: "27"
      const slug   = GENRE_SLUG_MAP[tmdbId];      // ex: "horror"
      if (slug && prefSlugs.includes(slug)) tag.classList.add('active');
      else tag.classList.remove('active');
    });
    mediaTags.forEach(t => t.classList.remove('active')); // 'multi'

    // 🔁 Réutilise exactement la même logique que la recherche avec filtres
    await fetchAndDisplaySearch({ query: '' });
  } catch (err) {
    console.error('[Suggestion]', err);
    resultsContainer.innerHTML = `<p class="suggestion-message">Erreur lors du chargement des suggestions personnalisées.</p>`;
  } finally {
    loader.style.display = 'none';
  }
});

// Prochainement (alias : on peut réutiliser last_added)
btnProchainement?.addEventListener('click', async () => {
  setActiveButton(btnProchainement);
  resetFilters({ keepQuery: false });
  await fetchAndDisplayRecentAdded();
});

// ================================
// Initialisation — rien sélectionné, afficher récemment ajoutés
// ================================
document.addEventListener('DOMContentLoaded', async ()=>{
  await initDisplayId();
  setActiveButton(null);               // aucun bouton actif visuellement
  await fetchAndDisplayRecentAdded();  // affiche "Récemment ajoutés" par défaut
});
