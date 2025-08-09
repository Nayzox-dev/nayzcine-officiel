const apiKey          = '138e0046e0279e97e3c3034ff083446e';
const imageBaseUrl    = 'https://image.tmdb.org/t/p/w500';
const moviesContainer = document.getElementById('moviesContainer');
const btnFilms        = document.getElementById('btnFilms');
const btnSeries       = document.getElementById('btnSeries');

let currentType = 'movie'; // 'movie' ou 'tv'

// === Récupère détails TMDB pour un ID donné ===
async function fetchDetails(id) {
  // Essaye en tant que film
  let res = await fetch(
    `https://api.themoviedb.org/3/movie/${id}?api_key=${apiKey}&language=fr-FR`
  );
  if (res.ok) {
    const data = await res.json();
    data.media_type = 'movie';
    return data;
  }
  // Sinon en tant que série
  res = await fetch(
    `https://api.themoviedb.org/3/tv/${id}?api_key=${apiKey}&language=fr-FR`
  );
  if (res.ok) {
    const data = await res.json();
    data.media_type = 'tv';
    return data;
  }
  return null;
}

// === Récupère la liste top10 depuis ton API, puis affiche ===
// === Récupère la liste top10 depuis ton API, puis affiche ===
async function fetchAndDisplay(type) {
  const endpoint =
    type === 'movie'
      ? 'https://api.nayzcine.fr/api/top10-movies'
      : 'https://api.nayzcine.fr/api/top10-tv';

  try {
    const resp = await fetch(endpoint);
    if (!resp.ok) throw new Error(`API Nayzcine indisponible (${resp.status})`);
    const { tmdbIds } = await resp.json();

    // Récupère tous les détails (movie ou tv) en parallèle
    const detailsList = await Promise.all(
      tmdbIds.map((id) => fetchDetails(id))
    );

    // On remplace les éventuels nulls par un objet minimal
    const items = detailsList.map((d, i) => {
      if (d) return d;
      // fallback si fetchDetails a renvoyé null
      return {
        id: tmdbIds[i],
        media_type: type,
        poster_path: null,
        backdrop_path: null,
        overview: '',
        title: null,
        name: null
      };
    });

    displayItems(items, type);
  } catch (e) {
    moviesContainer.innerHTML = `
      <p style="color:#f44336; text-align:center; width:100%;">
        Impossible de charger les données.
      </p>`;
    console.error(e);
  }
}

// === Affiche les cartes + gestion du clic ===
function displayItems(items, type) {
  moviesContainer.innerHTML = '';

  items.forEach((item, index) => {
    const poster = item.poster_path
      ? imageBaseUrl + item.poster_path
      : 'https://via.placeholder.com/500x750?text=Pas+d\'image';
    const title = item.title || item.name || 'Titre inconnu';

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
        window.location.origin +
          '/accueil/info-film/info-film.html'
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
