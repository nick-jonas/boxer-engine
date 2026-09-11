import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystem, buildUser, sanitize } from '../shared/prompt.js';

/**
 * Static host for the built app, plus an optional Claude proxy.
 *
 * The proxy exists so the API key never reaches the browser. It only turns on
 * when ANTHROPIC_API_KEY is set; without it the app still runs entirely on its
 * built-in knowledge base.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(here, '..', 'dist');

const app = express();
// Heroku terminates TLS at the router, so the real client IP is in
// X-Forwarded-For. Without this every request looks like it came from the
// router and the rate limiter would throttle everyone as one.
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

// --- Rate limiting --------------------------------------------------------
// Deliberately crude and in-memory: it resets on dyno restart, which is fine.
// Its job is to bound the bill, not to be airtight.
const PER_IP_LIMIT = Number(process.env.RATE_LIMIT_PER_IP ?? 24);
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000);
const GLOBAL_HOURLY_LIMIT = Number(process.env.RATE_LIMIT_GLOBAL_HOURLY ?? 600);

const hits = new Map();
let globalCount = 0;
let globalResetAt = Date.now() + 60 * 60 * 1000;

function rateLimit(req, res, next) {
  const now = Date.now();

  if (now > globalResetAt) {
    globalCount = 0;
    globalResetAt = now + 60 * 60 * 1000;
  }
  if (globalCount >= GLOBAL_HOURLY_LIMIT) {
    res.status(429).json({ error: 'This demo has hit its hourly limit. Try again later.' });
    return;
  }

  const ip = req.ip ?? 'unknown';
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else if (entry.count >= PER_IP_LIMIT) {
    const seconds = Math.ceil((entry.resetAt - now) / 1000);
    res.set('Retry-After', String(seconds));
    res.status(429).json({ error: `Slow down a moment — try again in ${seconds}s.` });
    return;
  } else {
    entry.count += 1;
  }

  // Opportunistic cleanup; this map only ever holds recent callers.
  if (hits.size > 5000) {
    for (const [key, value] of hits) if (now > value.resetAt) hits.delete(key);
  }

  globalCount += 1;
  next();
}

// --- API ------------------------------------------------------------------
app.get('/api/config', (_req, res) => {
  res.json({ proxy: Boolean(client) });
});

app.post('/api/ask', rateLimit, async (req, res) => {
  if (!client) {
    res.status(503).json({ error: 'Claude is not configured on this server.' });
    return;
  }

  let payload;
  try {
    payload = sanitize(req.body);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Bad request' });
    return;
  }

  res.set({
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
  });

  try {
    const stream = client.messages.stream({
      model: 'claude-opus-5',
      max_tokens: 1500,
      output_config: { effort: 'low' },
      system: buildSystem(payload),
      messages: [{ role: 'user', content: buildUser(payload) }],
    });

    stream.on('text', (delta) => res.write(delta));
    await stream.finalMessage();
    res.end();
  } catch (error) {
    console.error('[api/ask]', error);
    // Headers are already sent once streaming starts, so the only honest
    // signal left is to close the stream with a note.
    if (res.headersSent) res.end('\n[the answer was cut short]');
    else res.status(502).json({ error: 'Upstream error talking to Claude.' });
  }
});

// --- Static site ----------------------------------------------------------
app.use(
  express.static(distDir, {
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      // Vite fingerprints asset filenames, so they can be cached hard.
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);

// Single-page fallback. Express 5 rejects a bare '*' route path, so this is a
// terminal middleware rather than app.get('*').
app.use((req, res) => {
  if (req.method !== 'GET') {
    res.status(405).end();
    return;
  }
  res.sendFile(path.join(distDir, 'index.html'));
});

// Error handler last, so it also catches malformed JSON from the body parser.
// Express's default handler renders a stack trace into the response, which
// leaks absolute file paths to anyone who posts a broken body.
// eslint-disable-next-line no-unused-vars -- Express detects handlers by arity
app.use((err, _req, res, _next) => {
  const status = err?.status ?? err?.statusCode ?? 500;
  if (status >= 500) console.error('[server]', err);
  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(status === 400 ? 400 : status).json({
    error: status === 400 ? 'Malformed request body.' : 'Server error.',
  });
});

const port = process.env.PORT || 5173;
app.listen(port, () => {
  console.log(`boxer-engine listening on ${port} (claude proxy: ${client ? 'on' : 'off'})`);
});
