// /accueil/parametres/parametres.js
// ==========================================================
// NAYZCINE – PARAMÈTRES (JS)
// - Onglets animés (WAAPI + CSS classes existantes)
// - Chargement compte (cookies + Supabase)
// - Enregistrement pseudo (vérif unicité + toast)
// - Plans premium (CTA + mode "en développement")
// - Micro-interactions : ripples, hover 3D, transitions panel
// - Respecte prefers-reduced-motion
// ==========================================================
(() => {
  /* ===================== HELPERS ===================== */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const EASE = 'cubic-bezier(.22,.61,.36,1)';

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
    if(!loader) return;
    loader.hidden = !on;
    if(on && !prefersReduced()){
      loader.animate([{opacity:0},{opacity:1}], {duration:150, fill:'both', easing:EASE});
    }
  }

  function showStatus(msg, ok = true){
    const box = $('#save-status');
    if(!box) return;
    box.hidden = false;
    box.textContent = msg;
    box.classList.remove('ok','err');
    box.classList.add(ok ? 'ok' : 'err');

    // Micro-anim d’apparition
    if(!prefersReduced()){
      box.animate(
        [{opacity:0, transform:'translateY(4px)'},{opacity:1, transform:'translateY(0)'}],
        {duration:200, easing:EASE, fill:'both'}
      );
    }

    // Toast flottant non intrusif (duplicata court)
    toast(msg, ok ? 'success' : 'error');
  }

  function hideStatus(){
    const box = $('#save-status');
    if(!box || box.hidden) return;
    if(!prefersReduced()){
      const anim = box.animate(
        [{opacity:1, transform:'translateY(0)'},{opacity:0, transform:'translateY(4px)'}],
        {duration:160, easing:EASE, fill:'forwards'}
      );
      anim.onfinish = () => (box.hidden = true);
    } else {
      box.hidden = true;
    }
  }

  // Toast minimaliste (créé à la volée)
  function ensureToastHost(){
    let host = $('#toast-host');
    if(!host){
      host = document.createElement('div');
      host.id = 'toast-host';
      Object.assign(host.style, {
        position:'fixed', left:'50%', bottom:'22px', transform:'translateX(-50%)',
        display:'flex', flexDirection:'column', gap:'8px', zIndex:'9999', pointerEvents:'none'
      });
      document.body.appendChild(host);
    }
    return host;
  }

  function toast(message, type = 'info'){
    const host = ensureToastHost();
    const el = document.createElement('div');
    const bg = type === 'success' ? 'rgba(61,219,118,.12)'
              : type === 'error'   ? 'rgba(255,82,82,.12)'
              : 'rgba(255,255,255,.08)';
    const bd = type === 'success' ? 'rgba(61,219,118,.35)'
              : type === 'error'   ? 'rgba(255,82,82,.35)'
              : 'rgba(255,255,255,.18)';
    const col= '#eef2f6';

    Object.assign(el.style, {
      pointerEvents:'auto',
      padding:'10px 14px',
      borderRadius:'12px',
      backdropFilter:'blur(8px)',
      background:bg,
      border:`1px solid ${bd}`,
      color:col,
      font:'600 14px/1.2 Inter, system-ui, sans-serif',
      boxShadow:'0 8px 22px rgba(0,0,0,.28), inset 0 0 0 1px rgba(255,255,255,.06)',
      whiteSpace:'pre-wrap',
      maxWidth:'min(84vw, 520px)'
    });
    el.textContent = message;
    host.appendChild(el);

    if(!prefersReduced()){
      el.animate(
        [{opacity:0, transform:'translateY(6px) scale(.98)'},{opacity:1, transform:'translateY(0) scale(1)'}],
        {duration:220, easing:EASE, fill:'both'}
      );
    }

    // Auto-hide
    setTimeout(() => {
      if(!prefersReduced()){
        const a = el.animate(
          [{opacity:1, transform:'translateY(0) scale(1)'},{opacity:0, transform:'translateY(6px) scale(.98)'}],
          {duration:200, easing:EASE, fill:'forwards'}
        );
        a.onfinish = () => el.remove();
      } else {
        el.remove();
      }
    }, 2200);
  }

  // Ripple bouton (sans CSS externe)
  function addRipple(e){
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const d = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - d/2;
    const y = e.clientY - rect.top  - d/2;

    const circle = document.createElement('span');
    Object.assign(circle.style, {
      position:'absolute', left:`${x}px`, top:`${y}px`,
      width:`${d}px`, height:`${d}px`, borderRadius:'50%',
      background:'radial-gradient(circle, rgba(255,255,255,.35) 0%, rgba(255,255,255,0) 60%)',
      transform:'scale(0)', opacity:'0.7', pointerEvents:'none', mixBlendMode:'screen'
    });
    btn.appendChild(circle);

    const finish = () => circle.remove();
    if(prefersReduced()){ finish(); return; }

    circle.animate(
      [{transform:'scale(0)', opacity:.7},{transform:'scale(1)', opacity:0}],
      {duration:450, easing:'linear', fill:'forwards'}
    ).onfinish = finish;
  }

  // Transition douce d’un panel → un autre
  function switchPanel(panelToShow, panels){
    panels.forEach(p => {
      if(p === panelToShow){
        p.hidden = false;
        if(!prefersReduced()){
          p.animate(
            [{opacity:0, transform:'translateY(6px)'},{opacity:1, transform:'translateY(0)'}],
            {duration:220, easing:EASE, fill:'both'}
          );
        }
      } else if(!p.hidden){
        if(!prefersReduced()){
          const a = p.animate(
            [{opacity:1, transform:'translateY(0)'},{opacity:0, transform:'translateY(6px)'}],
            {duration:160, easing:EASE, fill:'forwards'}
          );
          a.onfinish = () => (p.hidden = true);
        } else {
          p.hidden = true;
        }
      }
    });
  }

  // Hover 3D subtil sur boutons latéraux
  function addTilt(el){
    let raf = null;
    function onMove(e){
      if(raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width/2;
        const cy = r.top  + r.height/2;
        const dx = (e.clientX - cx) / (r.width/2);
        const dy = (e.clientY - cy) / (r.height/2);
        el.style.transform = `perspective(700px) rotateX(${(-dy*4).toFixed(2)}deg) rotateY(${(dx*6).toFixed(2)}deg) translateY(-2px)`;
      });
    }
    function reset(){
      el.style.transform = '';
    }
    el.addEventListener('mousemove', e => !prefersReduced() && onMove(e));
    el.addEventListener('mouseleave', () => !prefersReduced() && reset());
  }

  /* ===================== TABS ===================== */
  function initTabs(){
    const tabs   = $$('.menu-button');
    const panels = $$('[role="tabpanel"]');

    tabs.forEach(tab => {
      // ripple + tilt
      tab.style.position = 'relative';
      tab.style.overflow = 'hidden';
      tab.addEventListener('click', addRipple);
      addTilt(tab);

      tab.addEventListener('click', () => {
        tabs.forEach(t => {
          const selected = t === tab;
          t.classList.toggle('active', selected);
          t.setAttribute('aria-selected', String(selected));
        });

        const targetId = tab.getAttribute('aria-controls');
        const panel = targetId ? document.getElementById(targetId) : null;
        if(panel) switchPanel(panel, panels);
      });
    });

    // Au chargement, afficher le panel du bouton actif
    const initial = $('.menu-button.active') || tabs[0];
    if(initial){
      const targetId = initial.getAttribute('aria-controls');
      panels.forEach(p => p.hidden = p.id !== targetId);
    }
  }

  /* ===================== LOAD ACCOUNT DATA ===================== */
  async function loadAccountData(){
    const pseudoInput = $('#pseudo');
    const emailInput  = $('#email');
    if(!pseudoInput || !emailInput) return;

    // Pseudo depuis cookie
    const cookiePseudo = getCookie('user_name');
    if(cookiePseudo) pseudoInput.value = decodeURIComponent(cookiePseudo);

    // Passer éditable
    pseudoInput.readOnly = false;
    pseudoInput.disabled = false;
    pseudoInput.style.pointerEvents = 'auto';

    // Focus anim
    setTimeout(() => pseudoInput.focus({preventScroll:true}), 120);

    const userId = getCookie('user_id');
    if(!userId){
      console.warn('user_id absent dans les cookies.');
      showStatus('Utilisateur non connecté.', false);
      return;
    }

    if(!window.supabaseClient){
      console.error('Supabase non initialisé.');
      showStatus('Supabase non initialisé.', false);
      return;
    }

    try{
      const { data, error } = await window.supabaseClient
        .from('user_accounts')
        .select('email')
        .eq('user_id', userId)
        .single();

      if(error){
        console.error('Erreur récup email:', error);
        showStatus('Impossible de récupérer votre email.', false);
        return;
      }
      if(data?.email) {
        emailInput.value = data.email;
        // petit flash vert discret
        if(!prefersReduced()){
          emailInput.animate(
            [{boxShadow:'0 0 0 0 rgba(61,219,118,.0)'},{boxShadow:'0 0 0 3px rgba(61,219,118,.18)'},{boxShadow:'0 0 0 0 rgba(61,219,118,.0)'}],
            {duration:900, easing:'ease', fill:'both'}
          );
        }
      }
    }catch(e){
      console.error('Exception loadAccountData:', e);
      showStatus('Erreur inattendue.', false);
    }
  }

  /* ===================== SAVE PSEUDO ===================== */
  function initSavePseudo(){
    const btn = $('#save-pseudo');
    const pseudoInput = $('#pseudo');
    if(!btn || !pseudoInput) return;

    // ripple sur le bouton
    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.addEventListener('click', addRipple);

    btn.addEventListener('click', async e => {
      hideStatus();
      const newPseudo = pseudoInput.value.trim();

      if(!newPseudo){
        showStatus('Pseudo vide.', false);
        bump(pseudoInput);
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
        softGlow(pseudoInput, 'ok');
        return;
      }

      // Anim press
      pressBtn(btn);

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
          wobble(btn);
          return;
        }
        if(taken){
          showLoader(false);
          showStatus('Pseudo déjà utilisé.', false);
          btn.disabled = false;
          wobble(pseudoInput);
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
          wobble(btn);
        }else{
          setCookie('user_name', newPseudo);
          localStorage.setItem('nayz_pseudo', newPseudo);

          // Feedback visuel de succès
          softGlow(pseudoInput, 'ok');
          showStatus('Pseudo mis à jour.', true);

          // garder le loader 2s puis cacher
          setTimeout(() => {
            showLoader(false);
          }, 2000);
        }
      }catch(e){
        showLoader(false);
        showStatus('Exception: ' + (e?.message || e), false);
        console.error(e);
      }finally{
        btn.disabled = false;
      }
    });
  }

  // Micro-anim bouton press
  function pressBtn(el){
    if(prefersReduced()) return;
    el.animate(
      [{transform:'translateY(0)'},{transform:'translateY(1px)'},{transform:'translateY(0)'}],
      {duration:120, easing:'ease-out', fill:'none'}
    );
  }

  // Wobble (erreur légère)
  function wobble(el){
    if(prefersReduced()) return;
    el.animate(
      [
        {transform:'translateX(0)'},
        {transform:'translateX(-4px)'},
        {transform:'translateX(4px)'},
        {transform:'translateX(-2px)'},
        {transform:'translateX(2px)'},
        {transform:'translateX(0)'}
      ],
      {duration:260, easing:'ease-in-out'}
    );
  }

  // Halo discret (succès / erreur)
  function softGlow(input, kind='ok'){
    if(prefersReduced()) return;
    const color = kind === 'ok' ? 'rgba(61,219,118,.20)' : 'rgba(255,82,82,.22)';
    input.animate(
      [{boxShadow:`0 0 0 0 ${color}`},{boxShadow:`0 0 0 4px ${color}`},{boxShadow:`0 0 0 0 ${color}`}],
      {duration:700, easing:'ease'}
    );
  }

  // Bump (pseudo vide)
  function bump(el){
    if(prefersReduced()) return;
    el.animate(
      [{transform:'scale(1)'},{transform:'scale(1.03)'},{transform:'scale(1)'}],
      {duration:160, easing:EASE}
    );
  }

  /* ===================== PREMIUM LINKS ===================== */
  function initPlans(){
    const urls = {
      basique: 'https://buy.stripe.com/00w4gA5qb9LH7TE7tGbfO00',
      avance:  'https://buy.stripe.com/8x29AU8CnaPLgqadS4bfO01',
      ultime:  'https://buy.stripe.com/9B67sM9Gr8HDgqa01ebfO02'
    };

    $$('.plan-cta').forEach(btn => {
      btn.style.position = 'relative';
      btn.style.overflow = 'hidden';
      btn.addEventListener('click', addRipple);
      btn.addEventListener('click', () => {
        const plan = btn.closest('.plan-card')?.dataset.plan;
        const target = urls[plan] || ('/checkout.html?plan=' + encodeURIComponent(plan || ''));
        window.location.href = target;
      });
    });
  }

  /* ===================== INIT ===================== */
  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadAccountData();
    initSavePseudo();
    initPlans();
  });
})();

/* ====== CONFIGURATION (mode "en développement") ====== */
const DISABLE_PREMIUM_PLANS = true;  // Mets à false pour réactiver les plans

function togglePlansAvailability(disabled) {
  const cards = document.querySelectorAll('.plan-card');
  const ctAs  = document.querySelectorAll('.plan-cta');
  const premiumText = document.querySelector('.premium-text');

  cards.forEach(card => {
    card.style.filter = disabled ? 'blur(4px) grayscale(12%)' : 'none';
    card.style.pointerEvents = disabled ? 'none' : 'auto';
    card.style.userSelect = disabled ? 'none' : 'auto';

    // voile animé pour indiquer "bientôt"
    let veil = card.querySelector('.soon-veil');
    if(disabled){
      if(!veil){
        veil = document.createElement('div');
        veil.className = 'soon-veil';
        Object.assign(veil.style, {
          position:'absolute', inset:'0', borderRadius:'inherit',
          background:'linear-gradient(120deg, transparent, rgba(255,255,255,.06), transparent)',
          transform:'translateX(-100%)',
          pointerEvents:'none'
        });
        card.appendChild(veil);
      }
      if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
        veil.animate(
          [{transform:'translateX(-100%)'},{transform:'translateX(100%)'}],
          {duration:1200, easing:'linear', iterations:Infinity}
        );
      }
    }else{
      if(veil) veil.remove();
    }
  });

  ctAs.forEach(btn => btn.disabled = disabled);

  if (premiumText) {
    premiumText.textContent = disabled
      ? 'Plan premium en développement'
      : 'Choisissez un plan premium qui vous convient :';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  togglePlansAvailability(DISABLE_PREMIUM_PLANS);
});
