(() => {
  'use strict';

  const read = (key, fallback) => {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value === 'true';
    } catch { return fallback; }
  };
  const preferences = window.STARFIGHTER_SETTINGS = {
    reducedMotion: read('starfighterReducedMotion', window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false),
    clearCombat: read('starfighterClearCombat', false),
    collisionGuide: read('starfighterCollisionGuide', false)
  };
  const dialog = document.querySelector('#flight-deck');
  const apply = () => {
    document.documentElement.classList.toggle('reduced-motion', preferences.reducedMotion);
    document.documentElement.classList.toggle('clear-combat', preferences.clearCombat);
  };
  for (const [id, key, storage] of [
    ['reduced-motion', 'reducedMotion', 'starfighterReducedMotion'],
    ['clear-combat', 'clearCombat', 'starfighterClearCombat'],
    ['collision-guide', 'collisionGuide', 'starfighterCollisionGuide']
  ]) {
    const input = document.getElementById(id);
    input.checked = preferences[key];
    input.addEventListener('change', () => {
      preferences[key] = input.checked;
      try { localStorage.setItem(storage, String(input.checked)); } catch {
        document.querySelector('#display-status').textContent = 'Preference active for this tab. Browser storage is unavailable.';
      }
      apply();
    });
  }
  document.querySelectorAll('[data-flight-deck]').forEach(button => button.addEventListener('click', () => {
    window.dispatchEvent(new Event('flightdeckopen'));
    dialog.showModal();
  }));
  document.querySelector('#deck-close').addEventListener('click', () => dialog.close());
  const fullscreen = document.querySelector('#fullscreen-btn');
  fullscreen.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      document.querySelector('#display-status').textContent = 'Fullscreen is unavailable in this browser. Try F11 in a desktop browser.';
    }
  });
  document.addEventListener('fullscreenchange', () => {
    fullscreen.textContent = document.fullscreenElement ? 'LEAVE FULLSCREEN' : 'ENTER FULLSCREEN';
  });
  if (!document.documentElement.requestFullscreen) fullscreen.hidden = true;
  apply();
})();
