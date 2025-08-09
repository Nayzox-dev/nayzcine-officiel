// navbar.js

// Récupération d'un cookie
function getCookie(name) {
  return document.cookie
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(name + '='))?.split('=')[1] || null;
}

window.addEventListener('DOMContentLoaded', () => {
  const loginBtn  = document.querySelector('.btn-login');
  const avatarEl  = document.getElementById('account-logo');
  const menuEl    = document.getElementById('account-menu');
  const logoutBtn = document.getElementById('logout-button');

  const pseudo = getCookie('user_name');

  // Affichage bouton / avatar
  if (pseudo) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (avatarEl) {
      const initial = decodeURIComponent(pseudo).trim().charAt(0).toUpperCase() || '?';
      avatarEl.textContent = initial;
      avatarEl.style.display = 'flex';
    }
  } else {
    if (avatarEl) avatarEl.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'flex';
  }

  if (!avatarEl || !menuEl) {
    console.warn('navbar.js : élément manquant (#account-logo ou #account-menu).');
    return;
  }

  // Ouverture/Fermeture menu
  avatarEl.addEventListener('click', e => {
    e.stopPropagation();
    menuEl.classList.toggle('show');
    menuEl.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    if (menuEl.classList.contains('show')) {
      menuEl.classList.replace('show', 'hidden');
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menuEl.classList.contains('show')) {
      menuEl.classList.replace('show', 'hidden');
    }
  });

  // Déconnexion : suppression des cookies + reload
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      // On ne supprime que ceux qu'on utilise
      ['user_name'].forEach(key => {
        document.cookie = `${key}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      });
      window.location.reload();
    });
  }
});
