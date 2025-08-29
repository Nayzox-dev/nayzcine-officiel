// /accueil/compte/resetpasword/resetpasword.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabase = createClient(
  'https://zkxyutfbebbrmxybkmhy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpreHl1dGZiZWJicm14eWJrbWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNDkwMTksImV4cCI6MjA2NTgyNTAxOX0.GPlNoHjfXLv7M4NOXbKH8OLVuACiCfnRXLDc6PiYVCk'
);

// ----------- UTILS -----------
const qs = sel => document.querySelector(sel);

function showError(msg, form = null) {
  const box = qs('#errorMsg');
  box.innerText = msg;
  box.style.display = 'block';
  if (form) {
    gsap.fromTo(form, { x: 0 }, {
      x: -16,
      duration: 0.09,
      yoyo: true,
      repeat: 5,
      ease: 'power1.inOut',
      onComplete: () => gsap.to(form, { x: 0, duration: 0.08 })
    });
  }
  gsap.fromTo(box, { scale: 1 }, {
    scale: 1.09,
    color: '#ff2333',
    duration: 0.13,
    yoyo: true,
    repeat: 1
  });
}

function shake(el) {
  gsap.fromTo(el, { x: 0 }, {
    x: -18,
    duration: 0.09,
    yoyo: true,
    repeat: 5,
    ease: 'power1.inOut',
    onComplete: () => gsap.to(el, { x: 0, duration: 0.08 })
  });
}

// ----------- ANIMATIONS -----------
window.addEventListener('DOMContentLoaded', () => {
  gsap.to('.logo',         { opacity: 1, y: 0, scale: 1, duration: 0.9,  delay: 0.17, ease: 'expo.out' });
  gsap.to('#subtitleAnim', { opacity: 1, y: 0, scale: 1, duration: 0.9,  delay: 0.35, ease: 'expo.out' });
  gsap.to('.input',        { opacity: 1, y: 0, scale: 1, duration: 0.82, stagger: 0.14, delay: 0.41, ease: 'power2.out' });
  gsap.to('.btn',          { opacity: 1, y: 0, scale: 1, duration: 0.82, delay: 0.9,  ease: 'back.out(1.7)' });
});

// ----------- HANDLER RESET FORM -----------
qs('#resetForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const form            = e.currentTarget;
  const newPassword     = qs('#newPassword').value.trim();
  const confirmPassword = qs('#confirmPassword').value.trim();

  // front-end validations
  if (!newPassword || !confirmPassword) {
    showError('Tous les champs sont obligatoires.', form);
    return;
  }
  if (newPassword.length < 6) {
    showError('Le mot de passe doit faire au moins 6 caractères.', form);
    return;
  }
  if (newPassword !== confirmPassword) {
    showError('Les mots de passe ne correspondent pas.', form);
    gsap.to('#confirmPassword', { background: '#ff233388', duration: 0.13, yoyo: true, repeat: 1 });
    return;
  }

  // call Supabase to update password; Supabase uses the reset token in URL automatically
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    showError('Erreur : ' + error.message, form);
    shake(form);
  } else {
    // succès → rediriger vers la page de connexion
    gsap.to(form, {
      scale: 1.07,
      filter: 'blur(1px)',
      duration: 0.35,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        window.location.href = '/accueil/compte/connexion/connexion.html';
      }
    });
  }
});

// ----------- UTIL : showError défini ci‑dessus -----------
