export const runMenuSoundTests = async ({ indexSource, loreSource, uiSource, audioSource }) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const setup = () => {
    const doc = document.implementation.createHTMLDocument('Menu test');
    const calls = [];
    const finishes = [];
    const navigations = [];
    const win = Object.assign(new EventTarget(), {
      location: { href: 'https://example.test/', assign: (url) => navigations.push(url) },
      setTimeout: (callback) => { callback(); return 1; }
    });
    class Effects {
      preload(names) { assert(names.includes('menuPlay') && names.includes('buttonClick'), 'Missing UI sound preload'); }
      play(name) { calls.push(name); return new Promise((resolve) => finishes.push(resolve)); }
    }
    new Function('document', 'window', 'SoundEffects', uiSource)(doc, win, Effects);
    return { doc, win, calls, navigations, finishSound: () => finishes.at(-1)?.() };
  };
  for (const [session, destination] of [[null, '/lore.html'], [{ user: { id: 'user' } }, '/game.html']]) {
    const { doc, win, calls, finishSound } = setup();
    doc.body.innerHTML = '<button data-start-game><span>Play</span></button>';
    win.JayceeAuth = { getSession: async () => ({ data: { session } }) };
    new Function('document', 'window', indexSource)(doc, win);
    const button = doc.querySelector('button');
    button.querySelector('span').click();
    button.click();
    await tick();
    assert(win.location.href === 'https://example.test/', 'Play cut off a sound before it finished');
    finishSound();
    await tick();
    assert(win.location.href === destination, 'Play chose the wrong route for the current session');
    assert(calls.length === 1 && calls[0] === 'menuPlay', 'Play must sound once, before it is disabled');
    win.dispatchEvent(new Event('pageshow'));
    assert(!button.disabled && !doc.body.classList.contains('is-game-launching'), 'Back navigation left Play disabled');
  }
  const lore = setup();
  lore.doc.body.innerHTML = '<form data-lore-access><input name="full_name" value="Player"><button type="button">Continue</button></form>';
  lore.win.localStorage = { setItem() {}, removeItem() {} };
  new Function('document', 'window', loreSource)(lore.doc, lore.win);
  lore.doc.querySelector('button').click();
  lore.doc.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert(lore.win.location.href === 'https://example.test/', 'Continue cut off its sound');
  lore.finishSound();
  await tick();
  assert(lore.win.location.href === '/prayer.html', 'Continue did not navigate after the sound');

  const { doc, win, calls, navigations, finishSound } = setup();
  doc.body.innerHTML = '<button><span>Continue</span></button><a href="/login.html">Log in</a>';
  const button = doc.querySelector('button');
  button.addEventListener('click', () => { button.disabled = true; });
  button.querySelector('span').click();
  assert(calls.join() === 'buttonClick', 'Dynamic button or nested label did not play its click');
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  assert(calls.length === 1, 'Disabled button played a click');
  const link = doc.querySelector('a');
  const click = (options = {}) => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...options });
    link.dispatchEvent(event);
    return event;
  };
  assert(click().defaultPrevented && navigations.length === 0, 'Normal link cut off a sound');
  finishSound();
  await tick();
  assert(navigations[0] === 'https://example.test/login.html', 'Normal link did not navigate after its sound');
  const navCount = navigations.length;
  assert(!click({ ctrlKey: true }).defaultPrevented && navigations.length === navCount, 'Modified link navigation was intercepted');
  link.target = '_blank';
  assert(!click().defaultPrevented && navigations.length === navCount, 'New-tab link was intercepted');
  link.target = '';
  link.href = '#details';
  assert(!click().defaultPrevented && navigations.length === navCount, 'Fragment navigation was intercepted');
  link.href = '/login.html';
  link.addEventListener('click', (event) => event.preventDefault());
  click();
  assert(navigations.length === navCount, 'Page-owned link action was overridden');
  button.disabled = false;
  button.setAttribute('aria-disabled', 'true');
  const callCount = calls.length;
  button.click();
  assert(calls.length === callCount, 'ARIA-disabled control played a click');

  const created = [];
  class AudioMock extends EventTarget {
    constructor(src) { super(); this.src = src; created.push(this); }
    play() { return Promise.reject(new Error('Autoplay unavailable')); }
  }
  const source = audioSource.replace(/\bimport\.meta\.url\b/g, JSON.stringify('https://example.test/src/js/jaycee/sounds.js'));
  const Effects = new Function('Audio', 'globalThis', source + '\nreturn SoundEffects;')(AudioMock, { document: { visibilityState: 'visible' } });
  const effects = new Effects();
  effects.preload(['menuPlay', 'buttonClick']);
  effects.play('menuPlay');
  effects.play('buttonClick');
  effects.play('buttonClick');
  await tick();
  assert(created.length === 2 && created.some((audio) => audio.src.endsWith('/play_main_menu.mp3'))
    && created.some((audio) => audio.src.endsWith('/first_click_skill.mp3')), 'UI audio assets were not wired or reused');
  await effects.play('menuPlay', { waitForEnd: true });

  const successfulAudio = [];
  class PlayingAudio extends EventTarget {
    constructor() { super(); this.duration = 2; successfulAudio.push(this); }
    play() { return Promise.resolve(); }
  }
  const WaitingEffects = new Function('Audio', 'globalThis', source + '\nreturn SoundEffects;')(PlayingAudio, { document: { visibilityState: 'visible' } });
  const waitingEffects = new WaitingEffects();
  let finished = false;
  const completion = waitingEffects.play('buttonClick', { waitForEnd: true }).then(() => { finished = true; });
  await tick();
  assert(!finished, 'Playback promise resolved before the sound ended');
  successfulAudio[0].dispatchEvent(new Event('ended'));
  await completion;
  assert(finished, 'Playback completion was not detected');

  let fallback;
  const StalledEffects = new Function('Audio', 'globalThis', 'setTimeout', 'clearTimeout', source + '\nreturn SoundEffects;')(
    PlayingAudio, { document: { visibilityState: 'visible' } }, (callback, delay) => { assert(delay === 1500, 'Navigation audio wait must be capped at 1.5 seconds'); fallback = callback; return 1; }, () => {}
  );
  const stalled = new StalledEffects().play('menuPlay', { waitForEnd: true });
  fallback();
  await stalled;
};
