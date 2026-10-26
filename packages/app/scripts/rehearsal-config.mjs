/** Validate rehearsal settings without starting a server or contacting a provider. */
export function rehearsalSettings(env = process.env) {
  const seconds = Number(env.REHEARSAL_SECONDS || 10800);
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 18000)
    throw new Error('REHEARSAL_SECONDS must be 60 to 18000.');

  const speechProvider = env.SPEECH_PROVIDER || 'moonshine';
  if (speechProvider !== 'moonshine' && speechProvider !== 'deepgram')
    throw new Error('SPEECH_PROVIDER must be moonshine or deepgram.');

  const required = ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'TOKEN_ENCRYPTION_KEY'];
  if (speechProvider === 'deepgram') required.push('DEEPGRAM_API_KEY');
  const missing = required.filter((name) => !env[name] || env[name].startsWith('pass://'));
  if (missing.length)
    throw new Error(`Resolve these credentials with pass-cli run before starting: ${missing.join(', ')}.`);
  if (!/^[a-f0-9]{64}$/i.test(env.TOKEN_ENCRYPTION_KEY))
    throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hexadecimal characters, stored in Proton Pass.');

  return { seconds, speechProvider };
}
