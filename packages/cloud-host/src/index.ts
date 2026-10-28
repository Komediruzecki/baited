import { Container, ContainerProxy, getContainer } from '@cloudflare/containers';
import { storageBridge } from './storage-bridge';
import { containerRequest } from './edge-request';
export { ContainerProxy };

interface Env {
  GAME: DurableObjectNamespace<BaitedContainer>;
  STATE: R2Bucket;
  DEPLOYMENT_ENABLED: string;
  PUBLIC_URL: string;
  TOKEN_ENCRYPTION_KEY: string;
  TWITCH_CLIENT_ID: string;
  TWITCH_CLIENT_SECRET: string;
  TWITCH_EXTENSION_CLIENT_ID: string;
  TWITCH_EXTENSION_SECRET: string;
  TWITCH_BOT_USER_ID?: string;
  TWITCH_BOT_IS_STREAMER?: string;
}

export class BaitedContainer extends Container<Env> {
  defaultPort = 3000;
  // Retain the process while idle: saved Twitch grants connect to EventSub at startup.
  // Do not add automatic sleep until reconnect and active-stream detection are implemented.
  sleepAfter = '24h';
  enableInternet = true;
  envVars = {
    NODE_ENV: 'production', HOST: '0.0.0.0', PORT: '3000', ENABLE_DEMO: 'false',
    SPEECH_PROVIDER: 'moonshine', STORAGE_BACKEND: 'cloudflare', DATA_DIR: '/app/data',
    PUBLIC_URL: this.env.PUBLIC_URL,
    TOKEN_ENCRYPTION_KEY: this.env.TOKEN_ENCRYPTION_KEY,
    TWITCH_CLIENT_ID: this.env.TWITCH_CLIENT_ID,
    TWITCH_CLIENT_SECRET: this.env.TWITCH_CLIENT_SECRET,
    TWITCH_EXTENSION_CLIENT_ID: this.env.TWITCH_EXTENSION_CLIENT_ID,
    TWITCH_EXTENSION_SECRET: this.env.TWITCH_EXTENSION_SECRET,
    TWITCH_BOT_USER_ID: this.env.TWITCH_BOT_USER_ID || '',
    TWITCH_BOT_IS_STREAMER: this.env.TWITCH_BOT_IS_STREAMER || '0',
  };
  override async onActivityExpired() { this.renewActivityTimeout(); }
}

BaitedContainer.outboundByHost = {
  'baited.storage': (request, env: Env, ctx) => storageBridge(request, env.STATE,
    ctx.containerId === env.GAME.idFromName('primary').toString()),
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (env.DEPLOYMENT_ENABLED !== 'true') return new Response('Hosting preparation is not activated.', { status: 503 });
    if (new URL(request.url).origin !== env.PUBLIC_URL) return new Response('Unknown host.', { status: 421 });
    // All rooms share the same process, including SSE, OAuth sessions and speech sockets.
    // Storage is accessible only from the private outbound handler above.
    let forwarded: Request;
    try { forwarded = await containerRequest(request, env.TOKEN_ENCRYPTION_KEY); }
    catch { return new Response('Cloud routing is unavailable.', { status: 503 }); }
    return getContainer(env.GAME, 'primary').fetch(forwarded);
  },
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    if (env.DEPLOYMENT_ENABLED !== 'true') return;
    // Recover a stopped process without waiting for a viewer; do not restart on
    // storage failure automatically, which could hide a conflicting writer.
    const request = await containerRequest(new Request(`${env.PUBLIC_URL}/api/health`, {
      headers: { 'CF-Connecting-IP': '127.0.0.1' },
    }), env.TOKEN_ENCRYPTION_KEY);
    const response = await getContainer(env.GAME, 'primary').fetch(request);
    await response.body?.cancel();
    if (!response.ok) throw new Error('Baited readiness check failed.');
  },
} satisfies ExportedHandler<Env>;
