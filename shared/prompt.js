/**
 * Prompt construction, shared by the Heroku proxy and the browser-key path so
 * the two cannot drift apart.
 *
 * The system prompt is always built HERE from validated fields — never accepted
 * from the client. Otherwise the deployed /api/ask endpoint would be a free
 * general-purpose Claude proxy for anyone who found the URL.
 */

export const LIMITS = {
  partId: 40,
  partName: 60,
  partSummary: 600,
  liveContext: 700,
  question: 500,
  history: 1500,
  visible: 10,
};

const ENGINE_FACTS =
  'Engine: 94 x 70.6 mm bore and stroke, 980 cc, 8.5:1 compression, air-cooled, ' +
  'pushrod OHV, two opposed cylinders firing 360 degrees apart.';

/** @param {Record<string, any>} p */
export function buildSystem(p) {
  if (p.kind === 'tutor') {
    return [
      'You are a friendly, knowledgeable mechanic sitting beside someone exploring a 3D model of a BMW-airhead-style boxer twin engine.',
      'They just moved the camera. React to what is now on screen in at most two short sentences, plain language, no markdown, no greeting.',
      'Be specific and mechanical. Point at what they can actually see right now. Never repeat a point you have already made.',
      p.wantsQuestion
        ? 'End with one short question that checks their understanding of what is on screen.'
        : 'Do not ask a question this time.',
      ENGINE_FACTS,
    ].join('\n');
  }

  return [
    'You answer questions about a simulated BMW-airhead-style boxer twin engine shown in a 3D teaching app.',
    'Answer in at most three short sentences, in plain language, with no markdown.',
    'Be concrete and mechanical. If a question cannot be answered from engine principles, say so briefly.',
    `The user clicked on: ${p.partName}. ${p.partSummary}`,
    ENGINE_FACTS,
    `Live state right now: ${p.liveContext}`,
  ].join('\n');
}

/** @param {Record<string, any>} p */
export function buildUser(p) {
  if (p.kind === 'tutor') {
    return [
      `They are looking at: ${p.partName}${p.cylinder && p.cylinder !== 'engine' ? ` on the ${p.cylinder} cylinder` : ''}.`,
      `Framing: ${p.framing}. Also in view: ${(p.visible || []).join(', ')}.`,
      `Live state: ${p.liveContext}`,
      p.history ? `Recent conversation:\n${p.history}` : 'This is the first thing you have said.',
    ].join('\n');
  }
  return p.question;
}

/**
 * Validate and clamp a client payload. Throws on anything structurally wrong,
 * truncates anything merely too long.
 * @param {unknown} body
 */
export function sanitize(body) {
  if (!body || typeof body !== 'object') throw new Error('body must be an object');
  const b = /** @type {Record<string, unknown>} */ (body);

  const kind = b.kind === 'tutor' ? 'tutor' : 'part';
  const str = (v, max, fallback = '') =>
    typeof v === 'string' ? v.slice(0, max) : fallback;

  const out = {
    kind,
    partId: str(b.partId, LIMITS.partId, 'unknown'),
    partName: str(b.partName, LIMITS.partName, 'this part'),
    partSummary: str(b.partSummary, LIMITS.partSummary),
    liveContext: str(b.liveContext, LIMITS.liveContext),
    cylinder: str(b.cylinder, 20, 'engine'),
  };

  if (kind === 'part') {
    const question = str(b.question, LIMITS.question).trim();
    if (!question) throw new Error('question is required');
    return { ...out, question };
  }

  return {
    ...out,
    framing: ['close', 'medium', 'wide'].includes(/** @type {string} */ (b.framing))
      ? b.framing
      : 'medium',
    visible: Array.isArray(b.visible)
      ? b.visible.filter((v) => typeof v === 'string').slice(0, LIMITS.visible).map((v) => v.slice(0, LIMITS.partId))
      : [],
    wantsQuestion: b.wantsQuestion === true,
    history: str(b.history, LIMITS.history),
  };
}
