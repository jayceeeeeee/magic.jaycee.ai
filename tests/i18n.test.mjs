export async function runI18nTests({ runtime, i18nSource, styles }) {
  const assert = (value, label) => { if (!value) throw new Error(`i18n: ${label}`); };
  const stored = new Map();
  const isolated = storage => new Function('globalThis', 'document', 'FR', `${i18nSource}; return { getLanguage, setLanguage, t };`)(storage, undefined, FR);
  const env = { localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) } };
  const firstPage = isolated(env);
  assert(firstPage.getLanguage() === 'fr', 'French must be the initial default');
  firstPage.setLanguage('en');
  assert(isolated(env).getLanguage() === 'en', 'an explicit English preference must be restored');
  firstPage.setLanguage('fr');
  assert(isolated(env).getLanguage() === 'fr', 'language was not restored on the next page');
  firstPage.setLanguage('xx');
  assert(firstPage.getLanguage() === 'fr', 'unsupported language did not fall back to French');
  const blocked = isolated({ get localStorage() { throw new Error('blocked'); } });
  assert(blocked.getLanguage() === 'fr', 'blocked storage must default to French');
  blocked.setLanguage('fr');
  assert(blocked.t('Save') === 'Enregistrer', 'blocked storage prevented in-memory language selection');

  const fixture = document.createElement('section');
  fixture.innerHTML = '<p data-i18n>Continue</p><input placeholder="Your full name" data-i18n-attrs="placeholder"><button data-i18n-attrs="aria-label" aria-label="Open account"></button>';
  const picker = createLanguagePicker();
  fixture.append(picker);
  document.body.append(fixture);
  translateTree(fixture);
  const input = fixture.querySelector('input');
  input.value = 'My unfinished form';
  const actualAccountInput = document.querySelector('.is-character [name=username]');
  const draft = actualAccountInput?.value;
  const select = picker.querySelector('select');
  select.value = 'fr';
  select.dispatchEvent(new Event('change'));
  assert(document.documentElement.lang === 'fr', 'document language was not changed');
  assert(fixture.querySelector('p').textContent === 'Continuer', 'static copy did not translate');
  assert(input.placeholder === 'Votre nom complet', 'placeholder did not translate');
  assert(fixture.querySelector('button').getAttribute('aria-label') === 'Ouvrir le compte', 'accessible label did not translate');
  assert(input.value === 'My unfinished form', 'language change lost typed content');
  assert(!actualAccountInput || actualAccountInput === document.querySelector('.is-character [name=username]') && actualAccountInput.value === draft, 'language change rebuilt an account form');
  assert(localStorage.getItem(LANGUAGE_KEY) === 'fr', 'selection was not persisted');

  let recorded = 0;
  const skillName = '<img src=x onerror=alert(1)> Save';
  const panel = runtime.createVitalsPanel({
    activeModels: [], publicProfiles: [],
    notifications: {
      definitions: [{ id: 'test', stage: 'guest', title: 'Quest', content: { text: 'In the meantime practice {skillOneName} if you don\'t want to lose your account.' } }],
      receipt() {}, record() { recorded++; }
    }, sounds: { play() {} }
  });
  fixture.append(panel);
  assert(panel.querySelector('.profile-notice-title').textContent.includes('Quête'), 'notification title did not translate');
  assert(panel.querySelector('.profile-notice-copy').textContent.includes('votre première compétence'), 'notification template/fallback did not translate');
  const skillPanel = runtime.createSkillPanel({
    passiveModel: { skill: { label: 'Save', description: skillName } }, activeModels: [], ultimateModel: null,
    currentLevel: 0, selectedIndex: 0
  });
  fixture.append(skillPanel);
  assert(skillPanel.querySelector('[data-skill-index]').textContent === 'Save', 'a player skill name was translated');
  assert(skillPanel.querySelector('.profile-skill-description').textContent === skillName, 'a player description was altered');
  assert(!skillPanel.querySelector('img'), 'player text was interpreted as HTML');
  const personalized = runtime.createVitalsPanel({
    activeModels: [{ skillLabel: skillName }], publicProfiles: [],
    playerProfile: { id: 'user', username: 'Save' }, activeMasterProfile: { id: 'master' },
    notifications: {
      definitions: [{ id: 'test-personalized', stage: 'linked_master', title: 'Quest', content: { text: 'In the meantime practice {skillOneName} if you don\'t want to lose your account.' } }],
      receipt() {}, record() { recorded++; }
    }, sounds: { play() {} }
  });
  fixture.append(personalized);
  assert(personalized.querySelector('.profile-notice-copy em').textContent === skillName, 'notification changed a player skill name');
  assert(!personalized.querySelector('.profile-notice-copy img'), 'notification interpolated player content as HTML');

  setLanguage('en');
  assert(fixture.querySelector('p').textContent === 'Continue', 'return to English failed');
  assert(panel.querySelector('.profile-notice-title').textContent.includes('Quest'), 'notification did not return to English');
  assert(panel.querySelector('.profile-notice-copy').textContent.includes('your first skill'), 'notification fallback did not return to English');
  assert(panel.querySelector('.profile-vital-name').textContent.startsWith('Health'), 'health label with a lock did not return to English');
  assert(recorded === 0, 'changing language recorded notification actions');
  const status = document.createElement('p'); fixture.append(status);
  setText(status, 'Practice could not be saved. Keep this page open and reconnect to retry.');
  window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_KEY, newValue: 'fr' }));
  // Real storage events arrive after storage has already changed in the other tab.
  localStorage.setItem(LANGUAGE_KEY, 'fr');
  window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_KEY, newValue: 'fr' }));
  assert(getLanguage() === 'fr' && select.value === 'fr', 'another tab did not update the selector');
  assert(status.textContent.startsWith('La pratique'), 'an existing error message did not translate');
  const userContent = document.createElement('div');
  userContent.dataset.playerContent = '';
  userContent.innerHTML = '<span data-i18n>Save</span>';
  fixture.append(userContent);
  translateTree(userContent);
  assert(userContent.textContent === 'Save', 'translation markers inside player Markdown were applied');

  // Exercise the actual HUD styles at narrow mobile and desktop widths.
  for (const width of [320, 390, 1280]) {
    const frame = document.createElement('iframe');
    frame.style.cssText = `width:${width}px;height:200px;border:0`;
    fixture.append(frame);
    const doc = frame.contentDocument;
    doc.body.className = 'has-account-panel';
    const style = doc.createElement('style'); style.textContent = styles; doc.head.append(style);
    doc.body.append(document.querySelector('[data-account-shell]').cloneNode(true));
    const donate = doc.querySelector('.donate-hud-trigger').getBoundingClientRect();
    const language = doc.querySelector('.language-picker').getBoundingClientRect();
    const account = doc.querySelector('[data-account-toggle]').getBoundingClientRect();
    const flag = doc.querySelector('.language-picker > span svg').getBoundingClientRect();
    assert(Math.abs(flag.top + flag.height / 2 - language.top - language.height / 2) < 0.5, `flag is not vertically centered at ${width}px`);
    const arrow = frame.contentWindow.getComputedStyle(doc.querySelector('.language-picker'), '::after');
    assert(arrow.top === `${(language.height - 2) / 2}px` && arrow.transform === 'matrix(1, 0, 0, 1, 0, -4)', `arrow is not vertically centered at ${width}px`);
    assert(language.left >= donate.right && language.right < account.left && language.height >= 34, `HUD controls overlap at ${width}px`);
    assert(doc.documentElement.scrollWidth <= width, `HUD overflows at ${width}px`);
    frame.remove();
  }
  setLanguage('en');
  assert(t('An unknown server message') === 'An unknown server message', 'missing translations must preserve original copy');
  fixture.remove();
  localStorage.removeItem(LANGUAGE_KEY);
}
