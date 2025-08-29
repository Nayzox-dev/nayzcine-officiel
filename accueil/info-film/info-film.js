// /accueil/info-film/info-film.js
// ================================================
// === IMPORT & INIT SUPABASE CLIENT =============
// ================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL      = 'https://zkxyutfbebbrmxybkmhy.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpreHl1dGZiZWJicm14eWJrbWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNDkwMTksImV4cCI6MjA2NTgyNTAxOX0.GPlNoHjfXLv7M4NOXbKH8OLVuACiCfnRXLDc6PiYVCk'
const supabase          = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ================================================
// === CONST TMDB & URL PARAMS ====================
// ================================================
const apiKey = '138e0046e0279e97e3c3034ff083446e'
const params = new URLSearchParams(window.location.search)
const itemId = params.get('id')
let mediaType = params.get('type') // 'movie' ou 'tv'

if (!itemId) {
  document.body.innerHTML = "<p style='color:white;text-align:center;'>ID manquant dans l'URL.</p>"
  throw new Error("ID manquant")
}
if (!mediaType || (mediaType !== 'movie' && mediaType !== 'tv')) {
  mediaType = null
}

const IMG_BASE     = 'https://image.tmdb.org/t/p/'
const FALLBACK_IMG = '/assets/remplace-image-down.png'

const TMDB_GENRE_NAME_MAP = {
  28:  'genre_action',
  12:  'genre_aventure',
  16:  'genre_animation',
  35:  'genre_comedie',
  80:  'genre_policier',
  99:  'genre_documentaire',
  18:  'genre_drame',
  10751: 'genre_famille',
  14:  'genre_fantastique',
  36:  'genre_histoire',
  27:  'genre_horreur',
  10402: 'genre_musique',
  9648:  'genre_mystere',
  10749: 'genre_romance',
  878:   'genre_sciencefiction',
  10759: 'genre_action_aventure',
  10762: 'genre_enfants',
  10764: 'genre_telerealite',
  10765: 'genre_sf_fantastique',
  10766: 'genre_soap',
  37:    'genre_western'
};

// ================================================
// === UTILES =====================================
// ================================================
function formatDate(str) {
  if (!str) return 'Date inconnue'
  return new Date(str).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
}

function getCookie(name) {
  const match = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)')
  return match ? decodeURIComponent(match.pop()) : ''
}

async function getUserId() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (!error && user) return user.id
  } catch {}
  const cookieUid = getCookie('user_id')
  if (cookieUid) return cookieUid
  console.error('Pas d’utilisateur connecté ni cookie user_id')
  return null
}

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

async function getFirstPlayableEpisode(tvId) {
  try {
    const res = await fetch(`https://api.nayzcine.fr/api/all/sheet/episodes?tmdbId=${tvId}`);
    if (!res.ok) throw new Error("API episodes non dispo");
    const json = await res.json();

    const seasons = json?.data?.items || [];
    if (!seasons.length) {
      return { season: 1, episode: 1, runTime: 0, title: "" };
    }

    const firstSeason = seasons[0];
    const firstEp = firstSeason.episodes?.[0];
    if (!firstEp) {
      return {
        season: firstSeason.number,
        episode: 1,
        runTime: 0,
        title: firstSeason.name || ""
      };
    }

    return {
      season: firstSeason.number,
      episode: firstEp.number,
      runTime: Math.round((firstEp.runtimeInSeconds || 0) / 60),
      title: firstEp.name || ""
    };
  } catch (e) {
    console.error("Erreur getFirstPlayableEpisode:", e);
    return { season: 1, episode: 1, runTime: 0, title: "" };
  }
}

// ================================================
// === WATCHLIST SUPABASE ========================
// ================================================
async function isInWatchlist(id, type) {
  const userId = await getUserId()
  if (!userId) return false
  const { data, error } = await supabase
    .from('watchlist').select('id')
    .eq('user_id', userId)
    .eq('media_id', id)
    .eq('media_type', type)
  if (error) {
    console.error('Erreur check watchlist :', error)
    return false
  }
  return data.length > 0
}

async function updateWatchlistButton() {
  const btn   = document.getElementById('btn-watchlist')
  const icon  = btn.querySelector('i')
  const label = btn.querySelector('span')
  const inWL  = await isInWatchlist(itemId, mediaType)
  if (inWL) {
    label.textContent = 'Retirer de ma Watchlist'
    icon?.classList?.replace('fa-plus', 'fa-minus')
  } else {
    label.textContent = 'Ajouter à ma Watchlist'
    icon?.classList?.replace('fa-minus', 'fa-plus')
  }
}

async function toggleWatchlist() {
  const userId = await getUserId()
  if (!userId) {
    alert('Vous devez être connecté pour gérer votre Watchlist.')
    return
  }
  const inWL = await isInWatchlist(itemId, mediaType)
  if (inWL) {
    const { error } = await supabase
      .from('watchlist').delete()
      .eq('user_id', userId)
      .eq('media_id', itemId)
      .eq('media_type', mediaType)
    if (error) console.error('Erreur suppression Watchlist :', error)
  } else {
    const { error } = await supabase
      .from('watchlist').insert([{
        user_id:    userId,
        media_id:   parseInt(itemId, 10),
        media_type: mediaType
      }])
    if (error) console.error('Erreur ajout Watchlist :', error)
  }
  await updateWatchlistButton()
}

// ================================================
// === TMDB : DÉTAILS, SIMILAR, CREDITS, TRAILER ==
// ================================================
async function getDetails(id, forcedType) {
  if (forcedType === 'movie' || forcedType === 'tv') {
    const res = await fetch(`https://api.themoviedb.org/3/${forcedType}/${id}?api_key=${apiKey}&language=fr-FR`)
    if (res.ok) {
      mediaType = forcedType
      return res.json()
    }
    throw new Error(`Aucune donnée trouvée pour l'ID ${id} de type ${forcedType}`)
  } else {
    let res = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${apiKey}&language=fr-FR`)
    if (res.ok) { mediaType = 'movie'; return res.json() }
    res = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${apiKey}&language=fr-FR`)
    if (res.ok) { mediaType = 'tv'; return res.json() }
    throw new Error(`Aucune donnée trouvée pour l'ID ${id}`)
  }
}

async function loadSimilar(id, type) {
  const ep = type==='tv' ? `/3/tv/${id}/similar` : `/3/movie/${id}/similar`
  const res = await fetch(`https://api.themoviedb.org${ep}?api_key=${apiKey}&language=fr-FR`)
  const { results } = await res.json()
  const container = document.getElementById('similar-content')
  container.innerHTML = `<h2>${type==='tv'?'Séries':'Films'} similaires</h2><div class="card-grid"></div>`
  const grid = container.querySelector('.card-grid')
  results.forEach(item => {
    const name = type==='tv'? item.name: item.title
    const img  = item.poster_path? `${IMG_BASE}w300${item.poster_path}`: FALLBACK_IMG
    const card = document.createElement('div')
    card.className = 'card-film'
    card.innerHTML = `
      <img src="${img}" alt="${name}" onerror="this.src='${FALLBACK_IMG}'"/>
      <span>${name}</span>
    `
    card.onclick = () => {
      window.location.href = `/accueil/info-film/info-film.html?id=${item.id}&type=${type}`
    }
    grid.appendChild(card)
  })
}

async function loadCredits(id, type) {
  const ep   = type==='tv'? `/3/tv/${id}/credits`: `/3/movie/${id}/credits`
  const res  = await fetch(`https://api.themoviedb.org${ep}?api_key=${apiKey}&language=fr-FR`)
  const data = await res.json()
  const container = document.getElementById('casting-content')
  container.innerHTML = '<h2>Distribution & Équipe</h2>'
  const castGrid = document.createElement('div')
  castGrid.className = 'card-grid'
  data.cast.forEach(a => {
    const img = a.profile_path? `${IMG_BASE}w300${a.profile_path}`: FALLBACK_IMG
    const card = document.createElement('div')
    card.className = 'card-actor'
    card.innerHTML = `
      <img src="${img}" alt="${a.name}" onerror="this.src='${FALLBACK_IMG}'"/>
      <span><strong>${a.name}</strong><br><small>${a.character}</small></span>
    `
    card.onclick = () => {
      window.location.href = `/accueil/info-prod/info-prod.html?id=${a.id}`
    }
    castGrid.appendChild(card)
  })
  container.appendChild(castGrid)
  const departments = {}
  data.crew.forEach(m => {
    (departments[m.department] ||= []).push(m)
  })
  Object.entries(departments).forEach(([dept, members]) => {
    const h3 = document.createElement('h3')
    h3.textContent = dept
    h3.style.marginTop = '30px'
    container.appendChild(h3)
    const grid = document.createElement('div')
    grid.className = 'card-grid'
    members.forEach(p => {
      const img = p.profile_path? `${IMG_BASE}w300${p.profile_path}`: FALLBACK_IMG
      const card = document.createElement('div')
      card.className = 'card-actor'
      card.innerHTML = `
        <img src="${img}" alt="${p.name}" onerror="this.src='${FALLBACK_IMG}'"/>
        <span><strong>${p.name}</strong><br><small>${p.job}</small></span>
      `
      card.onclick = () => {
        window.location.href = `/accueil/info-prod/info-prod.html?id=${p.id}`
      }
      grid.appendChild(card)
    })
    container.appendChild(grid)
  })
}

async function loadTrailer(id, type) {
  const ep = type==='tv'? `/3/tv/${id}/videos`: `/3/movie/${id}/videos`
  let res = await fetch(`https://api.themoviedb.org${ep}?api_key=${apiKey}&language=fr-FR`)
  let { results } = await res.json()
  if (!results.length) {
    res = await fetch(`https://api.themoviedb.org${ep}?api_key=${apiKey}`)
    ;({ results } = await res.json())
  }
  const tr = results.find(v=>v.type==='Trailer'&&v.site==='YouTube'&&['fr','FR'].includes(v.iso_639_1))
          || results.find(v=>v.type==='Trailer'&&v.site==='YouTube')
  const c = document.getElementById('trailer-content')
  c.innerHTML = tr
    ? `<h2>Bande-annonce</h2>
       <iframe width="100%" height="480" style="border-radius:12px;"
         src="https://www.youtube.com/embed/${tr.key}" frameborder="0" allowfullscreen></iframe>`
    : `<p style="color:white;">Aucune bande-annonce disponible.</p>`
}

// ================================================
// === SAISONS / ÉPISODES (TV) ===================
// ================================================
async function loadSeasons(id) {
  try {
    const res = await fetch(`https://api.nayzcine.fr/api/all/sheet/episodes?tmdbId=${id}`);
    if (!res.ok) throw new Error("API episodes non dispo");
    const json = await res.json();

    const seasons = json?.data?.items || [];
    const container = document.getElementById('seasons-content');
    container.innerHTML = '<h2>Saisons</h2>';

    for (const s of seasons) {
      const div = document.createElement('div');
      div.className = 'season';
      div.innerHTML = `<h3>${s.name || 'Saison ' + s.number}</h3><div class="card-grid"></div>`;
      const grid = div.querySelector('.card-grid');

      for (const ep of s.episodes || []) {
        const img = ep.poster || FALLBACK_IMG;
        const card = document.createElement('div');
        card.className = 'card-film';
        card.innerHTML = `
          <img src="${img}" alt="${ep.name}" onerror="this.src='${FALLBACK_IMG}'"/>
          <span>${ep.name}</span>`;

        card.addEventListener('click', async () => {
          const userId = await getUserId();
          const duration = Math.round((ep.runtimeInSeconds || 0) / 60);

          if (userId) {
            try {
              const { data: existing, error: selErr } = await supabase
                .from('user_progress')
                .select('id')
                .eq('user_id', userId)
                .eq('media_id', Number(id))
                .eq('season', s.number)
                .eq('episode', ep.number)
                .maybeSingle();

              if (!selErr && !existing) {
                const { error: insErr } = await supabase.from('user_progress').insert([{
                  user_id: userId,
                  media_id: Number(id),
                  genre: null,
                  is_movie: false,
                  season: s.number,
                  episode: ep.number,
                  time_watched: 0,
                  total_duration: duration
                }]);
                if (insErr) console.error('Erreur insert user_progress (TV):', insErr);
              } else if (selErr) {
                console.error('Erreur select user_progress (TV):', selErr);
              }
            } catch (e) {
              console.error('Exception TV progress insert:', e);
            }
          }

          const dataToSend = {
            id: Number(id),
            type: 'tv',
            saison: s.number,
            episode: ep.number,
            title: ep.name
          };
          sessionStorage.setItem('nayzcine-current', JSON.stringify(dataToSend));
          window.location.href = '/accueil/lecteur/lecteur.html';
        });

        grid.appendChild(card);
      }

      container.appendChild(div);
    }
  } catch (err) {
    console.error("Erreur loadSeasons:", err);
    const container = document.getElementById('seasons-content');
    container.innerHTML = '<p style="color:white;">Impossible de charger les saisons.</p>';
  }
}

// ================================================
// === LOAD FILM & WATCHLIST =====================
// ================================================
async function loadFilm() {
  try {
    const d = await getDetails(itemId, mediaType);

    // Titre
    document.getElementById('title').textContent = mediaType === 'tv' ? d.name : d.title;

    // Résumé
    document.getElementById('overview').textContent = d.overview;

    // Tags dynamiques
    const infoTags = document.getElementById('infoTags');
    infoTags.innerHTML = '';

    const year = mediaType === 'tv'
      ? new Date(d.first_air_date).getFullYear()
      : new Date(d.release_date).getFullYear();

    const durationText = mediaType === 'movie' && d.runtime
      ? `${d.runtime} min`
      : null;

    const tags = [
      mediaType === 'tv' ? 'SÉRIE' : 'FILM',
      `⭐ ${d.vote_average.toFixed(1)}/10`,
      year,
      durationText
    ];

    tags.filter(Boolean).forEach(text => {
      const tag = document.createElement('div');
      tag.className = 'tag';
      tag.textContent = text;
      infoTags.appendChild(tag);
    });

    // Poster
    const posterEl = document.getElementById('poster');
    posterEl.src = d.poster_path ? `${IMG_BASE}w500${d.poster_path}` : FALLBACK_IMG;
    posterEl.onerror = () => posterEl.src = FALLBACK_IMG;

    // Fond
    const bgEl = document.getElementById('bg');
    bgEl.style.backgroundImage = d.backdrop_path
      ? `url(${IMG_BASE}original${d.backdrop_path})`
      : `url(${FALLBACK_IMG})`;

    // Genres (bulles)
    const genreTags = document.getElementById('genreTags');
    genreTags.innerHTML = '';
    if (d.genres && Array.isArray(d.genres)) {
      d.genres.forEach(g => {
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.textContent = g.name;
        genreTags.appendChild(tag);
      });
    }

    // Bouton Watchlist
    const btnWL = document.getElementById('btn-watchlist');
    btnWL.addEventListener('click', toggleWatchlist);
    await updateWatchlistButton();

    // Bouton Saisons (TV uniquement)
    const btnSeasons = document.getElementById('btn-seasons');
    if (mediaType === 'tv') {
      btnSeasons.style.display = 'inline-block';
      loadSeasons(itemId);
    } else {
      btnSeasons.style.display = 'none';
    }

    // Sections dynamiques
    loadSimilar(itemId, mediaType);
    loadCredits(itemId, mediaType);
    loadTrailer(itemId, mediaType);

  } catch (err) {
    console.error('Erreur loadFilm:', err);
    document.body.innerHTML = "<p style='color:white;text-align:center;'>Erreur de chargement ou ID TMDB inconnu</p>";
  }
}

// ================================================
// === DÉMARRAGE & INIT ONGLETS ===================
// ================================================
loadFilm()

function initTabs() {
  const tabs     = document.querySelectorAll('.film-tabs .tab')
  const contents = document.querySelectorAll('.film-tab-content')
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      contents.forEach(c => c.style.display = 'none')
      tab.classList.add('active')
      const key = tab.id.replace('btn-', '')
      const toShow = document.getElementById(`${key}-content`)
      if (toShow) toShow.style.display = 'block'
    })
  })
}
window.addEventListener('DOMContentLoaded', initTabs)

// ================================================
// === OUVERTURE LECTEUR (FILM / TV) =============
// ================================================
document.getElementById('btn-watch').addEventListener('click', async () => {
  try {
    const d = await getDetails(itemId, mediaType);
    const userId = await getUserId();

    // ------- FILM : insert conditionnel puis go lecteur -------
    if (mediaType === 'movie') {
      const genreId = d.genres?.[0]?.id;
      const genre = genreId ? TMDB_GENRE_NAME_MAP[genreId] || null : null;
      const duration = d.runtime || 0;

      if (userId) {
        try {
          const { data: existing, error: selErr } = await supabase
            .from('user_progress')
            .select('id')
            .eq('user_id', userId)
            .eq('media_id', Number(itemId))
            .is('season', null)
            .is('episode', null)
            .maybeSingle();

          let inserted = false;
          if (!selErr && !existing) {
            const { error: insErr } = await supabase.from('user_progress').insert([{
              user_id: userId,
              media_id: Number(itemId),
              genre,
              is_movie: true,
              season: null,
              episode: null,
              time_watched: 0,
              total_duration: duration
            }]);
            if (!insErr) inserted = true; else console.error('Erreur insert user_progress (film):', insErr);

            if (inserted && Array.isArray(d.genres)) {
              const updates = {};
              d.genres.forEach(g => { const col = TMDB_GENRE_NAME_MAP[g.id]; if (col) updates[col] = 1; });
              if (Object.keys(updates).length) {
                const { error: rpcErr } = await supabase.rpc('increment_profile_genres', { uid: userId, updates });
                if (rpcErr) console.error('Erreur increment_profile_genres (film):', rpcErr);
              }
            }
          } else if (selErr) {
            console.error('Erreur select user_progress (film):', selErr);
          }
        } catch(e) { console.error('Exception film progress insert:', e); }
      }

      const dataToSend = {
        id: Number(itemId),
        type: 'movie',
        genres: Array.isArray(d.genres) ? d.genres.map(g => g.id) : [],
        title: d.title
      };
      sessionStorage.setItem('nayzcine-current', JSON.stringify(dataToSend));
      window.location.href = '/accueil/lecteur/lecteur.html';
      return;
    }

    // ------- SÉRIE : aller directement au dernier épisode entamé ou au premier jouable -------
    if (mediaType === 'tv') {
      let targetSeason = null, targetEpisode = null, targetDuration = 0, showTitle = d.name;

      if (userId) {
        const { data: rows, error } = await supabase
          .from('user_progress')
          .select('season,episode,updated_at,total_duration')
          .eq('user_id', userId)
          .eq('media_id', Number(itemId))
          .eq('is_movie', false);

        if (!error && Array.isArray(rows) && rows.length) {
          const best = pickBestTvRow(rows);
          targetSeason  = Number(best.season ?? 1);
          targetEpisode = Number(best.episode ?? 1);
          targetDuration = Number(best.total_duration ?? 0);
        }
      }

      if (targetSeason == null || targetEpisode == null) {
        const first = await getFirstPlayableEpisode(itemId);
        targetSeason  = first.season;
        targetEpisode = first.episode;
        targetDuration = first.runTime || 0;
        showTitle = first.title || showTitle;

        if (userId) {
          try {
            const { data: existing, error: selErr } = await supabase
              .from('user_progress')
              .select('id')
              .eq('user_id', userId)
              .eq('media_id', Number(itemId))
              .eq('season', targetSeason)
              .eq('episode', targetEpisode)
              .maybeSingle();

            if (!selErr && !existing) {
              const genreId = d.genres?.[0]?.id;
              const genreCol = genreId ? TMDB_GENRE_NAME_MAP[genreId] || null : null;

              const { error: insErr } = await supabase.from('user_progress').insert([{
                user_id: userId,
                media_id: Number(itemId),
                genre: genreCol,
                is_movie: false,
                season: targetSeason,
                episode: targetEpisode,
                time_watched: 0,
                total_duration: targetDuration
              }]);
              if (insErr) console.error('Erreur insert user_progress (TV init):', insErr);

              // increment genres uniquement si insertion
              if (!insErr && Array.isArray(d.genres)) {
                const updates = {};
                d.genres.forEach(g => { const col = TMDB_GENRE_NAME_MAP[g.id]; if (col) updates[col] = 1; });
                if (Object.keys(updates).length) {
                  const { error: rpcErr } = await supabase.rpc('increment_profile_genres', { uid: userId, updates });
                  if (rpcErr) console.error('Erreur increment_profile_genres (TV init):', rpcErr);
                }
              }
            } else if (selErr) {
              console.error('Erreur select user_progress (TV init):', selErr);
            }
          } catch(e) { console.error('Exception TV init insert:', e); }
        }
      }

      const dataToSend = {
        id: Number(itemId),
        type: 'tv',
        saison: targetSeason,
        episode: targetEpisode,
        title: showTitle
      };
      sessionStorage.setItem('nayzcine-current', JSON.stringify(dataToSend));
      window.location.href = '/accueil/lecteur/lecteur.html';
    }

  } catch (err) {
    console.error('Erreur lors de l’ouverture du lecteur :', err);
  }
});
