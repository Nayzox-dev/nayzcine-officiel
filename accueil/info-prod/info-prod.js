// /accueil/info-prod/info-prod.js
document.addEventListener('DOMContentLoaded', () => {
  const apiKey      = '138e0046e0279e97e3c3034ff083446e';
  const IMG_BASE    = 'https://image.tmdb.org/t/p/';
  const FALLBACK_IMG = 'https://via.placeholder.com/300x450?text=Image+absente';

  // 1) Récupère l'ID dans l'URL
  const params   = new URLSearchParams(window.location.search);
  const personId = params.get('id');
  if (!personId) {
    document.body.innerHTML = `<p style="color:white;text-align:center;margin-top:50px;">
      Erreur : ID de la personne manquant dans l’URL
    </p>`;
    return;
  }

  // Sélecteurs DOM
  const profileImg = document.querySelector('.profile-pic img');
  const nameDOM    = document.querySelector('.content h1');
  const bioDOM     = document.querySelector('.biography-title')?.nextElementSibling;
  const timeline   = document.querySelector('.timeline');
  const infoSpans  = document.querySelectorAll('.info-section span:last-child');
  const aliasDOM   = document.querySelector('.info-section:nth-of-type(4)');

  // Helpers
  function formatDate(str) {
    if (!str) return "Date inconnue";
    const d = new Date(str);
    const age = new Date().getFullYear() - d.getFullYear();
    return `${d.toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })} (${age} ans)`;
  }

  function groupByYear(credits) {
    const map = {};
    credits.forEach(c => {
      const date = c.release_date || c.first_air_date;
      if (!date) return;
      const year = new Date(date).getFullYear();
      (map[year] || (map[year]=[])).push(c);
    });
    return Object.entries(map).sort((a,b)=> b[0]-a[0]);
  }

  function makeCredit(c) {
    const title = c.title||c.name;
    const role  = c.character||"Rôle inconnu";
    const div   = document.createElement('div');
    div.className = 'timeline-credits';
    div.innerHTML = `<strong>${title}</strong>
                     <span class="role">Interprétant <em>${role}</em></span>`;
    return div;
  }

  // 2) Charge et affiche les données
  async function load() {
    try {
      // -- Détails de la personne
      const resD = await fetch(`https://api.themoviedb.org/3/person/${personId}`
        + `?api_key=${apiKey}&language=fr-FR`);
      if (!resD.ok) throw new Error("Impossible de récupérer les détails");
      const details = await resD.json();

      // -- Crédits combinés
      const resC = await fetch(`https://api.themoviedb.org/3/person/${personId}`
        + `/combined_credits?api_key=${apiKey}&language=fr-FR`);
      if (!resC.ok) throw new Error("Impossible de récupérer la filmographie");
      const { cast: credits } = await resC.json();

      // Remplissage DOM
      nameDOM.textContent    = details.name || "Nom inconnu";
      bioDOM.innerHTML       = details.biography || "Biographie non disponible.";
      profileImg.src         = details.profile_path
                                ? `${IMG_BASE}w300${details.profile_path}`
                                : FALLBACK_IMG;
      profileImg.onerror     = () => profileImg.src = FALLBACK_IMG;

      // Info sections : genre (sexe), naissance, lieu, alias
      const [ genreEl, birthEl, placeEl ] = infoSpans;
      genreEl.textContent = details.gender === 1 ? "Femme" : "Homme";
      birthEl.textContent = formatDate(details.birthday);
      placeEl.textContent = details.place_of_birth || "Inconnu";

      // Alias
      aliasDOM.innerHTML = details.also_known_as.length
        ? details.also_known_as.map(a=>`<span>${a}</span>`).join('')
        : `<span>—</span>`;

      // Filmographie par année
      timeline.innerHTML = '';
      groupByYear(credits).forEach(([year, arr])=>{
        const yearDiv = document.createElement('div');
        yearDiv.className = 'timeline-year';
        yearDiv.textContent = `${year} — ${arr.length} crédit${arr.length>1?'s':''}`;
        arr.forEach(c => yearDiv.appendChild(makeCredit(c)));
        timeline.appendChild(yearDiv);
      });

    } catch(err) {
      console.error(err);
      document.body.innerHTML = `<p style="color:white;text-align:center;margin-top:50px;">
        Erreur : ${err.message}
      </p>`;
    }
  }

  load();
});
