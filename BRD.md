# Tank Bot Battle BRD

## Product Vision
Tank Bot Battle is a MERN web app that blends readable ricochet combat with programmable tank personalities. The product presents a clear game flow: a public landing page to scout the default roster, a versus-style matchmaking lobby to lock in both bots and a map, and a focused battlefield screen where the live duel plays out on canvas.

## Current MVP Scope
- Battles are `1v1` only.
- The product uses curated fixed maps that are selectable from matchmaking.
- Each battle runs on one selected map at a time, with both bots spawning on that same field.
- The default public roster contains exactly two system bots.
- The shipped default roster is `Crossfire Fox` and `Ricochet Lynx`.
- Tanks use a single cannon with bouncing bullets and no power-ups.
- Enemy bullets can collide mid-flight, destroy each other, and emit a brief impact flash at the contact point.
- Battles simulate live on the client and then persist final results and replays through the API.
- Bot behavior comes from uploaded JSON utility goals; empty goals produce an idle bot with no movement or firing.
- The two default system bots are tuned to prioritize enemy search, pursuit, line-up, and attack behavior over passive idling.

## Core User Flow
- `/` is a public landing page.
  - it showcases the two default system bots available to fight with
  - it highlights the current arena pool
  - it exposes a single `Start` call to action
- `Start` behavior:
  - if the user is signed out, it opens an auth modal gate on the landing page
  - if the user is signed in, it routes directly to `/matchmaking`
- `/matchmaking` is a full-screen versus lobby where the user:
  - selects the left bot
  - selects the right bot
  - selects the battlefield map
  - launches the live battle
- `/battlefield` is a map-focused live arena view with minimal HUD only.
- `/bot-lab` remains the JSON authoring and sandbox page.

## Gameplay Intent
- Tanks are top-down 2D vehicles with forward/backward motion, left/right steering, wall collision, fire cooldown, and bounded ricochet bullets.
- Ricochet bullets can cancel each other on contact instead of passing through.
- The browser advances the match session tick-by-tick and renders the arena live on canvas.
- The battlefield screen is visually focused on the selected map and the two tanks acting on it.
- Match history remains replayable after the live battle finishes.
- Search and combat should feel readable and active rather than passive orbiting.

## Bot Design Contract
- Bot JSON is the primary source of behavior.
- The engine evaluates JSON-defined utility goals every decision window and converts them into movement and firing intents.
- Empty or behaviorless JSON remains valid, but produces a fully inert bot with no hidden fallback AI.
- Bot goals may define:
  - tactical goal type such as `attack`, `evade`, `reposition`, `unstick`, `lineUpShot`
  - priority
  - sensor weight profile
  - thresholds
  - movement profile
  - fire policy
  - optional score jitter/noise
- The engine supplies sensors and steering mechanics, but it does not invent meaningful behavior missing from JSON.

## AI Runtime
- The live bot engine uses a hybrid combat model:
  - utility scoring to decide which tactical goal is active
  - steering-style movement intents to turn goals into throttle, steer, and fire commands
  - waypoint-based maze navigation when the direct route to the enemy is blocked
  - predictive aiming against moving targets when line of sight is available
- The movement layer is designed specifically to avoid endless wall-circling by:
  - tracking stalled progress
  - flipping search direction after repeated non-progress
  - routing around walls instead of endlessly steering at a blocked target angle
- JSON still has the strongest influence on behavior:
  - the engine only chooses among the goals defined in the uploaded bot
  - if attack or search goals are missing from the JSON, the engine does not invent them

## Matchmaking And Presentation
- Landing should feel like a public game broadcast page, not a form-first app screen.
- Matchmaking should feel like a PvP character-select lobby with a versus presentation.
- Replay history remains accessible from matchmaking, but it is secondary to bot selection and map selection.
- Battlefield should avoid generic app-shell chrome and keep the arena as the dominant visual element.

## Technical Direction
- Frontend: React + TypeScript + Vite with routed pages and an HTML5 canvas arena renderer.
- Backend: Node.js + Express + TypeScript for auth, bot storage, public roster delivery, map delivery, and match persistence.
- Database: MongoDB via Mongoose for users, bots, maps, and matches.
- Shared package: engine types, utility-bot schema, constants, validators, maps, and the incremental battle session engine.
- Shared package AI responsibilities:
  - sensor generation
  - utility-goal evaluation
  - predictive shot alignment
  - waypoint path selection for blocked routes
  - deterministic per-seed simulation stepping
- Battle authority:
  - live battle simulation runs in the browser
  - API does not re-simulate results in v1
  - client-posted result and replay are stored as the official record
- Public interfaces:
  - `GET /bots/public` returns the system/default bot roster for landing
  - the public roster is intentionally limited to two tuned system bots
  - `GET /maps` remains public for landing and matchmaking
  - authenticated `/bots` returns system bots plus the signed-in user's private bots

## Inspirations And Deliberate Omissions
- TankTrouble Classic: top-down maze combat and bouncing bullets.
- Robocode: programmable bots and spectator framing.
- BZFlag informed the decision to keep ricochet-friendly combat while excluding flags and power-ups from the MVP for stability and readability.

## Future Roadmap
- Free-for-all mode with up to 10 tanks.
- Team battles with up to 10 tanks total.
- Expanded map pool and later map customization tools.
- Optional leaderboard and casual/ranked distinction.
- Potential move from main-thread simulation to Web Worker execution for smoother battlefield rendering.
