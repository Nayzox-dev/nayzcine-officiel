// /accueil/watchlist/watchlist.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL      = 'https://zkxyutfbebbrmxybkmhy.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpreHl1dGZiZWJicm14eWJrbWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNDkwMTksImV4cCI6MjA2NTgyNTAxOX0.GPlNoHjfXLv7M4NOXbKH8OLVuACiCfnRXLDc6PiYVCk'
const supabase          = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const apiKey       = '138e0046e0279e97e3c3034ff083446e'
const IMG_BASE     = 'https://image.tmdb.org/t/p/'
const FALLBACK_IMG = '/assets/remplace-image-down.png'

// restaure la session Supabase à partir du cookie supabase_access_token
async function restoreSession() {
  const match = document.cookie.match('(^|;)\\s*supabase_access_token\\s*=\\s*([^;]+)')
  if (match) {
    const token = decodeURIComponent(match.pop())
    await supabase.auth.setAuth(token)
  }
}

// récupère l'UUID utilisateur depuis la session Supabase
async function getUserId() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id ?? null
}

// formate "YYYY-MM-DD" en "2 juillet 2025"
function formatDate(str) {
  if (!str) return ''
  return new Date(str).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
}

// affiche le message quand la watchlist est vide
function renderEmpty() {
  const c = document.getElementById('watchlist-container')
  c.innerHTML = `
    <p>Votre Watchlist est vide.</p>
    <p>La Watchlist vous permet de conserver tous les films et séries que vous souhaitez revoir plus tard.</p>
  `
}

// récupère les entrées de la table watchlist pour cet utilisateur
async function fetchWatchlist(userId) {
  const { data, error } = await supabase
    .from('watchlist')
    .select('media_id, media_type')
    .eq('user_id', userId)
  if (error) throw error
  return data
}

// récupère les détails TMDB pour une entrée
async function fetchDetails({ media_id, media_type }) {
  const base = media_type === 'tv'
    ? `https://api.themoviedb.org/3/tv/${media_id}`
    : `https://api.themoviedb.org/3/movie/${media_id}`
  const res = await fetch(`${base}?api_key=${apiKey}&language=fr-FR`)
  if (!res.ok) throw new Error('TMDB fetch failed')
  const json = await res.json()
  json.media_type = media_type
  return json
}

// affiche la grille de résultats
function renderGrid(items) {
  const container = document.getElementById('watchlist-container')
  container.innerHTML = ''
  if (items.length === 0) {
    renderEmpty()
    return
  }

  const grid = document.createElement('div')
  grid.className = 'card-grid'

  items.forEach(d => {
    const title   = d.media_type === 'tv' ? d.name : d.title
    const dateKey = d.media_type === 'tv' ? d.first_air_date : d.release_date
    let info      = formatDate(dateKey)

    if (d.media_type === 'tv') {
      info += ` • ${d.number_of_seasons} saison${d.number_of_seasons > 1 ? 's' : ''}`
    } else if (d.runtime) {
      const h = Math.floor(d.runtime / 60)
      const m = d.runtime % 60
      info += ` • ${h}h ${m}min`
    }

    const imgSrc = d.poster_path
      ? `${IMG_BASE}w300${d.poster_path}`
      : FALLBACK_IMG

    const badgeCls   = d.media_type === 'tv' ? 'serie' : 'film'
    const badgeLabel = d.media_type === 'tv' ? 'SÉRIE' : 'FILM'

    const item = document.createElement('div')
    item.className = 'card-item'

    item.innerHTML = `
      <div class="card-film">
        <img src="${imgSrc}" alt="${title}" />
        <div class="badge ${badgeCls}">${badgeLabel}</div>
        <div class="remove-badge" title="Retirer de la Watchlist">–</div>
      </div>
      <div class="card-details">
        <h3>${title}</h3>
        <p>${info}</p>
      </div>
    `

    // Navigation vers la fiche film/série
    item.onclick = () => {
      window.location.href = `/accueil/info-film/info-film.html?id=${d.id}&type=${d.media_type}`
    }

    // Suppression de la watchlist
    item.querySelector('.remove-badge')?.addEventListener('click', async (e) => {
      e.stopPropagation() // évite clic global sur la carte

      try {
        const userId = await getUserId()
        const { error } = await supabase
          .from('watchlist')
          .delete()
          .eq('user_id', userId)
          .eq('media_id', d.id)
          .eq('media_type', d.media_type)

        if (error) {
          console.error('Erreur Supabase delete:', error)
          alert("Impossible de retirer l'élément.")
        } else {
          loadWatchlist() // recharge après suppression
        }
      } catch (err) {
        console.error('Exception suppression:', err)
        alert("Erreur lors de la suppression.")
      }
    })

    grid.appendChild(item)
  })

  container.appendChild(grid)
}

// point d'entrée
async function loadWatchlist() {
  await restoreSession()
  const userId = await getUserId()
  // On suppose ici que l'utilisateur est connecté
  let entries = []
  try {
    entries = await fetchWatchlist(userId)
  } catch (e) {
    console.error('Erreur chargement Watchlist:', e)
    renderEmpty()
    return
  }
  const details = (await Promise.all(
    entries.map(e => fetchDetails(e).catch(() => null))
  )).filter(Boolean)
  renderGrid(details)
}

window.addEventListener('DOMContentLoaded', loadWatchlist)

