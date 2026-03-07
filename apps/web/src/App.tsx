import { useEffect, useMemo, useState } from "react";
import { botDefinitionExample, type TankCommand } from "@tank-bot-battle/shared";
import { ArenaCanvas } from "./components/ArenaCanvas";
import { api } from "./lib/api";
import { simulateSandbox } from "./lib/sandbox";
import type { AuthUser, BotRecord, MapRecord, MatchRecord, ReplayRecord } from "./types";

const authDefaults = {
  username: "",
  email: "",
  password: ""
};

function App() {
  const [token, setToken] = useState<string | null>(() => window.localStorage.getItem("tank-token"));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bots, setBots] = useState<BotRecord[]>([]);
  const [maps, setMaps] = useState<MapRecord[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [selectedMapId, setSelectedMapId] = useState("crossfire");
  const [leftBotId, setLeftBotId] = useState("");
  const [rightBotId, setRightBotId] = useState("");
  const [botJson, setBotJson] = useState(JSON.stringify(botDefinitionExample, null, 2));
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [authForm, setAuthForm] = useState(authDefaults);
  const [status, setStatus] = useState("Load a sample bot or paste your own JSON.");
  const [validationError, setValidationError] = useState("");
  const [selectedReplay, setSelectedReplay] = useState<ReplayRecord | null>(null);
  const [sandboxReplay, setSandboxReplay] = useState(() => simulateSandbox(["moveForward", "turnRight", "fire"]));

  const selectableBots = useMemo(() => bots, [bots]);

  async function refreshProtectedData(nextToken: string): Promise<void> {
    const [me, botList, mapList, matchList] = await Promise.all([
      api.me(nextToken),
      api.listBots(nextToken),
      api.listMaps(),
      api.listMatches(nextToken)
    ]);
    setUser(me);
    setBots(botList);
    setMaps(mapList);
    setMatches(matchList);
    const defaultUserBot = botList.find((bot) => !bot.isSystem) ?? botList[0];
    const defaultSystemBot = botList.find((bot) => bot.isSystem) ?? botList[0];
    setLeftBotId(defaultUserBot?.id ?? "");
    setRightBotId(defaultSystemBot?.id ?? "");
    setSelectedMapId(mapList[0]?.id ?? "crossfire");
  }

  useEffect(() => {
    if (!token) {
      return;
    }

    refreshProtectedData(token).catch((error: Error) => {
      setStatus(error.message);
      setToken(null);
      window.localStorage.removeItem("tank-token");
    });
  }, [token]);

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      const result = authMode === "register"
        ? await api.register(authForm)
        : await api.login({ email: authForm.email, password: authForm.password });
      setToken(result.token);
      window.localStorage.setItem("tank-token", result.token);
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
      setStatus("Bot saved and ready for matches.");
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "Save failed");
    }
  }

  async function handleRunMatch(): Promise<void> {
    if (!token || !leftBotId || !rightBotId || !selectedMapId) {
      return;
    }

    try {
      const match = await api.createMatch(token, {
        leftBotId,
        rightBotId,
        mapId: selectedMapId
      });
      const replay = await api.getReplay(token, match.id);
      await refreshProtectedData(token);
      setSelectedReplay(replay);
      setStatus(`Match complete in ${match.totalTicks} ticks.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Match failed");
    }
  }

  async function handleOpenReplay(matchId: string): Promise<void> {
    if (!token) {
      return;
    }
    const replay = await api.getReplay(token, matchId);
    setSelectedReplay(replay);
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

  function handleSandboxRun(commands: TankCommand[]): void {
    setSandboxReplay(simulateSandbox(commands));
  }

  if (!token || !user) {
    return (
      <main className="page-shell">
        <section className="hero-card">
          <p className="eyebrow">Tank Bot Battle</p>
          <h1>Build ricochet tanks. Upload JSON bots. Replay every duel.</h1>
          <p className="lede">
            This MVP combines deterministic bot battles with a manual tank sandbox so you can tune logic and study every bounce.
          </p>
          <form className="auth-card" onSubmit={(event) => void handleAuthSubmit(event)}>
            <div className="tab-row">
              <button type="button" className={authMode === "register" ? "tab active" : "tab"} onClick={() => setAuthMode("register")}>Register</button>
              <button type="button" className={authMode === "login" ? "tab active" : "tab"} onClick={() => setAuthMode("login")}>Login</button>
            </div>
            {authMode === "register" ? (
              <label>
                Username
                <input value={authForm.username} onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))} />
              </label>
            ) : null}
            <label>
              Email
              <input type="email" value={authForm.email} onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))} />
            </label>
            <label>
              Password
              <input type="password" value={authForm.password} onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))} />
            </label>
            <button className="primary-button" type="submit">{authMode === "register" ? "Create account" : "Sign in"}</button>
          </form>
          <p className="status-line">{status}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="top-bar">
        <div>
          <p className="eyebrow">Pilot Console</p>
          <h1>Welcome, {user.username}</h1>
        </div>
        <button
          className="ghost-button"
          onClick={() => {
            setToken(null);
            setUser(null);
            window.localStorage.removeItem("tank-token");
          }}
        >
          Sign out
        </button>
      </section>

      <section className="grid-layout">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Bot Authoring</p>
              <h2>Upload or paste JSON</h2>
            </div>
            <button className="ghost-button" onClick={() => void handleLoadSample()}>Load sample</button>
          </div>
          <div className="button-row">
            <label className="file-button">
              Upload JSON
              <input type="file" accept="application/json" onChange={handleFileUpload} />
            </label>
            <button className="ghost-button" onClick={() => void handleValidate()}>Validate</button>
            <button className="primary-button" onClick={() => void handleBotSave()}>Save bot</button>
          </div>
          <textarea
            aria-label="Bot JSON editor"
            value={botJson}
            onChange={(event) => setBotJson(event.target.value)}
          />
          {validationError ? <p className="error-line">{validationError}</p> : null}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Battle Ops</p>
              <h2>Run a `1v1` simulation</h2>
            </div>
          </div>
          <label>
            Left tank
            <select value={leftBotId} onChange={(event) => setLeftBotId(event.target.value)}>
              <option value="">Select bot</option>
              {selectableBots.map((bot) => (
                <option key={bot.id} value={bot.id}>{bot.name}{bot.isSystem ? " (System)" : ""}</option>
              ))}
            </select>
          </label>
          <label>
            Right tank
            <select value={rightBotId} onChange={(event) => setRightBotId(event.target.value)}>
              <option value="">Select bot</option>
              {selectableBots.map((bot) => (
                <option key={bot.id} value={bot.id}>{bot.name}{bot.isSystem ? " (System)" : ""}</option>
              ))}
            </select>
          </label>
          <label>
            Fixed map
            <select value={selectedMapId} onChange={(event) => setSelectedMapId(event.target.value)}>
              {maps.map((map) => (
                <option key={map.id} value={map.id}>{map.name}</option>
              ))}
            </select>
          </label>
          <button className="primary-button" onClick={() => void handleRunMatch()}>Run match</button>
          <p className="status-line">{status}</p>
          {selectedReplay ? <ArenaCanvas replay={selectedReplay.replay} mapId={selectedMapId} /> : null}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Manual Sandbox</p>
              <h2>Preview controls and ricochet feel</h2>
            </div>
          </div>
          <div className="button-row">
            <button className="ghost-button" onClick={() => handleSandboxRun(["moveForward", "moveForward", "fire"])}>Forward + fire</button>
            <button className="ghost-button" onClick={() => handleSandboxRun(["moveBackward", "turnLeft", "fire"])}>Reverse left</button>
            <button className="ghost-button" onClick={() => handleSandboxRun(["turnRight", "moveForward", "fire"])}>Turn right</button>
          </div>
          <ArenaCanvas replay={sandboxReplay} mapId="crossfire" />
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Mission Log</p>
              <h2>Replay stored matches</h2>
            </div>
          </div>
          <div className="history-list">
            {matches.map((match) => (
              <button key={match.id} className="history-card" onClick={() => void handleOpenReplay(match.id)}>
                <strong>{match.mapId}</strong>
                <span>{match.reason} in {match.totalTicks} ticks</span>
              </button>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

export default App;
