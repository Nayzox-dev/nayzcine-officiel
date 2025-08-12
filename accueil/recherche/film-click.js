// film-click.js

document.addEventListener('DOMContentLoaded', () => {
  const resultsContainer = document.getElementById('results');
  if (!resultsContainer) return;

  // Délègue les clics sur les .card pour récupérer l'ID TMDB et le media type
  resultsContainer.addEventListener('click', e => {
    const card = e.target.closest('.card');
    if (!card) return;

    const tmdbId    = card.dataset.tmdbId;
    const mediaType = card.dataset.mediaType; // 'movie' ou 'tv'
    if (!tmdbId || !mediaType) return;

    // Construit l’URL vers info-film.html en injectant id + type
    const detailUrl = new URL(
      window.location.origin +
      '/accueil/info-film/info-film.html'
    );
    detailUrl.searchParams.set('id', tmdbId);
    detailUrl.searchParams.set('type', mediaType);

    // Redirige vers la page de détail
    window.location.href = detailUrl.toString();
  });
});
