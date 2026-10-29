import { connectToTwitch, connectionView, readConfiguration } from './client.js';

const byId = (id) => document.getElementById(id);
const check = byId('check-connection');
check.disabled = true;
const client = connectToTwitch({
  path: '/api/extension/config',
  parse: readConfiguration,
  onData(data) {
    byId('channel-step').textContent = data.connected
      ? 'Twitch channel connected.'
      : 'Connect your Twitch channel.';
    byId('channel-name').textContent = data.channelName
      ? `@${data.channelName}`
      : 'Studio not connected';
    byId('channel-detail').textContent = data.connected
      ? 'Studio connected. Viewers will get their first word when you start a round.'
      : 'Connect this channel in the studio. Then return here to check the connection.';
    const link = byId('open-studio');
    link.href = data.studioUrl;
    link.hidden = false;
    byId('external-note').hidden = false;
  },
  onStatus(status) {
    connectionView(status);
    check.disabled = !['connected', 'reconnecting', 'unavailable'].includes(status.kind);
    if (['invalid', 'authorization', 'forbidden', 'connecting'].includes(status.kind)) {
      byId('open-studio').hidden = true;
      byId('open-studio').removeAttribute('href');
      byId('external-note').hidden = true;
      byId('channel-name').textContent = 'Waiting for Twitch';
      byId('channel-step').textContent = 'Connect your Twitch channel.';
      byId('channel-detail').textContent =
        'We need the broadcaster’s authorization before showing channel setup.';
    }
    if (status.kind === 'reconnecting')
      byId('channel-detail').textContent =
        'The last connection check failed. Reconnecting to the game service.';
    if (status.kind === 'unavailable') byId('channel-detail').textContent = status.message;
  },
});
check.addEventListener('click', () => client?.refresh());
byId('retry').addEventListener('click', () => client?.refresh());
