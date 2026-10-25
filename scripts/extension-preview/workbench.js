const fixture = document.getElementById('fixture');
const width = document.getElementById('width');
const viewer = document.getElementById('viewer');
const config = document.getElementById('config');
const note = document.getElementById('fixture-note');
const descriptions = {
  active: 'The timer starts at 1:30. Change the state to inspect another moment.',
  idle: 'No round has started. Viewers should understand where their word will appear.',
  paused: 'The round is paused at 0:26. The clock must stay still.',
  settling: 'The round has ended while the last speech segment is checked.',
  review: 'A catch is waiting for the broadcaster to confirm it. It is not a win yet.',
  caught: 'The broadcaster confirmed the catch. This is the result viewers see.',
  escaped: 'The clock ran out before a confirmed catch.',
  broadcaster: 'The broadcaster receives a projection without the active secret or forbidden clues.',
  unconfigured: 'The channel has no connected studio yet.',
  reconnect: 'After two seconds the fixture disconnects. The service returns after eight seconds; retry backoff may delay the next check.',
  error: 'The fixture service keeps returning unavailable. No successful connection should be implied.',
  longword: 'A long target and long forbidden clues exercise wrapping in the smallest panel.',
};
function restart() {
  const query = new URLSearchParams({ fixture: fixture.value, instance: String(Date.now()) });
  viewer.src = `/viewer.html?${query}`;
  config.src = `/config.html?${query}`;
  note.textContent = descriptions[fixture.value];
}
fixture.addEventListener('change', restart);
document.getElementById('restart').addEventListener('click', restart);
width.addEventListener('change', () => {
  viewer.width = width.value;
  document.getElementById('size-label').textContent = `${width.value} × 500`;
});
