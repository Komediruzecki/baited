const fixture = document.getElementById('fixture');
const width = document.getElementById('width');
const player = document.getElementById('player');
const viewer = document.getElementById('viewer');
const config = document.getElementById('config');
const overlayViewer = document.getElementById('overlay-viewer');
const overlayBroadcaster = document.getElementById('overlay-broadcaster');
const note = document.getElementById('fixture-note');
const descriptions = {
  active: 'The timer starts at 1:30. Change the state to inspect another moment.',
  hard: 'Four off-limits clues, the word, and the clock in the native panel.',
  idle: 'No round has started. Viewers should understand where their word will appear.',
  paused: 'The round is paused at 0:26. The clock must stay still.',
  settling: 'The round has ended while the last speech segment is checked.',
  review: 'A catch is waiting for the broadcaster to confirm it. It is not a win yet.',
  caught:
    'The broadcaster confirmed the catch. This is the result viewers see. The overlay card leaves after 12 seconds.',
  escaped:
    'The clock ran out before a confirmed catch. The overlay card leaves after 12 seconds.',
  broadcaster:
    'The broadcaster receives a projection without the active secret or forbidden clues.',
  unconfigured: 'The channel has no connected studio yet.',
  reconnect:
    'After two seconds the fixture disconnects. The service returns after eight seconds; retry backoff may delay the next check.',
  error:
    'The fixture service keeps returning unavailable. No successful connection should be implied.',
  longword: 'A long target and long forbidden clues exercise wrapping in the smallest panel.',
  kaleidoscope: 'A real target with its four exact clues. Fixed example only.',
  archipelago: 'A real target with its four exact clues. Fixed example only.',
  dinosaur: 'A real easy target, with no off-limits clues. Fixed example only.',
  marshmallow: 'A real medium target with wide letters and its two exact off-limits clues.',
  alchemy: 'A real hard target, including TRANSMUTATION, with all four exact off-limits clues.',
};
function sizePlayer() {
  const w = Number(player.value);
  for (const stage of document.querySelectorAll('.video-stage')) {
    stage.style.width = `${w}px`;
    stage.style.height = `${Math.round((w * 9) / 16)}px`;
  }
}
function restart() {
  const query = new URLSearchParams({ fixture: fixture.value, instance: String(Date.now()) });
  viewer.src = `/viewer.html?${query}`;
  config.src = `/config.html?${query}`;
  overlayViewer.src = `/overlay.html?${query}`;
  query.set('role', 'broadcaster');
  overlayBroadcaster.src = `/overlay.html?${query}`;
  note.textContent = descriptions[fixture.value];
}
fixture.addEventListener('change', restart);
document.getElementById('restart').addEventListener('click', restart);
width.addEventListener('change', () => {
  viewer.width = width.value;
  document.getElementById('size-label').textContent = `${width.value} × 500`;
});
player.addEventListener('change', sizePlayer);
sizePlayer();
