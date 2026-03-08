# Tank Bot Battle BRD

## Product Vision
Tank Bot Battle is a MERN web app that blends readable ricochet combat with programmable tank personalities. The product presents a clear game flow: a public landing page to scout the default roster, a versus-style matchmaking lobby to lock in both bots and a map, and a focused battlefield screen where the live duel plays out on canvas.

## Current MVP Scope
- Battles are `1v1` only.
- The product uses curated fixed maps that are selectable from matchmaking.
- Each battle runs on one selected map at a time, with both bots spawning on that same field.
- The default public roster contains exactly two system bots.
- The shipped default roster is `Backstep Viper` and `Ricochet Lynx`.
- Tanks use a single cannon with bouncing bullets and no power-ups.
- Enemy bullets can collide mid-flight, destroy each other, and emit a brief impact flash at the contact point.
- Tank bullet hits emit a short tank-hit dissolve effect and the life display animates the lost heart away.
- Battles simulate live on the client and then persist final results and replays through the API.
- Bot behavior comes from uploaded JSON utility goals; empty goals produce an idle bot with no movement or firing.
- Bot JSON now supports optional tactical openings, tactical behavior tuning, commitment windows, and controlled variance on top of the existing utility goals.
- Bot JSON now also supports an authored reverse-fire engagement drive for attack-oriented goals, so a bot can visibly backpedal while maintaining aim and firing pressure in real live matches instead of rotating away and fleeing forward.
- Every bot definition now requires a five-stat performance budget:
  - `forwardSpeed`
  - `reverseSpeed`
  - `rotationSpeed`
  - `fireRate`
  - `bulletSpeed`
- Each of the five stats must be an integer from `0` to `100`, and the total must equal exactly `300`.
- The two default system bots are tuned with contrasting archetypes: `Backstep Viper` prioritizes evasion and authored reverse-fire retreating pressure in short visible-contact bursts, while `Ricochet Lynx` stays the more direct forward-pressure bot.
- `Backstep Viper` stat line:
  - `forwardSpeed: 58`
  - `reverseSpeed: 84`
  - `rotationSpeed: 76`
  - `fireRate: 46`
  - `bulletSpeed: 36`
- `Ricochet Lynx` stat line:
  - `forwardSpeed: 78`
  - `reverseSpeed: 42`
  - `rotationSpeed: 56`
  - `fireRate: 64`
  - `bulletSpeed: 60`

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
  - live speed controls are available during the active battle and default to `1x`
  - live battles stop on the final frame and show a result state first instead of auto-replaying
  - replay playback is a separate state with its own styling and speed controls
  - result and replay-complete states for the just-finished live match include `Play Again`, which immediately starts a fresh live rematch with the same bots on the same map
  - replay completion returns to an action state with `Exit to Matchmaking`, `Replay Again`, and, for live results, `Play Again`
  - every battle has a hard round time limit so stalled fights end cleanly instead of running indefinitely
- `/bot-lab` remains the JSON authoring and sandbox page.

## Gameplay Intent
- Tanks are top-down 2D vehicles with forward/backward motion, left/right steering, wall collision, fire cooldown, and bounded ricochet bullets.
- Tank physics and weapon pacing are now per-bot rather than fully global:
  - `forwardSpeed` controls forward travel speed
  - `reverseSpeed` controls backward travel speed
  - `rotationSpeed` controls hull turning rate
  - `fireRate` controls shot cooldown
  - `bulletSpeed` controls projectile travel speed and intercept prediction
- Ricochet bullets can cancel each other on contact instead of passing through.
- Tanks display heart-based lives above the hull instead of numeric health counters.
- The browser advances the match session tick-by-tick and renders the arena live on canvas.
- Live battles expose `0.25x`, `0.5x`, `1x`, `2x`, and `4x` speed controls; the previous `4x` pacing now maps to the new default `1x`, and the new `4x` is faster than before.
- The battlefield screen is visually focused on the selected map and the two tanks acting on it.
- Match history remains replayable after the live battle finishes.
- Replay playback is non-looping and user-controlled rather than automatic.
- Live and replay speed labels share the same timing curve, so `1x`, `2x`, and `4x` mean the same pacing in both modes.
- Search and combat should feel readable and active rather than passive orbiting.
- Tactical matches should show distinct phases such as opening scout, flank or cover setup, engagement, disengage, and re-engage.

## Bot Design Contract
- Bot JSON is the primary source of behavior.
- The engine evaluates JSON-defined utility goals every decision window and converts them into movement and firing intents.
- Tactical JSON is additive to goals rather than replacing them.
- Bot JSON must include a valid `stats` object before it can be saved or used as an authored bot.
- The `stats` budget is deliberately capped at `300 / 300` so no bot can set all five combat stats to `100`.
- Bots may optionally author weighted openings such as `fastScout`, `wideFlankLeft`, `wideFlankRight`, `centerProbe`, and `holdAngle`.
- Bots may optionally author tactical preferences for `roam`, `investigateLastSeen`, `takeCover`, `peekShot`, `flank`, `pressure`, `retreat`, and `baitShot`.
- Bots may optionally author commitment settings and controlled randomness so plans persist for a while but repeated matches still vary.
- Empty or behaviorless JSON remains valid, but produces a fully inert bot with no hidden fallback AI.
- Bot goals may define:
  - tactical goal type such as `attack`, `evade`, `reposition`, `unstick`, `lineUpShot`
  - priority
  - sensor weight profile
  - thresholds
  - movement profile
  - fire policy
  - optional score jitter/noise
- `movementProfile` may also author:
  - `engagementDrive: "default" | "reverseBurst"`
  - `reverseBurstTicks`
  - `reverseHoldTicks`
- The engine supplies sensors and steering mechanics, but it does not invent meaningful behavior missing from JSON.

## AI Runtime
- The live bot engine uses a hybrid combat model:
  - a tactical planner that chooses openings and short multi-step plans
  - utility scoring to decide which tactical goal is active
  - steering-style movement intents to turn goals into throttle, steer, and fire commands
  - waypoint-based maze navigation when the direct route to the enemy is blocked
  - predictive aiming against moving targets when line of sight is available
- Tactical planner inputs now include:
  - cover score
  - exposure score
  - route safety
  - flank opportunity
  - bank-shot opportunity
  - last-seen enemy tracking and authored opening state
- The movement layer is designed specifically to avoid endless wall-circling by:
  - tracking stalled progress
  - flipping search direction after repeated non-progress
  - routing around walls instead of endlessly steering at a blocked target angle
- Tactical state persists for authored commitment windows so tanks do not thrash between plans every few ticks.
- Reverse-fire engagement also persists across short authored burst windows, so a reverse-capable bot visibly backpedals, holds aim briefly, and then re-evaluates instead of flickering between forward and reverse every few ticks.
- During reverse-fire engagement, the hull keeps steering from the active firing solution so the tank remains aimed at the enemy while moving backward.
- Reverse-capable goals now receive explicit live-contact promotion, so `Backstep Viper` prefers authored reverse-fire when it has a clean visible shot instead of letting roam or forward-retreat behavior win the same moment.
- Reverse-fire now also cancels when a bot gets pinned against walls or stalls in place, which prevents silent face-to-face deadlocks where both tanks stop creating combat pressure.
- Match variety comes from seeded controlled randomness, so repeated battles can diverge while a saved replay remains exact for that match.
- JSON still has the strongest influence on behavior:
  - the engine only chooses among the goals defined in the uploaded bot
  - if goals or tactics are missing from the JSON, the engine does not invent them

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
- Shared package stat responsibilities:
  - validate the five required bot stats
  - resolve `0-100` stat scores into runtime movement, turn, cooldown, and projectile values
  - keep health, bounce count, bullet lifetime, and collision radii global for now
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
- Future bot-stat expansion may add `armor` and `ricochetControl`, but those two stats are intentionally deferred beyond the current five-stat MVP.
