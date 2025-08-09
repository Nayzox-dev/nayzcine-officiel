// /accueil/parametres/parametres.js
(() => {
  /* ================== HELPERS ================== */
  const $ = sel => document.querySelector(sel);

  function getCookie(name){
    return document.cookie
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith(name + '='))?.split('=')[1] || null;
  }

  function setCookie(name, value, maxAgeSec = 60 * 60 * 24 * 365){
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSec}; Secure; SameSite=Strict`;
  }

  function showLoader(on){
    const loader = $('#save-loader');
    if(loader) loader.hidden = !on;
  }

  function showStatus(msg, ok = true){
    const box = $('#save-status');
    if(!box) return;
    box.hidden = false;
    box.textContent = msg;
    box.classList.remove('ok','err');
    box.classList.add(ok ? 'ok' : 'err');
  }

  function hideStatus(){
    const box = $('#save-status');
    if(box) box.hidden = true;
  }

  /* ================== TABS ================== */
  function initTabs(){
    const tabs = document.querySelectorAll('.menu-button');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => {
          const selected = t === tab;
          t.classList.toggle('active', selected);
          t.setAttribute('aria-selected', selected);
          const panel = document.getElementById(t.getAttribute('aria-controls'));
          if(panel) panel.hidden = !selected;
        });
      });
    });
  }

  /* ================== LOAD ACCOUNT DATA ================== */
  async function loadAccountData(){
    const pseudoInput = $('#pseudo');
    const emailInput  = $('#email');
    if(!pseudoInput || !emailInput) return;

    // pseudo depuis cookie
    const cookiePseudo = getCookie('user_name');
    if(cookiePseudo) pseudoInput.value = decodeURIComponent(cookiePseudo);

    // rendre éditable
    pseudoInput.readOnly = false;
    pseudoInput.disabled = false;
    pseudoInput.style.pointerEvents = 'auto';

    const userId = getCookie('user_id');
    if(!userId){
      console.warn('user_id absent dans les cookies.');
      return;
    }

    if(!window.supabaseClient){
      console.error('Supabase non initialisé.');
      return;
    }

    try{
      // récup email par user_id
      const { data, error } = await window.supabaseClient
        .from('user_accounts')          // adapte si tu as renommé
        .select('email')
        .eq('user_id', userId)
        .single();

      if(error){
        console.error('Erreur récup email:', error);
        return;
      }
      if(data?.email) emailInput.value = data.email;
    }catch(e){
      console.error('Exception loadAccountData:', e);
    }
  }

  /* ================== SAVE PSEUDO ================== */
  function initSavePseudo(){
    const btn = $('#save-pseudo');
    const pseudoInput = $('#pseudo');
    if(!btn || !pseudoInput) return;

    btn.addEventListener('click', async () => {
      hideStatus();
      const newPseudo = pseudoInput.value.trim();

      if(!newPseudo){
        showStatus('Pseudo vide.', false);
        return;
      }

      const userId = getCookie('user_id');
      if(!userId){
        showStatus('user_id manquant.', false);
        return;
      }
      if(!window.supabaseClient){
        showStatus('Supabase non initialisé.', false);
        return;
      }

      const oldPseudo = decodeURIComponent(getCookie('user_name') || '');
      if(oldPseudo === newPseudo){
        showStatus('Aucun changement.', true);
        return;
      }

      btn.disabled = true;
      showLoader(true);

      try{
        // Vérif pseudo déjà pris
        const { data: taken, error: checkErr } = await window.supabaseClient
          .from('user_accounts')
          .select('user_id')
          .eq('pseudo', newPseudo)
          .neq('user_id', userId)
          .maybeSingle();

        if(checkErr){
          showLoader(false);
          showStatus('Erreur vérif pseudo.', false);
          btn.disabled = false;
          return;
        }
        if(taken){
          showLoader(false);
          showStatus('Pseudo déjà utilisé.', false);
          btn.disabled = false;
          return;
        }

        // Update
        const { error: updErr } = await window.supabaseClient
          .from('user_accounts')
          .update({ pseudo: newPseudo })
          .eq('user_id', userId);

        if(updErr){
          showLoader(false);
          showStatus("Erreur lors de l'enregistrement.", false);
        }else{
          setCookie('user_name', newPseudo);
          localStorage.setItem('nayz_pseudo', newPseudo);

          // garde le loader 2s puis cache-le, aucun message
          setTimeout(() => {
            showLoader(false);
          }, 2000);
        }
      }catch(e){
        showLoader(false);
        showStatus('Exception: ' + e.message, false);
      }finally{
        btn.disabled = false;
      }
    });
  }

  /* ================== PREMIUM LINKS ================== */
  function initPlans(){
    // Si tu veux juste rediriger via JS et garder <button>
    const urls = {
      basique: 'https://buy.stripe.com/00w4gA5qb9LH7TE7tGbfO00',
      avance:  'https://buy.stripe.com/8x29AU8CnaPLgqadS4bfO01',
      ultime:  'https://buy.stripe.com/9B67sM9Gr8HDgqa01ebfO02'
    };

    document.querySelectorAll('.plan-cta').forEach(btn => {
      btn.addEventListener('click', () => {
        const plan = btn.closest('.plan-card')?.dataset.plan;
        const target = urls[plan] || '/checkout.html?plan=' + encodeURIComponent(plan || '');
        window.location.href = target;
      });
    });
  }

  /* ================== INIT ================== */
  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadAccountData();
    initSavePseudo();
    initPlans();
  });
})();

// === CONFIGURATION (active/désactive le flou) ===
const DISABLE_PREMIUM_PLANS = true;  // Mets à false pour réactiver les plans

function togglePlansAvailability(disabled) {
  document.querySelectorAll('.plan-card').forEach(card => {
    card.style.filter = disabled ? 'blur(4px)' : 'none';
    card.style.pointerEvents = disabled ? 'none' : 'auto';
    card.style.userSelect = disabled ? 'none' : 'auto';
  });

  document.querySelectorAll('.plan-cta').forEach(btn => {
    btn.disabled = disabled;
  });

  // Changement du texte selon l'état
  const premiumText = document.querySelector('.premium-text');
  if (premiumText) {
    premiumText.textContent = disabled 
      ? 'Plan premium en développement'
      : 'Choisissez un plan premium qui vous convient :';
  }
}

// Applique le flou et le texte selon la configuration
document.addEventListener('DOMContentLoaded', () => {
  togglePlansAvailability(DISABLE_PREMIUM_PLANS);
});
