# Boxer Engine

An interactive, browser-based model of a BMW-airhead-style boxer engine, built
to teach how a four-stroke combustion engine actually works.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # simulation unit tests
npm run build    # typecheck + production build
```

## Deploying to Heroku

```bash
heroku create your-app-name
heroku config:set ANTHROPIC_API_KEY=sk-ant-...   # optional, see below
git push heroku main
heroku open
```

The Node buildpack installs dependencies, runs `heroku-postbuild` (which
typechecks, tests nothing, and builds to `dist/`), then prunes devDependencies.
`Procfile` starts `server/index.js`, which serves `dist/` and binds `$PORT`.

### The Claude proxy

`ANTHROPIC_API_KEY` is **optional**. Without it the deployed app runs entirely on
its built-in knowledge base — no network calls, no cost, nothing to abuse.

Set it and the server exposes `POST /api/ask`, so the tutor and click-to-ask get
real answers **without any key reaching the browser**. Three things guard it:

- The system prompt is built server-side from validated, length-capped fields.
  The client cannot supply one, so the endpoint is not a general-purpose Claude
  proxy for anyone who finds the URL.
- Rate limited per IP (24 requests / 10 min) and globally (600 / hour). Tune with
  `RATE_LIMIT_PER_IP`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_GLOBAL_HOURLY`.
- The bring-your-own-key path is disabled anywhere but localhost, and the
  "Connect Claude" button is hidden whenever the proxy is available. The SDK is a
  lazy-loaded chunk, so a deployed visitor never downloads it at all.

**Usage is billed to whichever key you set.** The limits above bound it; raise or
lower them to taste.

## Design rule

`src/sim/` contains the physics and imports nothing from three.js. `src/render/`
reads the simulation each frame and never writes to it. That separation is what
makes the physics unit-testable and what will let a different engine layout
(inline four, single) drop in later by changing a config array.

## Where things live

| Path | What it does |
|---|---|
| `sim/kinematics.ts` | Closed-form crank-slider: piston position, rod angle, piston speed |
| `sim/valvetrain.ts` | Valve timing, lift profiles, four-stroke naming |
| `sim/thermo.ts` | Single-zone pressure model, tabulated over 720° |
| `sim/engine.ts` | Ties it together; per-cylinder state for the renderer |
| `render/parts.ts` | Geometry from primitives — lathes, extrusions, no assets |
| `render/cylinderAssembly.ts` | One cylinder posed from sim state |
| `render/crankshaft.ts` | Crank throws, rotates about world Z |
| `render/valvetrain.ts` | Valves, springs, rockers, pushrods, camshaft, rocker cover |
| `render/highlight.ts` | Pulsing emissive highlight for named parts |
| `game/tutor.ts` | Watches the camera and talks about what's on screen |
| `game/questions.ts` | Question bank with per-question scene directives |
| `game/progress.ts` | XP, levels, streaks, localStorage persistence |
| `game/director.ts` | Applies a scene directive: camera, highlight, faults |
| `game/quiz.ts` | Quiz flow and panel |
| `game/ask.ts` | Click-to-ask: part picking and answers |
| `game/knowledge.ts` | Offline per-part knowledge base |

## Conventions

- **Units**: the simulation works in millimetres and SI; the renderer scales by
  1/100, so one scene unit is 100 mm.
- **Cycle angle** runs 0–720°, with 0 at TDC on the firing stroke. Crank angle
  is `cycleAngle mod 360`, zero at TDC.
- **Assembly frame**: each cylinder is authored with its origin on the crank
  axis and +X pointing out of the bore, so TDC is at maximum +X.

## Two things not to break

1. **Piston motion is not a sine wave.** The finite connecting rod makes the
   piston move faster around TDC than around BDC, and that asymmetry is the
   thing this whole project exists to show. There is a test pinning it.
2. **The left bank needs `rodSign = -1`.** Rotating the assembly 180° about Y
   flips X and Z but not Y, while the crankpin it follows is 180° round the
   crank. Get the sign wrong and the piston still moves correctly while the rod
   scissors backwards.

## Model validation

At wide-open throttle the model produces ~57 bar peak cylinder pressure, MBT
spark around 40° BTDC, and ~99 hp indicated at 6000 rpm against roughly 70 real
bhp for an R100. The gap is expected: there is no wall heat transfer and no
friction model, so these are indicated rather than brake figures.

## The quiz

Four levels — Boxer Identity, the Four-Stroke Cycle, Component Anatomy, and
Diagnostics — across three question types: anatomy, diagnostics, and general.
Each question carries a `scene` directive that drives the 3D view while it is on
screen: camera preset, auto-rotate, which parts to highlight, engine speed, and
for diagnostics, which fault to inject.

XP is awarded per correct answer (12 first try, 4 on a retry) with a streak
bonus, and everything persists to `localStorage`. A level unlocks the next once
all of its questions are answered.

**Faults are real, not cosmetic.** The dead-spark-plug question genuinely
disables ignition on that one cylinder: it drops from 26 bar peak and +318 J of
work to 7 bar and **-26 J** — a net drag on the engine, which is exactly why the
pipe goes cold. Each cylinder gets its own cycle table so a fault can affect one
bank alone.

## The live tutor

While you move the camera, a tutor watches what you are looking at and talks
about it. It works out the subject by raycasting a small grid around the screen
centre — the centre sample counts double — and combines that with how close you
are and what the engine is doing at that instant.

It only speaks on a *settled* view: 900 ms of quiet after the last camera
change, and never more than once every 9 seconds, and never twice about the same
subject in a row. Offline it walks through each part's facts without repeating
itself; every third remark it asks a question with tap-to-answer chips. With a
Claude key connected it instead reacts to the live view in its own words, with a
short rolling memory of what it has already told you.

It stays silent while the quiz is running or the ask popover is open, so only one
thing is ever talking to you. Toggle it with the **Tutor** button.

## Click-to-ask

Click any part of the engine to open a popover with a live state readout for
that cylinder and a free-text box.

Answers come from one of two places:

- **Built-in notes** (default, no setup). An offline knowledge base in
  `game/knowledge.ts` covering each part and the common questions about it. It
  says so plainly when a question falls outside what it knows, rather than
  inventing an answer.
- **Claude** (optional). "Connect Claude" stores an Anthropic API key and routes
  genuinely open-ended questions to `claude-opus-5`, grounded with the clicked
  part and the live state of both cylinders.

> ⚠️ The API key is stored in `localStorage` and sent directly from the page to
> the Anthropic API, which means it is readable by anyone with access to this
> browser and by any script on the page. That is an acceptable trade for a local
> toy; do not use a key you care about, and put a server-side proxy in front of
> it before this ever goes anywhere public.

## The valve train

Valves are splayed 45° either side of vertical and canted toward the viewer, so
both sit inside the cutaway opening instead of being buried in the casting. It
is a legitimate hemi layout and the only arrangement where the valve gear is
actually watchable.

Each valve carries a real coil spring (a tube swept along a helix) that
visibly compresses with lift, a rocker that pivots, and a pushrod running back
to the crankcase. The camshaft turns at exactly half crank speed.

**Valve clearance is modelled as lost motion**, not as a cosmetic rattle: the cam
still moves the pushrod and rocker by the full commanded lift, but the valve only
starts moving once the gap is taken up. So the wide-clearance fault shows the
rocker sweeping through a visible gap before anything happens, and the valve
never reaching full lift — which is exactly the mechanism behind a tappet tick.

The rocker covers are R80-shaped: two rounded lobes, one over each rocker, made
by extruding a peanut outline with a heavy bevel to get the pressed-alloy dome,
plus the wire guard. They are semi-transparent so the valve gear stays visible.

## Status

Built: scaffold, simulation core with 28 passing tests, the full boxer twin with
verified crank-slider motion, angular cutaway with capped section faces, the
valve train, spark and port-flow visualisation, smoke, per-cylinder fault
injection, the four-level quiz with XP and persistence, click-to-ask, and the
live tutor.

Not built yet: the P-V diagram and instrument HUD, a guided lesson mode, and
WebAudio exhaust synthesis (so the tappet tick and the misfire are visible but
not audible).
