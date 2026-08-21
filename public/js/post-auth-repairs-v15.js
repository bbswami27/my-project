'use strict';

// GitPit v1.0.7 stability baseline.
// IMPORTANT: The v1.0.4-v1.0.6 repair bundle is temporarily disabled because
// loading all repair modules immediately after authentication caused the main
// chat UI to become unresponsive on Android WebView. The original app remains
// fully interactive; repair modules will be re-enabled one at a time after
// device verification so the exact conflicting module can be identified.
(function installPostAuthRepairsV15(){
  function loadModules(){
    console.log('[POST AUTH REPAIRS] disabled in v1.0.7 stability baseline');
    return Promise.resolve(false);
  }

  window.GitPitLoadPostAuthRepairs = loadModules;
})();
