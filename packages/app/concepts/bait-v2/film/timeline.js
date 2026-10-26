export function buildTimeline(gsap, root, layout) {
  const q = selector => root.querySelector(selector);
  const qa = selector => [...root.querySelectorAll(selector)];
  const tl = gsap.timeline({ paused: true });
  const phone = layout === 'phone';
  const width = phone ? 1080 : 1920;
  const poses = {
    talk: ['0% 0%', 269, 0], squint: ['50% 0%', 262, 0], smug: ['100% 0%', 258, 3],
    shout: ['0% 100%', 258, 26], facepalm: ['50% 100%', 262, 20], laugh: ['100% 100%', 260, 14],
  };
  const pose = (name, at, screen = '.player') => {
    const [backgroundPosition, center, offset] = poses[name];
    const avatar = q(`${screen} .avatar`), size = avatar.clientWidth;
    tl.set(avatar, { backgroundPosition, x: (256 - center) * size / 512, y: offset * size / 512 }, at);
    tl.fromTo(`${screen} .avatar-frame`, { y: 6 }, { y: 0, duration: 2 / 30, ease: 'steps(2)', immediateRender: false }, at);
  };
  // The full-frame card pattern hides both the opening reveal and the loop seam.
  tl.fromTo('.start-wipe', { x: 0 }, { x: -width, duration: .8, ease: 'power3.out' }, 0);
  tl.set('.end-wipe', { opacity: 1 }, 30.8);
  tl.fromTo('.end-wipe', { x: width }, { x: 0, duration: .8, ease: 'power3.in' }, 30.8);
  // The secret is dealt only to the viewer panel. Keep the face readable through the flip.
  tl.fromTo('.card-object', { y: 300, rotation: -9 }, { y: 0, rotation: 0, duration: .6, ease: 'back.out(1.6)' }, .8);
  tl.fromTo('.card-object', { scaleX: 1 }, { scaleX: .065, duration: .2, ease: 'power2.in' }, 1.9);
  tl.set('.card-front', { opacity: 1 }, 2.1);
  tl.set('.card-back', { opacity: 0 }, 2.1);
  tl.to('.card-object', { scaleX: 1, duration: .22, ease: 'power2.out' }, 2.1);
  tl.fromTo('.panel-copy', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: .3, ease: 'power3.out' }, 2.1);
  // Two screens, one secret. A moving vertical seam becomes stacked on phones.
  tl.set('.split', { opacity: 1 }, 4.2);
  tl.fromTo('.split', { clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0%)', duration: .35, ease: 'power2.inOut' }, 4.2);
  tl.to('.split', { clipPath: 'inset(0 100% 0 0)', duration: .4, ease: 'power2.inOut' }, 7);
  tl.set('.split', { opacity: 0 }, 7.4);
  // The art review keeps the completed hut: moss is repairing it, not building from scratch.
  for (let i = 0; i < 70; i++) {
    const down = i % 2 === 1, at = .5 + i * .25;
    tl.set('.builder-sprite', { backgroundPosition: down ? '50% 100%' : '0% 100%', scaleX: down ? -1 : 1, x: down ? 2 : 0 }, at);
    if (down) {
      tl.fromTo('.hammer-dust', { opacity: .7, x: 0, y: 0 }, { opacity: 0, x: -6, y: -8, duration: .23, ease: 'steps(4)', immediateRender: false }, at);
    }
  }
  const puffs = qa('.smoke');
  const puffTimes = Array.from({ length: 14 }, (_, i) => i * 1.3).concat(Array.from({ length: 9 }, (_, i) => 17.6 + i * .4));
  puffTimes.forEach((at, index) => {
    const el = puffs[index % 3], size = [.72, .9, 1.1][index % 3];
    tl.fromTo(el, { y: 0, x: 0, opacity: at < 17.6 ? .65 : .8, scale: size },
      { y: -48, x: 25 + (index % 3) * 12, scale: size + .12, duration: at < 17.6 ? 1.5 : 1.1, ease: 'steps(17)', immediateRender: false }, at);
    tl.to(el, { opacity: 0, duration: .2 }, at + (at < 17.6 ? 1.3 : .9));
  });
  tl.set('.smoke', { filter: 'url(#smoke-tint) brightness(.72)' }, 17.6);
  // Short pushes into holds. The crater keeps more than 65 master pixels of headroom.
  tl.to('.world', { scale: 1.04, duration: .6, ease: 'power2.inOut' }, .8);
  tl.set('.world', { scale: 1 }, 4.2);
  tl.to('.world', { scale: 1.02, duration: .6, ease: 'power2.inOut' }, 7.4);
  tl.to('.world', { scale: phone ? 1.05 : 1.06, duration: .6, ease: 'power2.inOut' }, 13.4);
  tl.to('.world', { scale: 1, duration: .5, ease: 'power2.inOut' }, 20.3);
  pose('talk', 0); pose('squint', 10.9); pose('smug', 13.4); pose('squint', 17.6);
  pose('shout', 19.3); pose('laugh', 24.4); pose('talk', 28.4);
  // Chat is editable HTML, with deterministic scroll positions measured once after fonts load.
  const rows = qa('.chat-line');
  const viewport = q('.chat-viewport');
  rows.forEach((row, index) => {
    const at = Number(row.dataset.at);
    tl.fromTo(row, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: .2, ease: 'power3.out' }, at);
    const bottom = row.offsetTop + row.offsetHeight;
    const shift = Math.max(0, bottom - viewport.clientHeight + 8);
    if (index > 2) tl.to('.chat-log', { y: -shift, duration: .25, ease: 'power2.out' }, at);
    rows.slice(0, index).filter(previous => previous.offsetTop < shift).forEach(previous => {
      tl.to(previous, { opacity: 0, duration: .12 }, at);
    });
  });
  qa('.caption').forEach(el => {
    const at = Number(el.dataset.at), until = Number(el.dataset.until);
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: .1 }, at);
    tl.to(el, { opacity: 0, duration: .1 }, until);
    for (let time = at; time < until; time += .25) {
      tl.set('.player .avatar-frame', { y: Math.round((time - at) * 4) % 2 ? 0 : 2 }, time);
    }
    tl.set('.player .avatar-frame', { y: 0 }, until);
  });
  // Stop at 19.6, measured from a 0.8-second start: elapsed rounds to 19 seconds.
  for (let second = 0; second <= 18; second++) {
    const remaining = 120 - second;
    const stamp = `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`;
    tl.set('.round-clock', { textContent: stamp }, .8 + second);
  }
  const offsets = [0, 3, -2, 2, -3, 1, 0, -2, 3, -1, 2, 0];
  for (let i = 0; i < 30; i++) tl.set('.world', { x: offsets[i % offsets.length], y: i % 2 ? 2 : -2 }, 17.6 + i / 15);
  tl.set('.world', { x: 0, y: 0 }, 19.6);
  // A code-built eruption shares the island crater anchor. No card icon or lemon-yellow flash.
  ['#bb3d26', '#ec5422', '#ff943d', '#ec5422'].forEach((fill, i) => {
    tl.set('.crater-glow', { opacity: 1, fill }, 17.6 + i * .5);
  });
  [1, 2, 3].forEach((frame, index) => {
    tl.set('.jet', { opacity: 0 }, 19.2 + index / 30);
    tl.set(`.jet-${frame}`, { opacity: 1 }, 19.2 + index / 30);
  });
  tl.set('.jet', { opacity: 0 }, 20);
  tl.set('.jet-2', { opacity: 1 }, 20);
  tl.set('.jet', { opacity: 0 }, 20.2);
  tl.set('.jet-1', { opacity: 1 }, 20.2);
  tl.to('.jet', { opacity: 0, duration: .2 }, 20.4);
  tl.fromTo('.lava-tongue,.lava-core', { opacity: 1, clipPath: 'inset(0 0 100% 0)' },
    { clipPath: 'inset(0 0 0% 0)', duration: .8, ease: 'steps(12)', immediateRender: false }, 19.6);
  const arcs = [[-70, 63, 70], [-45, 72, 120], [-23, 63, 155], [14, 71, 138], [39, 66, 95], [62, 58, 55], [82, 48, 80], [-86, 48, 96]];
  qa('.lava-blob').forEach((el, index) => {
    const [x, height, ground] = arcs[index], at = 19.2 + index * .012;
    tl.fromTo(el, { opacity: 1, x: 0, y: 0 }, { x: Math.round(x * .5), y: -height, duration: .3, ease: 'steps(6)', immediateRender: false }, at);
    tl.to(el, { x, y: ground, duration: .45, ease: 'steps(9)' }, 19.8 + index * .01);
    tl.to(el, { opacity: 0, duration: .1 }, 20.25 + index * .01);
  });
  tl.set('.crater-glow,.lava-tongue,.lava-core', { opacity: 0 }, 31.6);
  tl.set('.spoken-target', { color: '#ff743c', borderColor: '#ff743c' }, 19.6);
  tl.set('.widget-title', { textContent: 'CHECK THIS CATCH' }, 19.6);
  tl.set('.round-tag', { textContent: 'VOLCANO', color: '#ff743c' }, 19.6);
  tl.set('.round-clock', { textContent: '—' }, 19.6);
  tl.to('.panel-result.pending-result', { opacity: 1, duration: .2 }, 20.4);
  // Detection is a candidate. The score changes only after the host's confirmation.
  tl.set('.studio', { opacity: 1 }, 20.8);
  tl.fromTo('.studio', { x: width }, { x: 0, duration: .2, ease: 'power3.out' }, 20.8);
  pose('facepalm', 20.8, '.studio');
  tl.to('.studio-caption', { opacity: 1, duration: .1 }, 21.2);
  tl.set('.studio .cursor', { opacity: 1 }, 22.4);
  const confirm = q('.confirm-button'), studioCursor = q('.studio .cursor');
  tl.to(studioCursor, { x: confirm.offsetLeft + confirm.offsetWidth * .58 - studioCursor.offsetLeft,
    y: confirm.offsetTop + confirm.offsetHeight * .5 - studioCursor.offsetTop, duration: .8, ease: 'power2.inOut' }, 22.4);
  tl.to('.confirm-button', { scale: .97, duration: .08 }, 23.3);
  tl.to('.confirm-button', { scale: 1, duration: .14 }, 23.38);
  tl.set('.studio-status', { textContent: 'CHAT WINS' }, 23.3);
  tl.set('.studio-word', { textContent: 'VOLCANO.', color: '#ff743c' }, 23.3);
  tl.set('.studio-copy', { textContent: 'Detected after 19 seconds.' }, 23.3);
  tl.to('.studio-actions,.studio-timer,.studio-caption,.studio .cursor', { opacity: 0, duration: .14 }, 23.4);
  tl.set('.studio', { opacity: 0 }, 24.4);
  tl.set('.widget-title', { textContent: 'CHAT WINS' }, 23.3);
  tl.set('.round-clock', { textContent: '+1' }, 23.3);
  tl.set('.win-count', { textContent: '4 WINS' }, 23.3);
  tl.set('.streak-count', { textContent: '2 STREAK' }, 23.3);
  tl.set('.won-result', { opacity: 1 }, 24.4);
  tl.to('.celebration', { opacity: 1, duration: .15 }, 24.4);
  tl.fromTo('.celebration .caught', { scale: 1.32 }, { scale: 1, duration: .45, ease: 'back.out(1.4)' }, 24.4);
  tl.to('.word-flood', { opacity: 1, duration: .2 }, 24.4);
  tl.to('.word-flood', { opacity: 0, duration: .3 }, 25.3);
  qa('.confetti').forEach((el, i) => {
    const x = ((i * 83) % 1150) - 560, y = ((i * 47) % 700) - 200;
    tl.fromTo(el, { opacity: 1, x: 0, y: 0, rotation: 0 },
      { x, y, rotation: (i % 3 - 1) * 150, duration: 2.1 + (i % 5) * .12, ease: 'steps(30)' }, 24.4 + (i % 4) * .08);
    tl.to(el, { opacity: 0, duration: .2 }, 27.4 + (i % 4) * .08);
  });
  tl.to('.celebration', { opacity: 0, duration: .2 }, 28.2);
  tl.fromTo('.pick', { y: phone ? 592 : 400, opacity: 1 }, { y: 0, duration: .45, ease: phone ? 'power3.out' : 'back.out(1.4)' }, 28.4);
  const hint = q('.hint-row.good'), pickCursor = q('.pick .cursor');
  tl.to(pickCursor, { x: hint.offsetLeft + hint.offsetWidth * .65 - pickCursor.offsetLeft,
    y: hint.offsetTop + hint.offsetHeight * .5 - pickCursor.offsetTop, duration: .55, ease: 'power2.inOut' }, 28.75);
  tl.to('.hint-row.good', { backgroundColor: '#4d3372', duration: .1 }, 29.4);
  tl.to('.pick-award', { opacity: 1, duration: .2 }, 29.6);
  // Preserve the authored 32-second duration even under direct seeking.
  tl.to({}, { duration: 0 }, 32);
  return tl;
}
