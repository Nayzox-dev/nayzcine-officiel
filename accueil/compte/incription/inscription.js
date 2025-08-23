// /accueil/compte/incription/inscription.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabase = createClient(
  'https://zkxyutfbebbrmxybkmhy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpreHl1dGZiZWJicm14eWJrbWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNDkwMTksImV4cCI6MjA2NTgyNTAxOX0.GPlNoHjfXLv7M4NOXbKH8OLVuACiCfnRXLDc6PiYVCk'
);

// ----------- UTILS -----------
const $ = sel => document.querySelector(sel);

function setCookie(key, value) {
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${oneYear}; Secure; SameSite=Strict`;
}

function persistIdentity(pseudo, userId) {
  setCookie('user_name', pseudo);
  setCookie('user_id', userId);
  localStorage.setItem('nayz_pseudo', pseudo);
}

function displayError(message, form = null) {
  const box = $('#errorMsg');
  box.innerText = message;
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
  gsap.fromTo(box, { scale: 1 }, { scale: 1.09, color: '#ff2333', duration: 0.13, yoyo: true, repeat: 1 });
}

// ----------- ANIMATION -----------
window.addEventListener('DOMContentLoaded', () => {
  gsap.to('.logo',       { opacity: 1, y: 0, scale: 1, duration: 0.9,  delay: 0.2, ease: 'expo.out' });
  gsap.to('.input',      { opacity: 1, y: 0, scale: 1, duration: 0.7,  stagger: 0.1, delay: 0.4, ease: 'power2.out' });
  gsap.to('.btn',        { opacity: 1, y: 0, scale: 1, duration: 0.75, delay: 0.8, ease: 'back.out(1.7)' });
  gsap.to('.login-link', { opacity: 1, y: 0, scale: 1, duration: 0.65, delay: 1.0, ease: 'expo.out' });
});

// ----------- INSCRIPTION -----------
$('#registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const form     = e.currentTarget;
  const pseudo   = $('#username').value.trim();
  const email    = $('#email').value.trim();
  const password = $('#password').value;
  const confirm  = $('#confirm').value;

  // front-end validations
  if (!pseudo || !email || !password || !confirm) {
    return displayError('Tous les champs sont requis.', form);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return displayError('Email invalide.', form);
  }
  if (password.length < 6) {
    return displayError('Mot de passe trop court.', form);
  }
  if (password !== confirm) {
    displayError('Les mots de passe ne correspondent pas.', form);
    gsap.to('#confirm', { background: '#ff233388', duration: 0.13, yoyo: true, repeat: 1 });
    return;
  }

  // check pseudo uniqueness
  const { data: existing, error: checkErr } = await supabase
    .from('user_accounts')
    .select('user_id')
    .eq('pseudo', pseudo)
    .maybeSingle();
  if (checkErr) {
    return displayError('Erreur lors de la vérification du pseudo.', form);
  }
  if (existing) {
    return displayError('Ce pseudo est déjà pris.', form);
  }

  // sign up in Auth
  const { data: auth, error: signErr } = await supabase.auth.signUp({ email, password });
  if (signErr || !auth?.user?.id) {
    return displayError(signErr?.message || "Erreur à l'inscription.", form);
  }

  const userId = auth.user.id;

  // insert user account
  let r = await supabase.from('user_accounts').insert([{ user_id: userId, pseudo, email }]);
  if (r.error) {
    return displayError("Erreur lors de l'enregistrement du compte.", form);
  }

  // init profile_genres
  r = await supabase.from('profile_genres').insert([{ user_id: userId }]);
  if (r.error) {
    return displayError("Erreur lors de la création des préférences.", form);
  }

  // create premium_subscriptions with explicit premium=false
  r = await supabase.from('premium_subscriptions').insert([{
    user_id: userId,
    premium: false,
    premium_start: null,
    premium_stop: null
  }]);
  if (r.error) {
    return displayError("Erreur lors de la création de l'abonnement premium.", form);
  }

  // persist session
  persistIdentity(pseudo, userId);

  // success animation + redirect
  gsap.to(form, {
    scale: 1.07,
    filter: 'blur(1.5px)',
    duration: 0.23,
    yoyo: true,
    repeat: 1,
    onComplete: () => {
      window.location.href = '/accueil/compte/redirection/redirection.html';
    }
  });
});
