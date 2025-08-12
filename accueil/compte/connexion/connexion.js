// /accueil/compte/connexion/connexion.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabase = createClient(
  'https://zkxyutfbebbrmxybkmhy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpreHl1dGZiZWJicm14eWJrbWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNDkwMTksImV4cCI6MjA2NTgyNTAxOX0.GPlNoHjfXLv7M4NOXbKH8OLVuACiCfnRXLDc6PiYVCk'
);

// ============ UTILS ============
const qs = selector => document.querySelector(selector);

function setCookie(key, value) {
  const oneYearSeconds = 60 * 60 * 24 * 365;
  document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${oneYearSeconds}; Secure; SameSite=Strict`;
}

function showError(message) {
  const box = qs('#errorMsg');
  box.innerText = message;
  box.style.display = 'block';
  gsap.to(box, { color: '#ff2333', scale: 1.09, duration: 0.13, yoyo: true, repeat: 1 });
}

function shake(element) {
  gsap.fromTo(
    element,
    { x: 0 },
    {
      x: -18,
      duration: 0.09,
      yoyo: true,
      repeat: 5,
      ease: 'power1.inOut',
      onComplete: () => gsap.to(element, { x: 0, duration: 0.08 })
    }
  );
}

function persistSession(pseudo, userId) {
  setCookie('user_name', pseudo);
  setCookie('user_id', userId);
  localStorage.setItem('nayz_pseudo', pseudo);
}

// ============ ANIMATIONS ============
window.addEventListener('DOMContentLoaded', () => {
  gsap.to('.logo',         { opacity: 1, y: 0, scale: 1, duration: 0.9,  delay: 0.17, ease: 'expo.out' });
  gsap.to('.input',        { opacity: 1, y: 0, scale: 1, duration: 0.82, stagger: 0.14, delay: 0.35, ease: 'power2.out' });
  gsap.to('.forgot-link',  { opacity: 1, y: 0, scale: 1, duration: 0.7,  delay: 0.7,  ease: 'expo.out' });
  gsap.to('.btn',          { opacity: 1, y: 0, scale: 1, duration: 0.82, delay: 0.85, ease: 'back.out(1.7)' });
  gsap.to('.register-link',{ opacity: 1, y: 0, scale: 1, duration: 0.75, delay: 1.1,  ease: 'expo.out' });
});

// ============ LOGIN HANDLER ============
qs('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const form    = e.currentTarget;
  const raw     = qs('#username').value.trim();
  const pass    = qs('#password').value.trim();
  const errBox  = qs('#errorMsg');
  errBox.style.display = 'none';

  if (!raw || !pass) {
    showError('Remplis tous les champs.');
    shake(form);
    return;
  }

  // Determine email: either direct or lookup by pseudo
  let email = raw;
  if (!raw.includes('@')) {
    const { data: row, error: lookupErr } = await supabase
      .from('user_accounts')
      .select('email')
      .eq('pseudo', raw)
      .maybeSingle();

    if (lookupErr || !row?.email) {
      showError('Pseudo introuvable.');
      shake(form);
      return;
    }
    email = row.email;
  }

  // Supabase auth
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email,
    password: pass
  });

  if (authErr || !authData?.user) {
    showError('Identifiants incorrects.');
    shake(form);
    return;
  }

  const userId = authData.user.id;

  // Fetch pseudo for this user
  const { data: userRow, error: userErr } = await supabase
    .from('user_accounts')
    .select('pseudo')
    .eq('user_id', userId)
    .single();

  if (userErr || !userRow?.pseudo) {
    showError('Erreur lors du chargement du pseudo.');
    return;
  }

  // Persist session
  persistSession(userRow.pseudo, userId);

  // Success animation + redirect
  gsap.to(form, {
    scale: 1.07,
    filter: 'blur(1px)',
    duration: 0.25,
    yoyo: true,
    repeat: 1,
    onComplete: () => {
      window.location.href = '/accueil/compte/redirection/redirection.html';
    }
  });
});

// ============ MOT DE PASSE OUBLIÉ ============
const modalBg     = qs('#modalBg');
const forgotLink  = qs('#forgotAnim');
const closeModal  = qs('#closeModal');
const forgotBtn   = qs('#forgotBtn');
const forgotEmail = qs('#forgotEmail');
const forgotErr   = qs('#forgotError');
const forgotOk    = qs('#forgotSuccess');

forgotLink.addEventListener('click', () => {
  modalBg.classList.add('open');
  gsap.to('.modal', { opacity: 1, y: 0, scale: 1, duration: 0.48, ease: 'expo.out', delay: 0.08 });
  forgotEmail.value = '';
  forgotErr.style.display = 'none';
  forgotOk.style.display = 'none';
  setTimeout(() => forgotEmail.focus(), 250);
});

closeModal.addEventListener('click', () => modalBg.classList.remove('open'));
modalBg.addEventListener('click', e => { if (e.target === modalBg) modalBg.classList.remove('open'); });

forgotBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  const mail = forgotEmail.value.trim();
  forgotErr.style.display = 'none';
  forgotOk.style.display  = 'none';

  if (!mail) {
    forgotErr.innerText = 'Saisis ton email.';
    forgotErr.style.display = 'block';
    shake(forgotErr);
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(mail, {
    redirectTo: `${window.location.origin}/accueil/compte/resetpasword/resetpasword.html`
  });

  if (error) {
    forgotErr.innerText = 'Erreur, vérifie l\'email.';
    forgotErr.style.display = 'block';
    shake(forgotErr);
  } else {
    forgotOk.innerText = 'Un mail de réinitialisation a été envoyé !';
    forgotOk.style.display = 'block';
    forgotEmail.value = '';
  }
});

forgotEmail.addEventListener('keydown', e => {
  if (e.key === 'Enter') forgotBtn.click();
});
