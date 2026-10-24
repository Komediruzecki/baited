import express from 'express';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { z, ZodError } from 'zod';
import { WebSocketServer } from 'ws';
import { Game, defaults } from './game.js';
import { Store } from './store.js';
import { Sessions, Limiter, cookies, equal, isLoopback, randomKey } from './security.js';
import { TwitchAuth, TwitchConnection, AuthRevoked, AuthSuperseded } from './twitch.js';
import { SpeechBridge } from './speech.js';
import type { Config } from './config.js';
import type { Session } from './security.js';
import type { Studio } from '../shared/types.js';
import type { Response, Request, NextFunction } from 'express';

export async function createBait(config: Config, developmentHmr = false) {
  const app = express(),
    server = createServer(app),
    store = new Store(config.dataDir, config.key);
  await store.load();
  const rooms = new Map<string, Game>(),
    sessions = new Sessions(config.production),
    limiter = new Limiter(),
    auth = new TwitchAuth(config, store);
  const twitch = new Map<string, TwitchConnection>(),
    speech = new Map<string, SpeechBridge>();
  const microphoneLeases = new Map<string, { session: Session; leaseId: string; expires: number }>();
  const pendingOAuth = new Map<string, { cookie: string; expires: number }>();
  type Subscriber = {
    roomId: string;
    role: 'studio' | 'viewer' | 'overlay';
    res: Response;
    session?: Session;
  };
  const subscribers = new Set<Subscriber>();
  const broadcasts = new Map<string, ReturnType<typeof setTimeout>>();
  let persistTimer: ReturnType<typeof setTimeout> | undefined,
    closed = false;
  let storageError = false;
  function persist() {
    if (persistTimer || closed) return;
    persistTimer = setTimeout(() => {
      persistTimer = undefined;
      store.snapshot.rooms = [...rooms.values()]
        .filter((r) => r.data.mode === 'twitch')
        .map((r) => r.data);
      store
        .save()
        .then(() => {
          storageError = false;
        })
        .catch(() => {
          storageError = true;
          console.error('State could not be saved. Check DATA_DIR permissions and disk space.');
        });
    }, 150);
  }
  function studio(game: Game): Studio {
    return {
      room: game.view('studio'),
      viewerUrl: `${config.origin}/play/${game.data.id}`,
      overlayUrl: `${config.origin}/overlay/${game.data.id}?key=${game.data.overlayKey}`,
      speechReady: !!config.speechKey,
      awardBoard: game.awardBoard,
    };
  }
  function send(s: Subscriber) {
    if (s.session && sessions.get(`bait_session=${s.session.id}`) !== s.session) {
      s.res.end();
      subscribers.delete(s);
      return;
    }
    const room = rooms.get(s.roomId);
    if (!room) return;
    if (s.res.writableLength > 256000) {
      s.res.end();
      subscribers.delete(s);
      return;
    }
    s.res.write(
      `event: state\ndata: ${JSON.stringify(s.role === 'studio' ? studio(room) : room.view(s.role))}\n\n`,
    );
  }
  function microphoneReady(game: Game) {
    const lease = microphoneLeases.get(game.data.id);
    return !!(config.speechKey && lease && lease.expires > Date.now() &&
      sessions.get(`bait_session=${lease.session.id}`) === lease.session);
  }
  function disarm(roomId: string, ownerSession?: Session, leaseId?: string) {
    const lease = microphoneLeases.get(roomId);
    if (ownerSession && lease?.session !== ownerSession) return;
    if (leaseId !== undefined && lease?.leaseId !== leaseId) return;
    microphoneLeases.delete(roomId);
    const game = rooms.get(roomId);
    if (game?.phase === 'active') game.pauseIfActive();
    speech.get(roomId)?.close();
  }
  function register(game: Game) {
    rooms.set(game.data.id, game);
    game.canRun = () => microphoneReady(game);
    game.onChange = () => {
      const bridge = speech.get(game.data.id);
      bridge?.sync();
      if (!broadcasts.has(game.data.id))
        broadcasts.set(
          game.data.id,
          setTimeout(() => {
            broadcasts.delete(game.data.id);
            for (const s of subscribers) if (s.roomId === game.data.id) send(s);
          }, 100),
        );
      persist();
    };
  }
  for (const saved of store.snapshot.rooms) register(new Game(saved));
  function invalidate(id: string, generation?: number) {
    if (generation !== undefined && !auth.isCurrent(id, generation)) return;
    sessions.deleteUser(id);
    void auth.invalidate(id).catch(() => {
      storageError = true;
    });
    for (const game of rooms.values())
      if (game.data.owner === id) {
        twitch.get(game.data.id)?.stop();
        disarm(game.data.id);
        if (['active', 'paused', 'settling'].includes(game.phase)) game.endIfRunning('ended');
        game.connection = {
          status: 'error',
          detail: 'Authorization revoked. Connect Twitch again.',
        };
        game.onChange();
      }
  }
  function connect(game: Game) {
    twitch.get(game.data.id)?.stop();
    const connection = new TwitchConnection(game, auth, (generation) => invalidate(game.data.owner, generation));
    twitch.set(game.data.id, connection);
    connection.start();
  }
  // Every stored Twitch authorization is validated at startup, and hourly thereafter.
  async function validateAll(start = false) {
    for (const game of rooms.values())
      if (game.data.mode === 'twitch' && store.snapshot.vault[game.data.owner]) {
        const generation = auth.generation(game.data.owner);
        try {
          await auth.validate(game.data.owner);
          if (start && !closed && rooms.get(game.data.id) === game && auth.isCurrent(game.data.owner, generation)) connect(game);
        } catch (e) {
          if (e instanceof AuthSuperseded || !auth.isCurrent(game.data.owner, generation)) continue;
          if (e instanceof AuthRevoked) invalidate(game.data.owner, generation);
          else {
            game.connection = {
              status: 'error',
              detail: 'Twitch validation unavailable. Reconnect to retry.',
            };
            game.onChange();
          }
        }
      }
  }
  const validation = setInterval(() => void validateAll(), 3600000);
  const startupValidation = validateAll(true);
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustedProxies);
  app.use(
    helmet({
      contentSecurityPolicy: config.production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:'],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'self'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(express.json({ limit: '8kb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use((req, res, next) => {
    // Pin the origin and Host to prevent local DNS rebinding and cross-site requests.
    const host = new URL(config.origin).host;
    if (
      req.headers.host !== host &&
      !(config.port === 0 && !config.production && isLoopback(req.socket.remoteAddress))
    ) {
      res.status(421).json({ error: 'Use the configured PUBLIC_URL.' });
      return;
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== config.origin) {
      res.status(403).json({ error: 'Origin rejected.' });
      return;
    }
    next();
  });
  function session(req: Request, res: Response, next: NextFunction) {
    const s = sessions.get(req.headers.cookie);
    if (!s) {
      res.status(401).json({ error: 'Open your studio and sign in.' });
      return;
    }
    res.locals.session = s;
    next();
  }
  function protect(req: Request, res: Response, next: NextFunction) {
    session(req, res, () => {
      const s = res.locals.session as Session;
      if (!equal(String(req.headers['x-csrf-token'] || ''), s.csrf)) {
        res.status(403).json({ error: 'Session changed. Reload your studio.' });
        return;
      }
      if (!limiter.hit(s.id, 120)) {
        res.status(429).json({ error: 'Too many actions. Try again in a minute.' });
        return;
      }
      next();
    });
  }
  const gameFor = (res: Response) => rooms.get((res.locals.session as Session).roomId)!;
  function subscribe(
    req: Request,
    res: Response,
    game: Game,
    role: Subscriber['role'],
    s?: Session,
  ) {
    if (subscribers.size >= 2000 || !limiter.hit(`sse:${req.ip}`, 120)) {
      res.status(429).end();
      return;
    }
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const sub: Subscriber = { roomId: game.data.id, role, res, session: s };
    subscribers.add(sub);
    send(sub);
    req.on('close', () => {
      subscribers.delete(sub);
      if (role === 'studio' && s && ![...subscribers].some((other) => other.role === 'studio' && other.session === s))
        disarm(game.data.id, s);
    });
  }
  app.get('/api/health', (_req, res) =>
    res.status(storageError ? 503 : 200).json({ ok: !storageError, version: '1.0.0' }),
  );
  app.get('/api/session', (req, res) => {
    const s = sessions.get(req.headers.cookie);
    res.json({
      authenticated: !!s,
      twitchReady: config.twitchReady,
      speechReady: !!config.speechKey,
      demoAvailable: config.demo && isLoopback(req.ip),
      ...(s ? { user: { name: s.name, mode: s.mode }, csrf: s.csrf } : {}),
    });
  });
  app.post('/api/demo/start', (req, res) => {
    if (!config.demo || !isLoopback(req.ip)) {
      res.status(404).end();
      return;
    }
    if (!limiter.hit(`demo:${req.ip}`, 10)) {
      res.status(429).json({ error: 'Demo limit reached. Try again shortly.' });
      return;
    }
    const old = sessions.get(req.headers.cookie);
    if (old) {
      sessions.clear(res, old.id);
      if (old.mode === 'demo') {
        speech.get(old.roomId)?.close();
        rooms.delete(old.roomId);
        for (const sub of subscribers)
          if (sub.roomId === old.roomId) {
            sub.res.end();
            subscribers.delete(sub);
          }
      }
    }
    const id = randomKey(),
      owner = `demo-${randomKey()}`,
      game = new Game({
        id,
        owner,
        channel: 'practice_room',
        mode: 'demo',
        overlayKey: randomKey(),
        settings: { ...defaults },
        history: [],
        priorWins: 0,
        priorPlayed: 0,
        priorBest: 0,
        leaders: {},
      });
    register(game);
    const s = sessions.create(res, {
      userId: owner,
      name: 'Demo studio',
      mode: 'demo',
      roomId: id,
    });
    res.json({ csrf: s.csrf });
  });
  app.get('/auth/twitch', (req, res) => {
    if (!config.twitchReady) {
      res.redirect('/?notice=setup');
      return;
    }
    if (!limiter.hit(`oauth:${req.ip}`, 20)) {
      res.status(429).send('Try again shortly.');
      return;
    }
    for (const [id, p] of pendingOAuth) if (p.expires < Date.now()) pendingOAuth.delete(id);
    if (pendingOAuth.size > 1000) {
      res.status(503).send('Try again shortly.');
      return;
    }
    const state = randomKey(),
      cookie = randomKey();
    pendingOAuth.set(state, { cookie, expires: Date.now() + 600000 });
    res.cookie('bait_oauth', cookie, {
      httpOnly: true,
      secure: config.production,
      sameSite: 'lax',
      maxAge: 600000,
      path: '/auth/twitch/callback',
    });
    const query = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.callback,
      response_type: 'code',
      scope: 'user:read:chat',
      state,
      force_verify: 'true',
    });
    res.redirect(`https://id.twitch.tv/oauth2/authorize?${query}`);
  });
  app.get('/auth/twitch/callback', async (req, res) => {
    const state = typeof req.query.state === 'string' ? req.query.state : '',
      pending = pendingOAuth.get(state);
    pendingOAuth.delete(state);
    res.clearCookie('bait_oauth', {
      path: '/auth/twitch/callback',
      httpOnly: true,
      secure: config.production,
      sameSite: 'lax',
    });
    if (
      !pending ||
      pending.expires < Date.now() ||
      !equal(cookies(req.headers.cookie).bait_oauth || '', pending.cookie)
    ) {
      res.redirect('/?notice=oauth');
      return;
    }
    if (req.query.error || typeof req.query.code !== 'string') {
      res.redirect('/?notice=cancelled');
      return;
    }
    try {
      const c = await auth.exchange(req.query.code);
      let game = [...rooms.values()].find(
        (g) => g.data.owner === c.userId && g.data.mode === 'twitch',
      );
      if (!game) {
        game = new Game({
          id: randomKey(),
          owner: c.userId,
          channel: c.login,
          mode: 'twitch',
          overlayKey: randomKey(),
          settings: { ...defaults },
          history: [],
          priorWins: 0,
          priorPlayed: 0,
          priorBest: 0,
          leaders: {},
        });
        register(game);
      }
      game.data.channel = c.login;
      const old = sessions.get(req.headers.cookie);
      if (old) sessions.clear(res, old.id);
      sessions.create(res, {
        userId: c.userId,
        name: c.name,
        mode: 'twitch',
        roomId: game.data.id,
      });
      connect(game);
      persist();
      res.redirect('/');
    } catch {
      res.redirect('/?notice=oauth');
    }
  });
  app.get('/api/studio', session, (_req, res) => res.json(studio(gameFor(res))));
  app.get('/api/studio/events', session, (req, res) =>
    subscribe(req, res, gameFor(res), 'studio', res.locals.session),
  );
  app.post('/api/studio/action', protect, async (req, res) => {
    const body = z
        .object({
          action: z.enum([
            'start',
            'pause',
            'resume',
            'skip',
            'end',
            'reverse',
            'connect',
            'disconnect',
          ]),
        })
        .strict()
        .parse(req.body),
      game = gameFor(res),
      s = res.locals.session as Session;
    switch (body.action) {
      case 'start':
        if (s.mode === 'twitch' && game.connection.status !== 'connected') {
          res.status(409).json({ error: 'Connect live Twitch chat before starting.' });
          return;
        }
        if (s.mode === 'twitch' && !microphoneReady(game)) {
          res.status(409).json({ error: 'Enable your microphone before starting.' });
          return;
        }
        game.begin();
        break;
      case 'pause':
        game.pause();
        break;
      case 'resume':
        if (s.mode === 'twitch' && (game.connection.status !== 'connected' || !microphoneReady(game))) {
          res.status(409).json({ error: 'Connect chat and enable your microphone before resuming.' });
          return;
        }
        game.resume();
        break;
      case 'skip':
        game.end('skipped');
        break;
      case 'end':
        game.data.settings.auto = false;
        game.end('ended');
        break;
      case 'reverse':
        game.reverse();
        break;
      case 'connect':
        if (s.mode === 'twitch') {
          await auth.validate(s.userId);
          connect(game);
        }
        break;
      case 'disconnect':
        twitch.get(game.data.id)?.stop();
        speech.get(game.data.id)?.close();
        game.data.settings.auto = false;
        if (['active', 'paused', 'settling'].includes(game.phase)) game.endIfRunning('ended');
        game.connection = { status: 'offline', detail: 'Twitch chat disconnected' };
        game.onChange();
        break;
    }
    res.json(studio(game));
  });
  app.post('/api/studio/microphone', protect, (req, res) => {
    const { armed, leaseId, renew } = z.object({
      armed: z.boolean(), leaseId: z.string().uuid(), renew: z.boolean().default(false),
    }).strict().parse(req.body),
      s = res.locals.session as Session,
      game = gameFor(res),
      lease = microphoneLeases.get(game.data.id);
    if (!armed) disarm(game.data.id, s, leaseId);
    else {
      if (![...subscribers].some((subscriber) => subscriber.role === 'studio' && subscriber.session === s)) {
        res.status(409).json({ error: 'Reconnect your studio before enabling the microphone.' });
        return;
      }
      if (!config.speechKey) {
        res.status(409).json({ error: 'Speech recognition is not configured on this server.' });
        return;
      }
      if (renew && (!lease || lease.session !== s || lease.leaseId !== leaseId || !microphoneReady(game))) {
        res.status(409).json({ error: 'Microphone readiness expired. Enable it again.' });
        return;
      }
      if (lease && (lease.session !== s || lease.leaseId !== leaseId) && microphoneReady(game)) {
        res.status(409).json({ error: 'The microphone is already enabled in another studio session.' });
        return;
      }
      microphoneLeases.set(game.data.id, { session: s, leaseId, expires: Date.now() + 30000 });
    }
    res.json({ armed: microphoneReady(game) });
  });
  app.post('/api/studio/settings', protect, (req, res) => {
    const game = gameFor(res);
    game.update(req.body);
    res.json(studio(game));
  });
  app.post('/api/studio/guess', protect, (req, res) => {
    const body = z
      .object({
        roundId: z.string().min(1).max(80),
        epoch: z.number().int().positive(),
        word: z.string().trim().min(1).max(80),
      })
      .strict()
      .parse(req.body);
    const game = gameFor(res);
    const result = game.guess(body.roundId, body.epoch, body.word);
    res.json({ ...result, studio: studio(game) });
  });
  app.post('/api/studio/award', protect, (req, res) => {
    const body = z
      .object({ roundId: z.string().min(1).max(80), hintId: z.string().min(1).max(80) })
      .strict()
      .parse(req.body);
    const game = gameFor(res);
    game.award(body.roundId, body.hintId);
    res.json(studio(game));
  });
  app.post('/api/logout', protect, (req, res) => {
    const s = res.locals.session as Session;
    disarm(s.roomId, s);
    sessions.clear(res, s.id);
    res.json({ ok: true });
  });
  app.post('/api/account/disconnect', protect, async (_req, res) => {
    const s = res.locals.session as Session;
    if (s.mode === 'twitch') {
      const revoking = auth.revoke(s.userId);
      invalidate(s.userId, auth.generation(s.userId));
      await revoking;
    }
    sessions.clear(res, s.id);
    res.json({ ok: true });
  });
  app.post('/api/account/delete', protect, async (_req, res) => {
    const s = res.locals.session as Session;
    twitch.get(s.roomId)?.stop();
    disarm(s.roomId);
    const revoking = auth.revoke(s.userId);
    sessions.deleteUser(s.userId);
    rooms.delete(s.roomId);
    for (const sub of subscribers)
      if (sub.roomId === s.roomId) {
        sub.res.end();
        subscribers.delete(sub);
      }
    store.snapshot.rooms = [...rooms.values()]
      .filter((g) => g.data.mode === 'twitch')
      .map((g) => g.data);
    await Promise.all([store.save(), revoking]);
    sessions.clear(res, s.id);
    res.json({ ok: true });
  });
  function publicGame(req: Request, res: Response, overlay = false) {
    const game = rooms.get(String(req.params.id));
    if (!game || (overlay && !equal(String(req.query.key || ''), game.data.overlayKey))) {
      res
        .status(404)
        .json({ error: 'This room is unavailable. Ask the streamer for a fresh link.' });
      return;
    }
    return game;
  }
  app.get('/api/rooms/:id/:role', (req, res) => {
    if (!['viewer', 'overlay'].includes(req.params.role)) {
      res.status(404).end();
      return;
    }
    const game = publicGame(req, res, req.params.role === 'overlay');
    if (game) res.json(game.view(req.params.role as 'viewer' | 'overlay'));
  });
  app.get('/api/rooms/:id/events/:role', (req, res) => {
    if (!['viewer', 'overlay'].includes(req.params.role)) {
      res.status(404).end();
      return;
    }
    const game = publicGame(req, res, req.params.role === 'overlay');
    if (game) subscribe(req, res, game, req.params.role as 'viewer' | 'overlay');
  });
  app.post('/api/demo/:kind', protect, (req, res) => {
    const game = gameFor(res);
    if (game.data.mode !== 'demo' || !config.demo || !isLoopback(req.ip)) {
      res.status(404).end();
      return;
    }
    if (req.params.kind === 'transcript') {
      const { text, roundId, epoch } = z
        .object({ text: z.string().min(1).max(500), roundId: z.string(), epoch: z.number().int() })
        .strict()
        .parse(req.body);
      const matched = game.transcript({
        text,
        roundId,
        epoch,
        final: true,
        confidence: 1,
        capturedAt: Date.now(),
        id: randomKey(),
      });
      res.json({ matched });
    } else if (req.params.kind === 'chat') {
      const { name, text } = z
        .object({
          name: z.string().regex(/^[a-zA-Z0-9_]{1,25}$/),
          text: z.string().min(1).max(500),
        })
        .strict()
        .parse(req.body);
      const accepted = game.chat(randomKey(), `demo:${name.toLowerCase()}`, name, text, Date.now());
      res.json({ accepted });
    } else res.status(404).end();
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32768 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', config.origin);
    // Vite validates its own HMR token. Only the development entry point enables this path.
    if (
      developmentHmr &&
      !config.production &&
      url.pathname === '/__vite_hmr' &&
      req.headers.origin === config.origin &&
      req.headers.host === new URL(config.origin).host &&
      req.headers['sec-websocket-protocol'] === 'vite-hmr'
    )
      return;
    const s = sessions.get(req.headers.cookie),
      game = s ? rooms.get(s.roomId) : undefined;
    if (
      url.pathname !== '/api/speech' ||
      req.headers.origin !== config.origin ||
      !s ||
      !game ||
      !equal(url.searchParams.get('csrf') || '', s.csrf) ||
      !config.speechKey ||
      (s.mode === 'twitch' && (!microphoneReady(game) || microphoneLeases.get(game.data.id)?.session !== s ||
        microphoneLeases.get(game.data.id)?.leaseId !== url.searchParams.get('leaseId'))) ||
      game.phase !== 'active' ||
      url.searchParams.get('round') !== game.round?.id ||
      Number(url.searchParams.get('epoch')) !== game.round.epoch ||
      speech.has(game.data.id) ||
      !limiter.hit(`speech:${s.id}`, 30)
    ) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const bridge = new SpeechBridge(
        ws,
        game,
        config.speechKey,
        () => sessions.get(req.headers.cookie) === s,
        () => speech.delete(game.data.id),
      );
      speech.set(game.data.id, bridge);
    });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Route not found.' }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    if (error instanceof AuthRevoked) {
      const s = res.locals.session as Session | undefined;
      if (s) invalidate(s.userId, error.generation);
      res.status(401).json({ error: error.message });
      return;
    }
    const status = error instanceof ZodError ? 400 : 400;
    res.status(status).json({
      error:
        error instanceof ZodError
          ? 'Check your settings or input.'
          : error instanceof Error &&
              /^(No |Only |Finish |Let |Connect |Twitch |Call )/.test(error.message)
            ? error.message
            : 'The action could not be completed. Try again.',
    });
  });
  const ticker = setInterval(() => {
    for (const game of rooms.values()) {
      if (game.data.mode === 'twitch' && microphoneLeases.has(game.data.id) && !microphoneReady(game))
        disarm(game.data.id);
      game.tick();
      speech.get(game.data.id)?.sync();
    }
  }, 250);
  const heartbeat = setInterval(() => {
    sessions.prune();
    for (const sub of subscribers) send(sub);
    for (const bridge of speech.values()) if (!bridge.valid()) bridge.close();
  }, 15000);
  return {
    app,
    server,
    rooms,
    sessions,
    store,
    auth,
    startupValidation,
    async close() {
      closed = true;
      clearInterval(ticker);
      clearInterval(heartbeat);
      clearInterval(validation);
      clearTimeout(persistTimer);
      for (const c of twitch.values()) c.stop();
      for (const b of speech.values()) b.close();
      for (const timer of broadcasts.values()) clearTimeout(timer);
      broadcasts.clear();
      for (const sub of subscribers) sub.res.end();
      wss.close();
      store.snapshot.rooms = [...rooms.values()]
        .filter((r) => r.data.mode === 'twitch')
        .map((r) => r.data);
      await store.save();
      await store.flush();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
