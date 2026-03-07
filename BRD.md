# Tank Bot Battle BRD

## Product Vision
Tank Bot Battle is a MERN web app that blends the arcade readability of TankTrouble Classic with the programmable competition model of Robocode. The product centers on deterministic, replayable tank battles where users upload JSON-only bots and compare behavior on curated fixed maps.

## Core MVP Boundaries
- v1 supports `1v1` battles only.
- v1 uses fixed curated maps only.
- v1 uses one cannon weapon with bouncing bullets and no power-ups.
- v1 ships a server-authoritative battle engine and a browser-based manual sandbox/demo mode.
- v1 supports basic accounts, bot upload/paste, validation, match history, replay viewing, and fixed map browsing.

## Gameplay Intent
- Tanks are top-down 2D vehicles with forward/backward motion, left/right steering, fire cooldown, collision handling, and bounded ricochet bullets.
- Uploaded bots are interpreted from validated JSON rules; the browser never executes uploaded logic.
- Match results are deterministic and replayable from persisted snapshots.

## Inspiration
- TankTrouble Classic: maze navigation, readable top-down action, ricocheting bullets.
- Robocode: bot programming, deterministic simulated matches, replay and competition framing.
- BZFlag influenced the decision to keep ricochet-friendly map design while excluding flags/power-ups from v1 for stability and balancing simplicity.

## Technical Direction
- Frontend: React + TypeScript + Vite with an HTML5 canvas arena renderer.
- Backend: Node.js + Express + TypeScript with a server-authoritative simulation engine.
- Database: MongoDB via Mongoose for users, bots, maps, and matches.
- Shared package: engine types, rules, constants, validators, and canonical bot schema.

## Future Roadmap
- Free-for-all mode with up to 10 tanks.
- Teams mode with up to 10 tanks total.
- Map selection and future map customization.
- Optional leaderboard expansion, casual/ranked distinction, and richer replay tools.
