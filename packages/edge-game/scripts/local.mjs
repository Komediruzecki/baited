import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Miniflare } from 'miniflare';
import { buildWorker } from './build.mjs';
import { createLocalOptions, LOCAL_HOST, LOCAL_PORT, parseLocalSettings } from './local-options.mjs';

export async function runLocal(argv = process.argv.slice(2), env = process.env) {
  const settings = parseLocalSettings(argv, env);
  await buildWorker();
  const emulator = new Miniflare(createLocalOptions(settings));
  let stopping;
  let hardStop;
  const stop = () => {
    if (!stopping) {
      clearTimeout(deadline);
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      // Disposal must not turn a bounded preview into a forgotten process.
      hardStop = setTimeout(() => process.exit(1), 5_000);
      hardStop.unref();
      stopping = emulator.dispose().finally(() => clearTimeout(hardStop));
    }
    return stopping;
  };
  const onSignal = () => { void stop().catch(() => { process.exitCode = 1; }); };
  const deadline = setTimeout(onSignal, settings.timeoutMs);
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    const ready = await emulator.ready;
    if (ready.hostname !== LOCAL_HOST || ready.port !== String(LOCAL_PORT)) {
      throw new Error('Miniflare did not bind to the required loopback host and strict port.');
    }
    console.log(`Local edge fixture: ${ready.origin}`);
    console.log(`Stops after ${settings.timeoutMs} ms or Ctrl+C. Outbound network access is disabled.`);
    console.log(settings.statePath ? `Local state: ${settings.statePath}` : 'State is temporary and is discarded on exit.');
    console.log('Fixture capabilities use the public loopback test key; no provider credentials are loaded.');
    return { emulator, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await runLocal();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Local edge harness failed.');
    process.exitCode = 1;
  }
}
