// Fonction utilitaire pour lire un cookie spécifique
function getCookie(name) {
  const cookies = document.cookie.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith(name + '=')) {
      return decodeURIComponent(cookie.substring(name.length + 1));
    }
  }
  return null;
}

// Récupère le pseudo depuis le cookie 'user_name' ou localStorage si cookie manquant
let pseudo = getCookie('user_name');
if (!pseudo) {
  pseudo = localStorage.getItem('nayz_pseudo') || '';
}
document.getElementById('pseudoAnim').textContent = pseudo;

// Animations GSAP
window.addEventListener('DOMContentLoaded', () => {
  gsap.to('.checkmark', {
    opacity: 1,
    scale: 1,
    rotate: 0,
    duration: 0.53,
    delay: 0.05,
    ease: "back.out(2)"
  });
  gsap.to('.checkmark svg', {
    strokeDashoffset: 0,
    duration: 0.7,
    delay: 0.15,
    ease: "power3.out"
  });
  gsap.to('.title', {
    opacity: 1,
    y: 0,
    scale: 1,
    duration: 0.6,
    delay: 0.31,
    ease: "expo.out"
  });
  gsap.to('.pseudo', {
    opacity: 1,
    y: 0,
    scale: 1,
    duration: 0.46,
    delay: 0.43,
    ease: "expo.out"
  });
  gsap.to('.desc', {
    opacity: 1,
    y: 0,
    scale: 1,
    duration: 0.53,
    delay: 0.59,
    ease: "expo.out"
  });
  gsap.to('.btn-accueil', {
    opacity: 1,
    scale: 1,
    duration: 0.56,
    delay: 0.9,
    ease: "back.out(2)"
  });
});

// Redirection au clic
document.getElementById('btnAccueil').addEventListener('click', () => {
  // On ne supprime PAS les cookies, uniquement le localStorage
  localStorage.removeItem('nayz_pseudo');
  window.location.href = "/index.html";
});
