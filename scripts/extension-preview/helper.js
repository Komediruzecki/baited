// Local fixture Helper. This file is never part of the upload bundle.
(() => {
  const modes = new Set(['idle', 'active', 'paused', 'settling', 'review', 'caught', 'escaped', 'unconfigured', 'broadcaster', 'reconnect', 'error', 'longword']);
  const query = new URLSearchParams(location.search);
  const fixture = modes.has(query.get('fixture')) ? query.get('fixture') : 'active';
  const role = location.pathname.endsWith('/config.html') || fixture === 'broadcaster' ? 'broadcaster' : 'viewer';
  const encode = (value) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ role, fixture, previewAt: Date.now(), channel_id: '501062940', opaque_user_id: 'Ufixtureviewer' })}.fixture-only`;
  window.Twitch = { ext: {
    onAuthorized(callback) { queueMicrotask(() => callback({ clientId: 'baitedlocalpreview0001', channelId: '501062940', token, userId: 'Ufixtureviewer' })); },
    onVisibilityChanged(callback) {
      queueMicrotask(() => callback(document.visibilityState !== 'hidden'));
      document.addEventListener('visibilitychange', () => callback(document.visibilityState !== 'hidden'));
    },
    onContext(callback) { queueMicrotask(() => callback({ theme: 'dark', mode: role === 'broadcaster' ? 'config' : 'viewer' }, ['theme', 'mode'])); },
    onError() {},
  } };
})();
