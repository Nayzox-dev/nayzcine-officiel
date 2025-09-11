// ==================== NAYZCINE – verif-compte.js (cookie + JWT + RLS) ====================
// Condition pour rester :
// - si cookie 'user_name' existe → toujours autorisé
// Sinon, il faut :
// 1) cookie 'user_id' présent (UUID v4)
// 2) un access_token Supabase en localStorage dont payload.sub === user_id
// 3) la ligne user_accounts visible via RLS avec ce token
// Sinon => redirection /accueil/compte/connexion/connexion.html
// ================================================================================

const SB_URL = 'https://zkxyutfbebbrmxybkmhy.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpreHl1dGZiZWJicm14eWJrbWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNDkwMTksImV4cCI6MjA2NTgyNTAxOX0.GPlNoHjfXLv7M4NOXbKH8OLVuACiCfnRXLDc6PiYVCk';
const PROJECT_REF = 'zkxyutfbebbrmxybkmhy';

function redirectLogin() {
  if (location.pathname !== '/accueil/compte/connexion/connexion.html') {
    location.replace('/accueil/compte/connexion/connexion.html');
  }
}
function isUUIDv4(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

// --- extraction cookie ---
function getCookie(name) {
  if (!document.cookie) return null;
  const target = name + '=';
  const parts = document.cookie.split(';');
  for (let p of parts) {
    p = p.trim();
    if (p.startsWith(target)) return decodeURIComponent(p.slice(target.length));
  }
  return null;
}

// --- JWT helpers ---
function base64urlToJSON(b64url) {
  try {
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    const str = atob(b64);
    return JSON.parse(decodeURIComponent(Array.prototype.map.call(str, c =>
      '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    ).join('')));
  } catch { return null; }
}
function decodeJwt(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  return base64urlToJSON(parts[1]) || null;
}

// Récupère un access_token dont payload.sub == userId
function findAccessTokenForUser(userId) {
  const exactKey = `sb-${PROJECT_REF}-auth-token`;
  const keys = new Set([exactKey]);

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && /^sb-.*-auth-token$/i.test(k)) keys.add(k);
  }

  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);

      const candidates = [];
      if (parsed?.currentSession?.access_token) candidates.push(parsed.currentSession.access_token);
      if (parsed?.access_token) candidates.push(parsed.access_token);
      if (parsed?.session?.access_token) candidates.push(parsed.session.access_token);

      for (const t of candidates) {
        const payload = decodeJwt(t);
        if (payload?.sub === userId) return t;
      }
    } catch { /* ignore */ }
  }
  return null;
}

async function validateUser(userId, accessToken, timeoutMs = 7000) {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `${SB_URL}/rest/v1/user_accounts?select=user_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${accessToken}`, // JWT utilisateur pour RLS
        Accept: 'application/json'
      },
      cache: 'no-store',
      signal: ctrl.signal
    });
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length === 1 && rows[0]?.user_id === userId;
  } catch {
    return false;
  } finally {
    clearTimeout(tm);
  }
}

// --- Guard avec cooldown ---
(async function () {
  if (location.pathname === '/accueil/compte/connexion/connexion.html') return;

  // cooldown de 2 secondes pour laisser le temps aux cookies/localStorage de se poser
  await new Promise(res => setTimeout(res, 2000));

  // priorité : si user_name existe, on autorise directement
  const userName = getCookie('user_name');
  if (userName && userName.trim() !== '') return;

  const userId = getCookie('user_id');
  if (!userId || !isUUIDv4(userId)) return redirectLogin();

  const token = findAccessTokenForUser(userId);
  if (!token) return redirectLogin();

  const ok = await validateUser(userId, token);
  if (!ok) return redirectLogin();
  // autorisé
})();
