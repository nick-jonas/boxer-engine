import { buildSystem, buildUser } from '../../shared/prompt.js';

/**
 * One way in to Claude for both the ask panel and the tutor.
 *
 * Two routes:
 *  - `proxy`: the server holds the key and streams the answer back. This is how
 *    a deployed build works; the browser never sees a credential.
 *  - `browser-key`: the old bring-your-own-key path, deliberately restricted to
 *    localhost. Inviting visitors to paste API keys into a public page is a bad
 *    habit to teach and exposes the key to anything running on it.
 */

export type AnswerMode = 'proxy' | 'browser-key' | 'none';

export const KEY_STORAGE = 'boxer-engine-anthropic-key';

export interface AskPayload {
  kind: 'part' | 'tutor';
  partId: string;
  partName: string;
  partSummary: string;
  liveContext: string;
  cylinder?: string;
  /** kind === 'part' */
  question?: string;
  /** kind === 'tutor' */
  framing?: string;
  visible?: string[];
  wantsQuestion?: boolean;
  history?: string;
}

export class AskError extends Error {}

let serverHasProxy: boolean | null = null;

/** Ask the server once whether it can talk to Claude on our behalf. */
export async function detectProxy(): Promise<boolean> {
  if (serverHasProxy !== null) return serverHasProxy;
  try {
    const response = await fetch('/api/config');
    const data = (await response.json()) as { proxy?: boolean };
    serverHasProxy = Boolean(data.proxy);
  } catch {
    serverHasProxy = false;
  }
  return serverHasProxy;
}

/** A pasted key is only ever offered when running locally. */
export function browserKeyAllowed(): boolean {
  const host = location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '';
}

export function readKey(): string | null {
  if (!browserKeyAllowed()) return null;
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function writeKey(value: string | null): void {
  try {
    if (value) localStorage.setItem(KEY_STORAGE, value);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Storage unavailable; the app still runs on its built-in notes.
  }
}

export async function currentMode(): Promise<AnswerMode> {
  if (await detectProxy()) return 'proxy';
  if (readKey()) return 'browser-key';
  return 'none';
}

/**
 * Stream an answer, calling `onText` with each delta. Resolves with the full
 * text. Throws `AskError` with a message fit to show the user.
 */
export async function streamAnswer(payload: AskPayload, onText: (text: string) => void): Promise<string> {
  const mode = await currentMode();
  if (mode === 'proxy') return streamViaProxy(payload, onText);
  if (mode === 'browser-key') return streamViaBrowserKey(payload, onText);
  throw new AskError('Claude is not connected.');
}

async function streamViaProxy(payload: AskPayload, onText: (text: string) => void): Promise<string> {
  let response: Response;
  try {
    response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AskError('Could not reach the server.');
  }

  if (!response.ok) {
    const message = await response
      .json()
      .then((d: { error?: string }) => d.error)
      .catch(() => null);
    throw new AskError(message ?? `Server error ${response.status}.`);
  }
  if (!response.body) throw new AskError('The server sent an empty response.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
  return text;
}

async function streamViaBrowserKey(payload: AskPayload, onText: (text: string) => void): Promise<string> {
  const key = readKey();
  if (!key) throw new AskError('No API key stored.');

  // Loaded on demand so a deployed build, which never uses this path, does not
  // ship the SDK to every visitor.
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });

  try {
    const stream = client.messages.stream({
      model: 'claude-opus-5',
      max_tokens: 1500,
      output_config: { effort: 'low' },
      system: buildSystem(payload),
      messages: [{ role: 'user', content: buildUser(payload) }],
    });

    let text = '';
    stream.on('text', (delta) => {
      text += delta;
      onText(text);
    });
    await stream.finalMessage();
    return text;
  } catch (error) {
    throw new AskError(describeSdkError(error));
  }
}

function describeSdkError(error: unknown): string {
  const status = (error as { status?: number })?.status;
  if (status === 401) return 'That API key was rejected.';
  if (status === 429) return 'Rate limited — try again shortly.';
  if (typeof status === 'number') return `API error ${status}.`;
  return 'Could not reach the Anthropic API.';
}
