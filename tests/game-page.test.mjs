export const runGamePageTests = async ({ source, gameRules, mannaModel, questPending, normalizeUnit, html, styles }) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const skillColumns = gameRules.skills.map(skill => skill.skillColumn);
  const user = { id: 'player', created_at: '2026-01-01T00:00:00Z' };
  for (const { account, linked = false, username = '' } of [{ account: null }, { account: user }, { account: user, linked: true }, { account: null, username: 'Master' }]) {
    const frame = document.createElement('iframe');
    frame.style.width = '390px'; frame.style.height = '844px';
    document.body.append(frame);
    const doc = frame.contentDocument;
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    parsed.querySelectorAll('script').forEach(script => script.remove());
    doc.body.className = parsed.body.className;
    doc.body.innerHTML = parsed.body.innerHTML;
    const style = doc.createElement('style'); style.textContent = styles; doc.head.append(style);
    const win = Object.assign(new EventTarget(), {
      location: new URL(`https://example.test/game.html${username ? '?username=Master' : ''}`),
      localStorage: { getItem: () => null }, setInterval: () => 1, clearInterval() {},
      JayceeAuth: {
        getSession: async () => ({ data: { session: account ? { user: account } : null } }),
        getSupabaseClient: async () => ({ auth: { onAuthStateChange() {} } })
      }
    });
    const errors = [];
    const progress = { id: 'progress', level: 4 };
    const dependencies = {
      console: { error: (...values) => errors.push(values.map(String).join(' ')), warn() {} },
      window: win, document: doc,
      GAME_RULES: gameRules, getMannaModel: mannaModel,
      isQuestPending: questPending,
      normalizeMannaUnit: normalizeUnit,
      getDisplayValue: value => String(value ?? '').trim(),
      fetchProfileByUserId: async (_client, id) => ({ id, username: id === 'master' ? 'Master' : 'Player', master: id === 'player' && linked ? 'master' : null }),
      fetchProfileByUsername: async () => ({ id: 'master', username: 'Master' }),
      fetchPlayerForGame: async () => progress,
      fetchUserGameSettings: async () => ({ id: 'game', ...Object.fromEntries(skillColumns.map((column, index) => [column, `skill-${index}`])) }),
      fetchPlayersForUser: async () => linked ? [progress] : [],
      fetchSkillsByIds: async () => linked ? skillColumns.map((_column, index) => ({ id: `skill-${index}`, label: `Skill ${index}` })) : [],
      syncSkillProgress: async () => ({ player: progress, years_burned: 0 }),
      fetchAdminProfile: async () => null,
      fetchPublicProfiles: async () => [], getAvatarImageUrl: async () => '',
      NotificationStore: class {
        constructor() { this.definitions = []; }
        async load() {}
        record() {}
      },
      SoundEffects: class { notify() {} },
      PracticeTimer: class {
        async flush() {}
        project(player) { return player; }
      }
    };
    const init = new Function(...Object.keys(dependencies), source + '\nreturn initJayceePage;')(...Object.values(dependencies));
    await init();
    assert(!doc.querySelector('[data-profile-shell]').hidden, 'Current game stayed hidden');
    assert(doc.querySelector('.profile-vitals-panel'), `Current game did not render without the removed canvas: ${errors.join('; ')}`);
    assert(doc.querySelectorAll('.profile-vital-bar').length === 2, 'Health and Manna bars did not render');
    assert(!doc.querySelector('canvas'), 'Game still depends on the old canvas');
    if (linked) {
      assert(doc.querySelectorAll('.profile-ability-button').length === 5, 'Linked account lost its skill buttons');
      assert(doc.querySelector('.is-passive') && doc.querySelector('.is-ultimate'), 'Dynamic passive/ultimate states were lost');
    }
    assert(!errors.length, `Game initialization logged an error: ${errors.join('; ')}`);
    assert(doc.documentElement.scrollWidth <= doc.documentElement.clientWidth, 'Current game overflows a mobile viewport');
    const button = doc.createElement('button'); button.className = 'account-button account-button-primary';
    doc.body.append(button);
    assert(!frame.contentWindow.getComputedStyle(button).backgroundImage.includes('linear-gradient'), 'Default account button still uses the legacy gradient');
    frame.remove();
  }
};
