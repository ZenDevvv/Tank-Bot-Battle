import { useEffect, useMemo, useRef, useState } from "react";
import {
  botDefinitionExample,
  type BattleSession,
  createBattleSession,
  createInitialTankState,
  defaultBotStats,
  fixedMaps,
  getBattleSnapshot,
  stepBattleSession,
  TANK_STAT_BUDGET,
  tankStatKeys,
  totalBotStats,
  type BotStats,
  type MatchResult,
  type MatchSnapshot
} from "@tank-bot-battle/shared";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { ArenaCanvas } from "./components/ArenaCanvas";
import { api } from "./lib/api";
import { resolveBattlefieldTickInterval } from "./lib/battlefieldSpeed";
import { simulateSandbox, type SandboxScriptSegment } from "./lib/sandbox";
import type {
  AuthUser,
  BattleOutcome,
  BattlefieldMode,
  BotRecord,
  LastLiveMatchConfig,
  MapRecord,
  MatchRecord,
  ReplayRecord,
  ReplaySpeed
} from "./types";

const authDefaults = {
  username: "",
  email: "",
  password: ""
};

const replaySpeeds: ReplaySpeed[] = [0.25, 0.5, 1, 2, 4];

type ActiveLiveBattleContext = {
  token: string;
  leftBot: BotRecord;
  rightBot: BotRecord;
  mapId: string;
  mapName: string;
};

type LandingPageProps = {
  publicBots: BotRecord[];
  featuredMap: MapRecord | null;
  isAuthenticated: boolean;
  username?: string;
  authOpen: boolean;
  authMode: "register" | "login";
  authForm: typeof authDefaults;
  status: string;
  onStart: () => void;
  onDismissAuth: () => void;
  onAuthModeChange: (mode: "register" | "login") => void;
  onAuthFormChange: (field: keyof typeof authDefaults, value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onGoToBotLab: () => void;
  onSignOut: () => void;
};

type MatchmakingPageProps = {
  user: AuthUser;
  bots: BotRecord[];
  maps: MapRecord[];
  leftBotId: string;
  rightBotId: string;
  selectedMapId: string;
  matches: MatchRecord[];
  battleRunning: boolean;
  status: string;
  onLeftBotChange: (botId: string) => void;
  onRightBotChange: (botId: string) => void;
  onMapChange: (mapId: string) => void;
  onRunMatch: () => Promise<void>;
  onOpenReplay: (matchId: string) => Promise<void>;
  onOpenBotLab: () => void;
  onSignOut: () => void;
};

type BattlefieldStagePageProps = {
  replay: ReplayRecord | null;
  liveFrame: MatchSnapshot | null;
  battlefieldMode: BattlefieldMode;
  outcome: BattleOutcome | null;
  status: string;
  mapName: string;
  mapId: string;
  liveSpeed: ReplaySpeed;
  replaySpeed: ReplaySpeed;
  replayPlaybackToken: number;
  onReplayStart: () => void;
  showPlayAgain: boolean;
  onPlayAgain: () => void;
  onLiveSpeedChange: (speed: ReplaySpeed) => void;
  onReplaySpeedChange: (speed: ReplaySpeed) => void;
  onPlaybackComplete: () => void;
  onExit: () => void;
  onSignOut: () => void;
};

type BotLabPageProps = {
  botJson: string;
  validationError: string;
  sandboxReplay: ReplayRecord["replay"];
  mapId: string;
  onBotJsonChange: (value: string) => void;
  onLoadSample: () => Promise<void>;
  onValidate: () => Promise<void>;
  onSave: () => Promise<void>;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSandboxRun: (segments: SandboxScriptSegment[]) => void;
};

function fallbackMaps(): MapRecord[] {
  return fixedMaps.map((map) => ({
    id: map.id,
    name: map.name,
    width: map.width,
    height: map.height,
    spawnPoints: map.spawnPoints,
    walls: map.walls
  }));
}

const statLabels: Record<keyof BotStats, string> = {
  forwardSpeed: "Forward",
  reverseSpeed: "Reverse",
  rotationSpeed: "Turn",
  fireRate: "Fire Rate",
  bulletSpeed: "Bullet Speed"
};

const statShortLabels: Record<keyof BotStats, string> = {
  forwardSpeed: "FWD",
  reverseSpeed: "REV",
  rotationSpeed: "TURN",
  fireRate: "FIRE",
  bulletSpeed: "SHOT"
};

function hasValidStats(value: unknown): value is BotStats {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return tankStatKeys.every((key) => {
    const stat = candidate[key];
    return Number.isInteger(stat) && Number(stat) >= 0 && Number(stat) <= 100;
  }) && totalBotStats(candidate as BotStats) === TANK_STAT_BUDGET;
}

function normalizeBotDefinition(bot: BotRecord): BotRecord["definition"] {
  const definition = bot.definition as BotRecord["definition"] & {
    stats?: BotStats;
    goals?: Array<{ type?: string }>;
    rules?: unknown[];
  };
  const stats = hasValidStats(definition?.stats) ? definition.stats : defaultBotStats;

  if (Array.isArray(definition?.goals)) {
    return {
      ...definition,
      stats,
      goals: definition.goals
    };
  }

  return {
    name: definition?.name ?? bot.name,
    version: definition?.version ?? bot.version,
    author: definition?.author ?? bot.author,
    stats,
    goals: []
  };
}

function describeBot(bot: BotRecord): string {
  const definition = normalizeBotDefinition(bot);

  if (definition.goals.length === 0) {
    const legacyRules = (bot.definition as { rules?: unknown[] } | undefined)?.rules;
    return Array.isArray(legacyRules) && legacyRules.length > 0
      ? "Legacy bot definition. Re-save in Bot Lab to enable utility goals."
      : "Idle until its JSON gains goals.";
  }

  return definition.goals
    .slice(0, 3)
    .map((goal) => goal.type)
    .join(" / ");
}

function describeMap(map: MapRecord): string {
  return `${map.walls.length} wall blocks / ${Math.round(Math.abs(map.spawnPoints[0].x - map.spawnPoints[1].x))} horizontal spawn spread`;
}

function botGoalTags(bot: BotRecord): string[] {
  const definition = normalizeBotDefinition(bot);
  if (definition.goals.length === 0) {
    return ["idle"];
  }

  return definition.goals.slice(0, 3).map((goal) => goal.type);
}

function botStats(bot: BotRecord): BotStats {
  return normalizeBotDefinition(bot).stats;
}

function botStatTotal(bot: BotRecord): number {
  return totalBotStats(botStats(bot));
}

function botStatRows(bot: BotRecord): Array<{ key: keyof BotStats; label: string; shortLabel: string; value: number }> {
  const stats = botStats(bot);
  return tankStatKeys.map((key) => ({
    key,
    label: statLabels[key],
    shortLabel: statShortLabels[key],
    value: stats[key]
  }));
}

function BotStatSummary({ bot, compact = false }: { bot: BotRecord; compact?: boolean }): React.ReactElement {
  const rows = botStatRows(bot);
  const total = botStatTotal(bot);

  if (compact) {
    return (
      <div className="bot-stat-chip-row">
        {rows.map((row) => (
          <span key={`${bot.id}-${row.key}`} className="stat-chip">
            <span>{row.shortLabel}</span>
            <strong>{row.value}</strong>
          </span>
        ))}
        <span className="stat-chip budget-chip">{total} / {TANK_STAT_BUDGET}</span>
      </div>
    );
  }

  return (
    <div className="bot-stat-panel">
      <div className="bot-stat-budget">
        <span className="choice-tag">Stats</span>
        <strong>{total} / {TANK_STAT_BUDGET}</strong>
      </div>
      <div className="bot-stat-grid">
        {rows.map((row) => (
          <div key={`${bot.id}-${row.key}`} className="bot-stat-row">
            <div className="bot-stat-line">
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
            <div className="bot-stat-track" aria-hidden="true">
              <span className="bot-stat-fill" style={{ width: `${row.value}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatReason(reason: string): string {
  if (reason === "draw") {
    return "Draw";
  }

  if (reason === "timeout") {
    return "Timeout";
  }

  return "Elimination";
}

function resolveWinnerName(input: {
  winnerTankId: string | null;
  leftTankId?: string;
  leftTankName: string;
  rightTankId?: string;
  rightTankName: string;
}): string | null {
  if (!input.winnerTankId || input.winnerTankId === "draw") {
    return null;
  }

  if (input.winnerTankId === "left" || input.winnerTankId === input.leftTankId) {
    return input.leftTankName;
  }

  if (input.winnerTankId === "right" || input.winnerTankId === input.rightTankId) {
    return input.rightTankName;
  }

  return null;
}

function buildBattleOutcome(input: {
  winnerTankId: string | null;
  leftTankId?: string;
  leftTankName: string;
  rightTankId?: string;
  rightTankName: string;
  reason: string;
  totalTicks: number;
  mapId: string;
  source: BattleOutcome["source"];
}): BattleOutcome {
  return {
    winnerTankId: input.winnerTankId,
    winnerName: resolveWinnerName(input),
    leftTankName: input.leftTankName,
    rightTankName: input.rightTankName,
    reason: input.reason,
    totalTicks: input.totalTicks,
    mapId: input.mapId,
    source: input.source
  };
}

function outcomeHeading(outcome: BattleOutcome | null): string {
  if (!outcome) {
    return "Battlefield";
  }

  return outcome.winnerName ? `${outcome.winnerName} Wins` : "Draw";
}

function outcomeDetail(outcome: BattleOutcome | null): string {
  if (!outcome) {
    return "";
  }

  return `${formatReason(outcome.reason)} after ${outcome.totalTicks} ticks`;
}

function LoadingScreen(): React.ReactElement {
  return (
    <main className="page-shell">
      <section className="panel">
        <p className="eyebrow">Loading</p>
        <h2>Preparing your command console</h2>
      </section>
    </main>
  );
}

function LandingPage({
  publicBots,
  featuredMap,
  isAuthenticated,
  username,
  authOpen,
  authMode,
  authForm,
  status,
  onStart,
  onDismissAuth,
  onAuthModeChange,
  onAuthFormChange,
  onSubmit,
  onGoToBotLab,
  onSignOut
}: LandingPageProps): React.ReactElement {
  return (
    <main className="landing-shell">
      <section className="landing-topbar">
        <div>
          <p className="eyebrow">Tank Bot Battle</p>
          <h1 className="landing-brand">Arena Broadcast</h1>
        </div>
        <div className="button-row">
          {isAuthenticated ? (
            <>
              <button className="ghost-button" type="button" onClick={onGoToBotLab}>Bot Lab</button>
              <button className="ghost-button" type="button" onClick={onSignOut}>Sign out</button>
            </>
          ) : null}
        </div>
      </section>

      <section className="landing-hero landing-showcase">
        <div className="landing-copy">
          <p className="eyebrow">Live Bot Roster</p>
          <h2>Scout the default challengers, then enter the versus lobby.</h2>
          <p className="lede">
            Every tank on this roster can be dropped straight into a live browser-simulated duel. Pick your matchup, choose the battlefield, and launch into the arena.
          </p>
          <div className="landing-actions">
            <button className="primary-button landing-start" type="button" onClick={onStart}>
              {isAuthenticated ? "Start Matchmaking" : "Start"}
            </button>
            <p className="status-line">
              {isAuthenticated
                ? `Signed in as ${username}. Start jumps directly into the PvP lobby.`
                : "Start opens the command gate so you can authenticate before entering matchmaking."}
            </p>
          </div>
        </div>

        <article className="panel landing-map-card">
          <p className="eyebrow">Featured Arena</p>
          <h3>{featuredMap?.name ?? "Battlefield"}</h3>
          <p className="status-line">{featuredMap ? describeMap(featuredMap) : "Curated arenas load here."}</p>
          <div className="landing-map-meta">
            <span className="choice-tag">{featuredMap?.width ?? 0} x {featuredMap?.height ?? 0}</span>
            <span className="choice-tag">{featuredMap?.walls.length ?? 0} cover blocks</span>
          </div>
        </article>
      </section>

      <section className="landing-roster panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Available Bots To Fight</p>
            <h2>Default arena roster</h2>
          </div>
          <span className="field-chip">{publicBots.length} ready</span>
        </div>
        <div className="landing-roster-grid">
          {publicBots.length > 0 ? publicBots.map((bot) => (
            <article key={bot.id} className="choice-card landing-bot-card">
              <div className="landing-bot-head">
                <div>
                  <strong>{bot.name}</strong>
                  <span>{describeBot(bot)}</span>
                </div>
                <span className="choice-tag">System</span>
              </div>
              <div className="landing-bot-tags">
                {botGoalTags(bot).map((tag) => (
                  <span key={`${bot.id}-${tag}`} className="mini-tag">{tag}</span>
                ))}
              </div>
              <BotStatSummary bot={bot} compact />
            </article>
          )) : <p className="empty-copy">System roster is loading.</p>}
        </div>
      </section>

      {authOpen ? (
        <div className="auth-backdrop" role="presentation" onClick={onDismissAuth}>
          <form className="auth-card auth-modal" onSubmit={(event) => void onSubmit(event)} onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">Command Gate</p>
                <h2>{authMode === "register" ? "Register pilot" : "Pilot login"}</h2>
              </div>
              <button className="ghost-button" type="button" onClick={onDismissAuth}>Close</button>
            </div>
            <div className="tab-row">
              <button type="button" className={authMode === "register" ? "tab active" : "tab"} onClick={() => onAuthModeChange("register")}>Register</button>
              <button type="button" className={authMode === "login" ? "tab active" : "tab"} onClick={() => onAuthModeChange("login")}>Login</button>
            </div>
            {authMode === "register" ? (
              <label>
                Username
                <input value={authForm.username} onChange={(event) => onAuthFormChange("username", event.target.value)} />
              </label>
            ) : null}
            <label>
              Email
              <input type="email" value={authForm.email} onChange={(event) => onAuthFormChange("email", event.target.value)} />
            </label>
            <label>
              Password
              <input type="password" value={authForm.password} onChange={(event) => onAuthFormChange("password", event.target.value)} />
            </label>
            <button className="primary-button" type="submit">{authMode === "register" ? "Enter matchmaking" : "Open matchmaking"}</button>
            <p className="status-line">{status}</p>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function TopBar({ title, username, onSignOut }: { title: string; username: string; onSignOut: () => void }): React.ReactElement {
  return (
    <section className="top-bar">
      <div>
        <p className="eyebrow">Signed In</p>
        <h1>{title}</h1>
        <p className="status-line">Pilot: {username}</p>
      </div>
      <div className="top-actions">
        <div className="tab-row">
          <NavLink to="/matchmaking" className={({ isActive }) => isActive ? "tab active" : "tab"}>Matchmaking</NavLink>
          <NavLink to="/bot-lab" className={({ isActive }) => isActive ? "tab active" : "tab"}>Bot Lab</NavLink>
        </div>
        <button className="ghost-button" onClick={onSignOut}>Sign out</button>
      </div>
    </section>
  );
}

function BotChoiceColumn({
  title,
  subtitle,
  selectedBotId,
  bots,
  onSelect
}: {
  title: string;
  subtitle: string;
  selectedBotId: string;
  bots: BotRecord[];
  onSelect: (botId: string) => void;
}): React.ReactElement {
  const systemBots = bots.filter((bot) => bot.isSystem);
  const customBots = bots.filter((bot) => !bot.isSystem);

  return (
    <article className="panel selection-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{subtitle}</p>
          <h2>{title}</h2>
        </div>
      </div>

      <div className="selection-stack">
        <div className="selection-group">
          <p className="selection-group-title">Default Bots</p>
          <div className="choice-grid">
            {systemBots.map((bot) => (
              <button
                key={bot.id}
                type="button"
                className={selectedBotId === bot.id ? "choice-card selected" : "choice-card"}
                onClick={() => onSelect(bot.id)}
              >
                <span className="choice-tag">System</span>
                <strong>{bot.name}</strong>
                <span>{describeBot(bot)}</span>
                <BotStatSummary bot={bot} />
              </button>
            ))}
          </div>
        </div>

        <div className="selection-group">
          <p className="selection-group-title">Your Bots</p>
          {customBots.length > 0 ? (
            <div className="choice-grid">
              {customBots.map((bot) => (
                <button
                  key={bot.id}
                  type="button"
                  className={selectedBotId === bot.id ? "choice-card selected" : "choice-card"}
                  onClick={() => onSelect(bot.id)}
                >
                  <span className="choice-tag">Custom</span>
                  <strong>{bot.name}</strong>
                  <span>{describeBot(bot)}</span>
                  <BotStatSummary bot={bot} />
                </button>
              ))}
            </div>
          ) : (
            <p className="empty-copy">No custom bots yet. Build one in Bot Lab and it will show up here.</p>
          )}
        </div>
      </div>
    </article>
  );
}

function MatchmakingPage({
  user,
  bots,
  maps,
  leftBotId,
  rightBotId,
  selectedMapId,
  matches,
  battleRunning,
  status,
  onLeftBotChange,
  onRightBotChange,
  onMapChange,
  onRunMatch,
  onOpenReplay,
  onOpenBotLab,
  onSignOut
}: MatchmakingPageProps): React.ReactElement {
  const leftBot = bots.find((bot) => bot.id === leftBotId) ?? null;
  const rightBot = bots.find((bot) => bot.id === rightBotId) ?? null;
  const selectedMap = maps.find((map) => map.id === selectedMapId) ?? maps[0] ?? null;
  const botDirectory = new Map(bots.map((bot) => [bot.id, bot]));
  const mapDirectory = new Map(maps.map((map) => [map.id, map]));

  return (
    <main className="matchmaking-shell">
      <section className="matchmaking-header panel">
        <div>
          <p className="eyebrow">PvP Matchmaking</p>
          <h1>Lock in the duel</h1>
          <p className="status-line">Pilot {user.username}. Select both combatants, choose the arena, then drop into the live battle feed.</p>
        </div>
        <div className="button-row">
          <span className="field-chip">{battleRunning ? "Live battle running" : "Lobby ready"}</span>
          <button className="ghost-button" type="button" onClick={onOpenBotLab}>Bot Lab</button>
          <button className="ghost-button" type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </section>

      <section className="matchmaking-stage panel">
        <article className="versus-card versus-side left">
          <p className="eyebrow">Left slot</p>
          <strong>{leftBot?.name ?? "Select left bot"}</strong>
          <span>{leftBot ? describeBot(leftBot) : "Choose from the roster below."}</span>
          <div className="landing-bot-tags">
            {leftBot ? botGoalTags(leftBot).map((tag) => (
              <span key={`left-${tag}`} className="mini-tag">{tag}</span>
            )) : <span className="mini-tag">awaiting pilot</span>}
          </div>
          {leftBot ? <BotStatSummary bot={leftBot} /> : null}
        </article>

        <article className="versus-core">
          <p className="eyebrow">Live Arena</p>
          <div className="versus-mark">VS</div>
          <div className="map-preview-card">
            <strong>{selectedMap?.name ?? "Select a map"}</strong>
            <span>{selectedMap ? describeMap(selectedMap) : "Choose a battlefield from the arena deck."}</span>
          </div>
          <button className="primary-button matchmaking-launch" onClick={() => void onRunMatch()} disabled={battleRunning || !leftBotId || !rightBotId || !selectedMapId}>
            {battleRunning ? "Battle in progress" : "Launch live battle"}
          </button>
          <p className="status-line">{status}</p>
        </article>

        <article className="versus-card versus-side right">
          <p className="eyebrow">Right slot</p>
          <strong>{rightBot?.name ?? "Select right bot"}</strong>
          <span>{rightBot ? describeBot(rightBot) : "Choose from the roster below."}</span>
          <div className="landing-bot-tags">
            {rightBot ? botGoalTags(rightBot).map((tag) => (
              <span key={`right-${tag}`} className="mini-tag">{tag}</span>
            )) : <span className="mini-tag">awaiting rival</span>}
          </div>
          {rightBot ? <BotStatSummary bot={rightBot} /> : null}
        </article>
      </section>

      <section className="matchmaking-selection-grid">
        <BotChoiceColumn title="Select Left Combatant" subtitle="Rose pilot" selectedBotId={leftBotId} bots={bots} onSelect={onLeftBotChange} />
        <BotChoiceColumn title="Select Right Combatant" subtitle="Moss pilot" selectedBotId={rightBotId} bots={bots} onSelect={onRightBotChange} />
      </section>

      <section className="panel map-deck-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Arena Deck</p>
            <h2>Choose the battleground</h2>
          </div>
        </div>
        <div className="map-deck-grid">
          {maps.map((map) => (
            <button
              key={map.id}
              type="button"
              className={selectedMapId === map.id ? "choice-card selected map-card map-tile" : "choice-card map-card map-tile"}
              onClick={() => onMapChange(map.id)}
            >
              <strong>{map.name}</strong>
              <span>{describeMap(map)}</span>
              <div className="landing-bot-tags">
                <span className="mini-tag">{map.width} x {map.height}</span>
                <span className="mini-tag">{map.spawnPoints.length} spawns</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="panel replay-drawer">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Recent Broadcasts</p>
            <h2>Replay history</h2>
          </div>
          <span className="field-chip">{matches.length} saved</span>
        </div>
        <div className="replay-strip">
          {matches.map((match) => {
            const matchMap = mapDirectory.get(match.mapId);
            const matchLeftBot = botDirectory.get(match.leftBotId);
            const matchRightBot = botDirectory.get(match.rightBotId);

            return (
              <button key={match.id} className="history-card replay-card" onClick={() => void onOpenReplay(match.id)} disabled={battleRunning}>
                <strong>{matchLeftBot?.name ?? "Unknown"} vs {matchRightBot?.name ?? "Unknown"}</strong>
                <span>{matchMap?.name ?? "Unknown map"} / {match.reason}</span>
                <span>{match.totalTicks} ticks / {new Date(match.createdAt).toLocaleString()}</span>
              </button>
            );
          })}
          {matches.length === 0 ? <p className="empty-copy">No saved battles yet. Launch one from this lobby to start your replay history.</p> : null}
        </div>
      </section>
    </main>
  );
}

export function BattlefieldStagePage({
  replay,
  liveFrame,
  battlefieldMode,
  outcome,
  status,
  mapName,
  mapId,
  liveSpeed,
  replaySpeed,
  replayPlaybackToken,
  onReplayStart,
  showPlayAgain,
  onPlayAgain,
  onLiveSpeedChange,
  onReplaySpeedChange,
  onPlaybackComplete,
  onExit,
  onSignOut
}: BattlefieldStagePageProps): React.ReactElement {
  const replayFrames = replay?.replay ?? [];
  const frames = battlefieldMode === "live"
    ? (liveFrame ? [liveFrame] : [])
    : (replayFrames.length > 0 ? replayFrames : (liveFrame ? [liveFrame] : []));
  const replayTheme = battlefieldMode === "replay" || battlefieldMode === "replayComplete";
  const fixedFrameIndex = battlefieldMode === "replay" ? undefined : Math.max(frames.length - 1, 0);
  const showOutcomeCard = battlefieldMode === "result" || battlefieldMode === "replayComplete";
  const replayActionLabel = battlefieldMode === "replayComplete" ? "Replay Again" : "Replay";
  const headerLabel = battlefieldMode === "live"
    ? "Live battle"
    : battlefieldMode === "result"
      ? "Battle result"
      : battlefieldMode === "replay"
        ? "Replay broadcast"
        : "Replay complete";

  return (
    <main className={replayTheme ? "battle-stage-shell replay-shell" : "battle-stage-shell"}>
      <div className={replayTheme ? "battle-overlay replay-overlay" : "battle-overlay"}>
        {showOutcomeCard
          ? <div className="overlay-spacer" aria-hidden="true" />
          : <button className="ghost-button" onClick={onExit}>Exit to matchmaking</button>}
        <div className="battle-overlay-copy">
          <p className="eyebrow">{headerLabel}</p>
          <h1>{mapName}</h1>
          <p className="status-line">{status}</p>
        </div>
        <button className="ghost-button" onClick={onSignOut}>Sign out</button>
      </div>

      <section className={replayTheme ? "battle-stage replay-stage" : "battle-stage"}>
        <div className={replayTheme ? "battlefield-frame replay-frame" : "battlefield-frame"}>
          <ArenaCanvas
            replay={frames}
            mapId={mapId}
            mode={battlefieldMode === "live" ? "live" : "replay"}
            theme={replayTheme ? "replay" : "live"}
            isPlaying={battlefieldMode === "replay"}
            playbackSpeed={replaySpeed}
            playbackToken={replayPlaybackToken}
            fixedFrameIndex={fixedFrameIndex}
            onPlaybackComplete={onPlaybackComplete}
          />

          {showOutcomeCard ? (
            <div className="battle-state-layer">
              <article className="battle-state-card">
                <p className="eyebrow">{battlefieldMode === "replayComplete" ? "Replay complete" : "Winner"}</p>
                <h2>{outcomeHeading(outcome)}</h2>
                <p className="battle-state-detail">{outcomeDetail(outcome)}</p>
                <p className="status-line">{status}</p>
                <div className="battle-state-actions">
                  <button className="ghost-button" type="button" onClick={onExit}>Exit to Matchmaking</button>
                  <button className="ghost-button" type="button" onClick={onReplayStart}>{replayActionLabel}</button>
                  {showPlayAgain ? (
                    <button className="primary-button" type="button" onClick={onPlayAgain}>Play Again</button>
                  ) : null}
                </div>
              </article>
            </div>
          ) : null}
        </div>

        {battlefieldMode === "live" ? (
          <div className="replay-control-bar" role="toolbar" aria-label="Live speed controls">
            <span className="field-chip">Live speed</span>
            <div className="replay-speed-buttons">
              {replaySpeeds.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  className={liveSpeed === speed ? "tab active" : "tab"}
                  onClick={() => onLiveSpeedChange(speed)}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {battlefieldMode === "replay" ? (
          <div className="replay-control-bar" role="toolbar" aria-label="Replay speed controls">
            <span className="field-chip replay-chip">Replay mode</span>
            <div className="replay-speed-buttons">
              {replaySpeeds.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  className={replaySpeed === speed ? "tab active" : "tab"}
                  onClick={() => onReplaySpeedChange(speed)}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function BotLabPage({
  botJson,
  validationError,
  sandboxReplay,
  mapId,
  onBotJsonChange,
  onLoadSample,
  onValidate,
  onSave,
  onUpload,
  onSandboxRun
}: BotLabPageProps): React.ReactElement {
  return (
    <section className="lab-layout">
      <article className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Bot Authoring</p>
            <h2>Upload or paste JSON</h2>
          </div>
          <button className="ghost-button" onClick={() => void onLoadSample()}>Load sample</button>
        </div>
        <div className="button-row">
          <label className="file-button">
            Upload JSON
            <input type="file" accept="application/json" onChange={onUpload} />
          </label>
          <button className="ghost-button" onClick={() => void onValidate()}>Validate</button>
          <button className="primary-button" onClick={() => void onSave()}>Save bot</button>
        </div>
        <p className="status-line">Every bot must include all five core stats and total exactly {TANK_STAT_BUDGET} points.</p>
        <textarea aria-label="Bot JSON editor" value={botJson} onChange={(event) => onBotJsonChange(event.target.value)} />
        {validationError ? <p className="error-line">{validationError}</p> : null}
      </article>

      <article className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Control Sandbox</p>
            <h2>Preview the same live engine</h2>
          </div>
          <span className="field-chip">Shared battlefield</span>
        </div>
        <div className="button-row">
          <button
            className="ghost-button"
            onClick={() => onSandboxRun([
              { frames: 24, intent: { throttle: 1, steer: 0, fire: false } },
              { frames: 10, intent: { throttle: 1, steer: 1, fire: false } },
              { frames: 1, intent: { throttle: 0, steer: 0, fire: true } }
            ])}
          >
            Forward + fire
          </button>
          <button
            className="ghost-button"
            onClick={() => onSandboxRun([
              { frames: 18, intent: { throttle: -1, steer: 0, fire: false } },
              { frames: 16, intent: { throttle: -1, steer: -1, fire: false } },
              { frames: 1, intent: { throttle: 0, steer: 0, fire: true } }
            ])}
          >
            Reverse left
          </button>
          <button
            className="ghost-button"
            onClick={() => onSandboxRun([
              { frames: 18, intent: { throttle: 1, steer: 1, fire: false } },
              { frames: 20, intent: { throttle: 1, steer: 0, fire: false } },
              { frames: 1, intent: { throttle: 0, steer: 0, fire: true } }
            ])}
          >
            Turn right
          </button>
        </div>
        <ArenaCanvas replay={sandboxReplay} mapId={mapId} mode="replay" fixedFrameIndex={Math.max(sandboxReplay.length - 1, 0)} />
      </article>
    </section>
  );
}

function AppRoutes(): React.ReactElement {
  const navigate = useNavigate();
  const battleTimerRef = useRef<number | null>(null);
  const liveSessionRef = useRef<BattleSession | null>(null);
  const liveBattleContextRef = useRef<ActiveLiveBattleContext | null>(null);
  const [token, setToken] = useState<string | null>(() => window.localStorage.getItem("tank-token"));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(window.localStorage.getItem("tank-token")));
  const [publicBots, setPublicBots] = useState<BotRecord[]>([]);
  const [bots, setBots] = useState<BotRecord[]>([]);
  const [maps, setMaps] = useState<MapRecord[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [leftBotId, setLeftBotId] = useState("");
  const [rightBotId, setRightBotId] = useState("");
  const [selectedMapId, setSelectedMapId] = useState("");
  const [activeBattleMapId, setActiveBattleMapId] = useState("");
  const [botJson, setBotJson] = useState(JSON.stringify(botDefinitionExample, null, 2));
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [authForm, setAuthForm] = useState(authDefaults);
  const [landingAuthOpen, setLandingAuthOpen] = useState(false);
  const [status, setStatus] = useState("Choose two bots and a map from matchmaking, or build a new bot in Bot Lab.");
  const [validationError, setValidationError] = useState("");
  const [selectedReplay, setSelectedReplay] = useState<ReplayRecord | null>(null);
  const [liveFrame, setLiveFrame] = useState<MatchSnapshot | null>(null);
  const [battleRunning, setBattleRunning] = useState(false);
  const [battlefieldMode, setBattlefieldMode] = useState<BattlefieldMode | null>(null);
  const [battleOutcome, setBattleOutcome] = useState<BattleOutcome | null>(null);
  const [lastLiveMatchConfig, setLastLiveMatchConfig] = useState<LastLiveMatchConfig | null>(null);
  const [liveSpeed, setLiveSpeed] = useState<ReplaySpeed>(1);
  const [replaySpeed, setReplaySpeed] = useState<ReplaySpeed>(1);
  const [replayPlaybackToken, setReplayPlaybackToken] = useState(0);
  const [sandboxReplay, setSandboxReplay] = useState<MatchSnapshot[]>([]);

  const availableMaps = useMemo(() => maps.length > 0 ? maps : fallbackMaps(), [maps]);
  const selectableBots = useMemo(() => {
    const systemBots = bots.filter((bot) => bot.isSystem);
    const customBots = bots.filter((bot) => !bot.isSystem);
    return [...systemBots, ...customBots];
  }, [bots]);
  const landingBots = useMemo(
    () => publicBots.length > 0 ? publicBots : selectableBots.filter((bot) => bot.isSystem),
    [publicBots, selectableBots]
  );
  const activeBattleMap = useMemo(
    () => availableMaps.find((map) => map.id === activeBattleMapId)
      ?? availableMaps.find((map) => map.id === selectedMapId)
      ?? availableMaps[0]
      ?? fallbackMaps()[0],
    [activeBattleMapId, availableMaps, selectedMapId]
  );
  const sandboxMapId = availableMaps[0]?.id ?? fixedMaps[0].id;
  const isAuthenticated = Boolean(token && user);
  const hasBattleView = battlefieldMode !== null && (Boolean(selectedReplay) || Boolean(liveFrame));

  useEffect(() => () => {
    if (battleTimerRef.current !== null) {
      window.clearInterval(battleTimerRef.current);
    }
    liveSessionRef.current = null;
    liveBattleContextRef.current = null;
  }, []);

  useEffect(() => {
    if (!battleRunning || battlefieldMode !== "live") {
      if (battleTimerRef.current !== null) {
        window.clearInterval(battleTimerRef.current);
        battleTimerRef.current = null;
      }
      return;
    }

    if (!liveSessionRef.current || !liveBattleContextRef.current) {
      return;
    }

    if (battleTimerRef.current !== null) {
      window.clearInterval(battleTimerRef.current);
    }

    battleTimerRef.current = window.setInterval(() => {
      const session = liveSessionRef.current;
      const context = liveBattleContextRef.current;
      if (!session || !context) {
        if (battleTimerRef.current !== null) {
          window.clearInterval(battleTimerRef.current);
          battleTimerRef.current = null;
        }
        return;
      }

      const latestSnapshot = stepBattleSession(session);
      setLiveFrame(latestSnapshot);

      if (!session.completed) {
        return;
      }

      if (battleTimerRef.current !== null) {
        window.clearInterval(battleTimerRef.current);
        battleTimerRef.current = null;
      }

      liveSessionRef.current = null;
      liveBattleContextRef.current = null;

      const result = session.result!;
      setBattleRunning(false);
      setSelectedReplay({
        id: "live-local",
        replay: result.replay
      });
      setLiveFrame(result.finalState);
      setBattleOutcome(buildBattleOutcome({
        winnerTankId: result.winnerTankId,
        leftTankName: context.leftBot.name,
        rightTankName: context.rightBot.name,
        reason: result.reason,
        totalTicks: result.totalTicks,
        mapId: context.mapId,
        source: "liveResult"
      }));
      setBattlefieldMode("result");
      setStatus("Battle finished. Review the result, launch the replay, or start a rematch.");

      void persistClientMatch(context.token, context.leftBot, context.rightBot, context.mapId, result)
        .then(() => setStatus("Battle saved. Press Replay to review it or Play Again to run the same matchup live."))
        .catch((error: Error) => setStatus(`Battle finished locally but failed to save: ${error.message}`));
    }, resolveBattlefieldTickInterval(liveSpeed));

    return () => {
      if (battleTimerRef.current !== null) {
        window.clearInterval(battleTimerRef.current);
        battleTimerRef.current = null;
      }
    };
  }, [battleRunning, battlefieldMode, liveSpeed]);

  useEffect(() => {
    if (token) {
      return;
    }

    Promise.all([
      api.listPublicBots().catch(() => [] as BotRecord[]),
      api.listMaps().catch(() => fallbackMaps())
    ])
      .then(([botList, mapList]) => {
        setPublicBots(botList);
        setMaps((current) => current.length > 0 ? current : mapList);
      })
      .catch(() => {
        setPublicBots([]);
        setMaps((current) => current.length > 0 ? current : fallbackMaps());
      });
  }, [token]);

  async function refreshProtectedData(nextToken: string): Promise<void> {
    const [me, botList, matchList, mapList] = await Promise.all([
      api.me(nextToken),
      api.listBots(nextToken),
      api.listMatches(nextToken),
      api.listMaps().catch(() => fallbackMaps())
    ]);

    setUser(me);
    setBots(botList);
    setPublicBots(botList.filter((bot) => bot.isSystem));
    setMatches(matchList);
    setMaps(mapList);

    const systemBots = botList.filter((bot) => bot.isSystem);
    const customBots = botList.filter((bot) => !bot.isSystem);
    const leftDefault = customBots[0] ?? systemBots[0] ?? botList[0];
    const rightDefault = systemBots.find((bot) => bot.id !== leftDefault?.id)
      ?? botList.find((bot) => bot.id !== leftDefault?.id)
      ?? leftDefault;

    setLeftBotId((current) => botList.some((bot) => bot.id === current) ? current : (leftDefault?.id ?? ""));
    setRightBotId((current) => botList.some((bot) => bot.id === current) ? current : (rightDefault?.id ?? leftDefault?.id ?? ""));
    setSelectedMapId((current) => mapList.some((map) => map.id === current) ? current : (mapList[0]?.id ?? ""));
  }

  useEffect(() => {
    if (!token) {
      setAuthLoading(false);
      setUser(null);
      return;
    }

    setAuthLoading(true);
    refreshProtectedData(token)
      .catch((error: Error) => {
        setStatus(error.message);
        setToken(null);
        setUser(null);
        window.localStorage.removeItem("tank-token");
      })
      .finally(() => setAuthLoading(false));
  }, [token]);

  function handleLandingStart(): void {
    if (isAuthenticated) {
      navigate("/matchmaking");
      return;
    }

    setLandingAuthOpen(true);
  }

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      const result = authMode === "register"
        ? await api.register(authForm)
        : await api.login({ email: authForm.email, password: authForm.password });

      setToken(result.token);
      window.localStorage.setItem("tank-token", result.token);
      setLandingAuthOpen(false);
      navigate("/matchmaking", { replace: true });
      setStatus(`${authMode === "register" ? "Registered" : "Logged in"} as ${result.user.username}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Authentication failed");
    }
  }

  async function handleLoadSample(): Promise<void> {
    const example = await api.getSchemaExample();
    setBotJson(JSON.stringify(example, null, 2));
    setValidationError("");
    setStatus("Loaded the canonical sample bot JSON.");
  }

  async function handleValidate(): Promise<void> {
    try {
      const payload = JSON.parse(botJson);
      await api.validateBot(payload);
      setValidationError("");
      setStatus("Bot JSON is valid.");
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "Validation failed");
    }
  }

  async function handleBotSave(): Promise<void> {
    if (!token) {
      return;
    }

    try {
      const payload = JSON.parse(botJson);
      await api.validateBot(payload);
      await api.createBot(token, payload);
      await refreshProtectedData(token);
      setValidationError("");
      setStatus("Bot saved and added to matchmaking.");
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "Save failed");
    }
  }

  async function persistClientMatch(
    nextToken: string,
    leftBot: BotRecord,
    rightBot: BotRecord,
    mapId: string,
    result: MatchResult
  ): Promise<void> {
    await api.createMatch(nextToken, {
      leftBotId: leftBot.id,
      rightBotId: rightBot.id,
      mapId,
      winnerTankId: result.winnerTankId,
      reason: result.reason,
      totalTicks: result.totalTicks,
      replay: result.replay,
      finalState: result.finalState
    });
    await refreshProtectedData(nextToken);
  }

  function clearBattlefieldState(): void {
    if (battleTimerRef.current !== null) {
      window.clearInterval(battleTimerRef.current);
      battleTimerRef.current = null;
    }

    liveSessionRef.current = null;
    liveBattleContextRef.current = null;
    setBattleRunning(false);
    setBattlefieldMode(null);
    setBattleOutcome(null);
    setSelectedReplay(null);
    setLiveFrame(null);
    setActiveBattleMapId("");
    setLastLiveMatchConfig(null);
    setLiveSpeed(1);
    setReplaySpeed(1);
    setReplayPlaybackToken(0);
  }

  function startReplayPlayback(): void {
    if (!selectedReplay || selectedReplay.replay.length === 0) {
      return;
    }

    setBattlefieldMode("replay");
    setReplaySpeed(1);
    setReplayPlaybackToken((current) => current + 1);
    setStatus(
      battleOutcome?.source === "savedReplay"
        ? "Replay broadcast started."
        : "Replay started from the finished battle."
    );
  }

  async function runLiveMatch(config: LastLiveMatchConfig): Promise<void> {
    if (!token || !config.leftBotId || !config.rightBotId || !config.mapId) {
      return;
    }

    const leftBot = bots.find((bot) => bot.id === config.leftBotId);
    const rightBot = bots.find((bot) => bot.id === config.rightBotId);
    const battleMap = fixedMaps.find((map) => map.id === config.mapId);

    if (!leftBot || !rightBot || !battleMap) {
      setStatus("Select valid bots and a valid map before starting a battle.");
      return;
    }

    if (battleTimerRef.current !== null) {
      window.clearInterval(battleTimerRef.current);
      battleTimerRef.current = null;
    }

    liveSessionRef.current = null;
    liveBattleContextRef.current = null;

    const leftDefinition = normalizeBotDefinition(leftBot);
    const rightDefinition = normalizeBotDefinition(rightBot);

    const session = createBattleSession({
      map: battleMap,
      seed: `${leftBot.id}:${rightBot.id}:${battleMap.id}:${Date.now()}`,
      tanks: [
        createInitialTankState({
          id: "left",
          name: leftBot.name,
          position: battleMap.spawnPoints[0],
          rotation: 0,
          isManual: false,
          bot: leftDefinition
        }),
        createInitialTankState({
          id: "right",
          name: rightBot.name,
          position: battleMap.spawnPoints[1],
          rotation: Math.PI,
          isManual: false,
          bot: rightDefinition
        })
      ]
    });

    const legacyBotSelected = !Array.isArray((leftBot.definition as { goals?: unknown[] } | undefined)?.goals)
      || !Array.isArray((rightBot.definition as { goals?: unknown[] } | undefined)?.goals)
      || !hasValidStats((leftBot.definition as { stats?: unknown } | undefined)?.stats)
      || !hasValidStats((rightBot.definition as { stats?: unknown } | undefined)?.stats);

    const initialSnapshot = getBattleSnapshot(session);
    session.replay.push(initialSnapshot);
    liveSessionRef.current = session;
    liveBattleContextRef.current = {
      token,
      leftBot,
      rightBot,
      mapId: battleMap.id,
      mapName: battleMap.name
    };
    setLeftBotId(leftBot.id);
    setRightBotId(rightBot.id);
    setSelectedMapId(battleMap.id);
    setLastLiveMatchConfig({
      leftBotId: leftBot.id,
      rightBotId: rightBot.id,
      mapId: battleMap.id
    });
    setSelectedReplay(null);
    setBattleOutcome(null);
    setLiveFrame(initialSnapshot);
    setBattleRunning(true);
    setBattlefieldMode("live");
    setActiveBattleMapId(battleMap.id);
    setLiveSpeed(1);
    setReplaySpeed(1);
    setStatus(
      legacyBotSelected
        ? `Live battle started on ${battleMap.name}. Legacy bot definitions were loaded with fallback baseline stats until they are re-saved in Bot Lab.`
        : `Live battle started: ${leftBot.name} vs ${rightBot.name} on ${battleMap.name}`
    );
    navigate("/battlefield");
  }

  async function handleRunMatch(): Promise<void> {
    if (!token || !leftBotId || !rightBotId || !selectedMapId) {
      return;
    }

    await runLiveMatch({
      leftBotId,
      rightBotId,
      mapId: selectedMapId
    });
  }

  async function handleOpenReplay(matchId: string): Promise<void> {
    if (!token) {
      return;
    }

    if (battleTimerRef.current !== null) {
      window.clearInterval(battleTimerRef.current);
      battleTimerRef.current = null;
    }

    liveSessionRef.current = null;
    liveBattleContextRef.current = null;
    const match = matches.find((candidate) => candidate.id === matchId);
    const replay = await api.getReplay(token, matchId);
    setBattleRunning(false);
    setLiveFrame(null);
    setSelectedReplay(replay);
    setActiveBattleMapId(match?.mapId ?? selectedMapId);
    setBattleOutcome(buildBattleOutcome({
      winnerTankId: match?.winnerTankId ?? null,
      leftTankId: match?.leftBotId,
      leftTankName: bots.find((bot) => bot.id === match?.leftBotId)?.name ?? "Left Bot",
      rightTankId: match?.rightBotId,
      rightTankName: bots.find((bot) => bot.id === match?.rightBotId)?.name ?? "Right Bot",
      reason: match?.reason ?? "draw",
      totalTicks: match?.totalTicks ?? replay.replay.length,
      mapId: match?.mapId ?? selectedMapId,
      source: "savedReplay"
    }));
    setBattlefieldMode("replay");
    setReplaySpeed(1);
    setReplayPlaybackToken((current) => current + 1);
    setStatus("Replay loaded. Adjust speed at any time during playback.");
    navigate("/battlefield");
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    file.text()
      .then((content) => {
        setBotJson(content);
        setValidationError("");
      })
      .catch(() => setValidationError("Unable to read the selected JSON file."));
  }

  function handleSandboxRun(segments: SandboxScriptSegment[]): void {
    setSandboxReplay(simulateSandbox(segments));
  }

  function handleReturnToMatchmaking(): void {
    clearBattlefieldState();
    navigate("/matchmaking");
  }

  function handleReplayComplete(): void {
    setBattlefieldMode("replayComplete");
    setStatus(
      battleOutcome?.source === "liveResult"
        ? "Replay complete. Choose Exit, Replay Again, or Play Again."
        : "Replay complete. Choose Exit or Replay Again."
    );
  }

  function handlePlayAgain(): void {
    if (!lastLiveMatchConfig) {
      return;
    }

    void runLiveMatch(lastLiveMatchConfig);
  }

  function handleSignOut(): void {
    clearBattlefieldState();
    setToken(null);
    setUser(null);
    setAuthLoading(false);
    setLandingAuthOpen(false);
    window.localStorage.removeItem("tank-token");
    navigate("/", { replace: true });
  }

  function renderProtectedPage(title: string, content: React.ReactElement): React.ReactElement {
    if (authLoading) {
      return <LoadingScreen />;
    }

    if (!isAuthenticated || !user) {
      return <Navigate to="/" replace />;
    }

    return (
      <main className="page-shell">
        <TopBar title={title} username={user.username} onSignOut={handleSignOut} />
        {content}
      </main>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          authLoading ? <LoadingScreen /> : (
            <LandingPage
              publicBots={landingBots}
              featuredMap={availableMaps[0] ?? null}
              isAuthenticated={isAuthenticated}
              username={user?.username}
              authOpen={landingAuthOpen}
              authMode={authMode}
              authForm={authForm}
              status={status}
              onStart={handleLandingStart}
              onDismissAuth={() => setLandingAuthOpen(false)}
              onAuthModeChange={setAuthMode}
              onAuthFormChange={(field, value) => setAuthForm((current) => ({ ...current, [field]: value }))}
              onSubmit={handleAuthSubmit}
              onGoToBotLab={() => navigate("/bot-lab")}
              onSignOut={handleSignOut}
            />
          )
        }
      />
      <Route
        path="/matchmaking"
        element={
          authLoading ? <LoadingScreen /> : (
            !isAuthenticated || !user
              ? <Navigate to="/" replace />
              : (
                <MatchmakingPage
                  user={user}
                  bots={selectableBots}
                  maps={availableMaps}
                  leftBotId={leftBotId}
                  rightBotId={rightBotId}
                  selectedMapId={selectedMapId}
                  matches={matches}
                  battleRunning={battleRunning}
                  status={status}
                  onLeftBotChange={setLeftBotId}
                  onRightBotChange={setRightBotId}
                  onMapChange={setSelectedMapId}
                  onRunMatch={handleRunMatch}
                  onOpenReplay={handleOpenReplay}
                  onOpenBotLab={() => navigate("/bot-lab")}
                  onSignOut={handleSignOut}
                />
              )
          )
        }
      />
      <Route
        path="/battlefield"
        element={
          authLoading ? <LoadingScreen /> : (
            !isAuthenticated || !user
              ? <Navigate to="/" replace />
              : !hasBattleView
                ? <Navigate to="/matchmaking" replace />
                : (
                  <BattlefieldStagePage
                    replay={selectedReplay}
                    liveFrame={liveFrame}
                    battlefieldMode={battlefieldMode!}
                    outcome={battleOutcome}
                    status={status}
                    mapName={activeBattleMap.name}
                    mapId={activeBattleMap.id}
                    liveSpeed={liveSpeed}
                    replaySpeed={replaySpeed}
                    replayPlaybackToken={replayPlaybackToken}
                    onReplayStart={startReplayPlayback}
                    showPlayAgain={Boolean(lastLiveMatchConfig && battleOutcome?.source === "liveResult")}
                    onPlayAgain={handlePlayAgain}
                    onLiveSpeedChange={setLiveSpeed}
                    onReplaySpeedChange={setReplaySpeed}
                    onPlaybackComplete={handleReplayComplete}
                    onExit={handleReturnToMatchmaking}
                    onSignOut={handleSignOut}
                  />
                )
          )
        }
      />
      <Route
        path="/bot-lab"
        element={renderProtectedPage(
          "Bot Lab",
          <BotLabPage
            botJson={botJson}
            validationError={validationError}
            sandboxReplay={sandboxReplay}
            mapId={sandboxMapId}
            onBotJsonChange={setBotJson}
            onLoadSample={handleLoadSample}
            onValidate={handleValidate}
            onSave={handleBotSave}
            onUpload={handleFileUpload}
            onSandboxRun={handleSandboxRun}
          />
        )}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}


