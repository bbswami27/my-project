'use strict';

// GitPit v1.0.8 staged repair: enable ONLY contact-related modules after login.
// Other repair modules remain disabled so we can verify Android UI stability.
(function installPostAuthRepairsV15(){
  const MODULES = [
    'identity-routing-v2.js',
    'contact-refresh-privacy-v4.js',
    'contact-directory-v5.js'
  ];
  let loading = false;
  let loaded = false;

  function isAuthenticated(){
    const am = window.AuthManager;
    const overlay = document.getElementById('auth-overlay-modal');
    const overlayHidden = !overlay || overlay.style.display === 'none' || !overlay.classList.contains('active');
    const token = localStorage.getItem('gitpit_auth_token') || localStorage.getItem('chatterpatter_token');
    return !!(am && am.currentUser && token && overlayHidden);
  }

  async function loadModules(){
    if (loaded || loading || !isAuthenticated()) return false;
    loading = true;
    for (const name of MODULES) {
      if (document.querySelector(`script[data-gitpit-repair="${name}"]`)) continue;
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `js/${name}`;
        s.dataset.gitpitRepair = name;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`Failed to load ${name}`));
        document.body.appendChild(s);
      }).catch(err => console.error('[CONTACT STAGE]', err));
    }
    loaded = true;
    loading = false;
    console.log('[CONTACT STAGE] contacts-only repair loaded');
    return true;
  }

  document.addEventListener('DOMContentLoaded', () => setTimeout(loadModules, 500));
  window.addEventListener('gitpit-authenticated', loadModules);
  const timer = setInterval(() => {
    if (loaded) { clearInterval(timer); return; }
    loadModules();
  }, 1000);
  setTimeout(() => { if (!loaded) clearInterval(timer); }, 120000);

  window.GitPitLoadPostAuthRepairs = loadModules;
})();
