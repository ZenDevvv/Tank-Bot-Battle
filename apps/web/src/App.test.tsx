import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App, { BattlefieldStagePage } from "./App";

const fetchMock = jest.fn();

Object.defineProperty(window, "fetch", {
  writable: true,
  value: fetchMock
});

const publicBots = [
  {
    id: "system-1",
    ownerId: null,
    name: "Backstep Viper",
    version: "2.2.0",
    author: "System",
    isSystem: true,
    definition: {
      name: "Backstep Viper",
      version: "4.0.0",
      stats: {
        forwardSpeed: 58,
        reverseSpeed: 84,
        rotationSpeed: 76,
        fireRate: 46,
        bulletSpeed: 36
      },
      goals: [{ type: "evade" }, { type: "lineUpShot" }]
    }
  }
];

const privateBots = [
  {
    id: "custom-1",
    ownerId: "user-1",
    name: "Pilot Bot",
    version: "1.0.0",
    author: "pilot",
    isSystem: false,
    definition: {
      name: "Pilot Bot",
      version: "1.0.0",
      stats: {
        forwardSpeed: 60,
        reverseSpeed: 60,
        rotationSpeed: 60,
        fireRate: 60,
        bulletSpeed: 60
      },
      goals: [{ type: "attack" }]
    }
  },
  ...publicBots
];

const maps = [
  {
    id: "crossfire",
    name: "Crossfire",
    width: 960,
    height: 640,
    spawnPoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    walls: [{ x: 10, y: 10, width: 10, height: 10 }]
  }
];

const replayFrames = [
  {
    tick: 0,
    tanks: [
      { id: "left", name: "Backstep Viper", position: { x: 120, y: 120 }, rotation: 0, health: 3, cooldownTicks: 0 },
      { id: "right", name: "Ricochet Lynx", position: { x: 840, y: 520 }, rotation: Math.PI, health: 3, cooldownTicks: 0 }
    ],
    bullets: [],
    effects: []
  },
  {
    tick: 1,
    tanks: [
      { id: "left", name: "Backstep Viper", position: { x: 160, y: 160 }, rotation: 0.2, health: 3, cooldownTicks: 0 },
      { id: "right", name: "Ricochet Lynx", position: { x: 800, y: 480 }, rotation: Math.PI - 0.2, health: 2, cooldownTicks: 0 }
    ],
    bullets: [],
    effects: []
  },
  {
    tick: 2,
    tanks: [
      { id: "left", name: "Backstep Viper", position: { x: 200, y: 190 }, rotation: 0.25, health: 3, cooldownTicks: 0 },
      { id: "right", name: "Ricochet Lynx", position: { x: 760, y: 450 }, rotation: Math.PI - 0.25, health: 0, cooldownTicks: 0 }
    ],
    bullets: [],
    effects: []
  }
];

const savedMatches = [
  {
    id: "match-1",
    leftBotId: "custom-1",
    rightBotId: "system-1",
    mapId: "crossfire",
    winnerTankId: "left",
    reason: "elimination",
    totalTicks: 2,
    createdAt: "2026-03-07T08:00:00.000Z"
  }
];

function ok(payload: unknown) {
  return { ok: true, json: async () => payload };
}

describe("App", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it("loads the public landing roster and opens the auth gate from Start", async () => {
    fetchMock
      .mockResolvedValueOnce(ok(publicBots))
      .mockResolvedValueOnce(ok(maps));

    render(<App />);

    expect(await screen.findByText(/Backstep Viper/i)).toBeInTheDocument();
    expect(await screen.findByText(/300 \/ 300/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Start$/i }));

    expect(screen.getByText(/Register pilot/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
  });

  it("routes a signed-in user to matchmaking from Start", async () => {
    window.localStorage.setItem("tank-token", "token");
    fetchMock
      .mockResolvedValueOnce(ok({ id: "1", username: "pilot", email: "pilot@example.com" }))
      .mockResolvedValueOnce(ok(privateBots))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(maps));

    render(<App />);

    const startButton = await screen.findByRole("button", { name: /Start Matchmaking/i });
    await userEvent.click(startButton);

    expect(await screen.findByText(/Lock in the duel/i)).toBeInTheDocument();
    expect(await screen.findAllByText(/300 \/ 300/i)).not.toHaveLength(0);
  });

  it("redirects battlefield without active match state back to matchmaking", async () => {
    window.localStorage.setItem("tank-token", "token");
    window.history.pushState({}, "", "/battlefield");
    fetchMock
      .mockResolvedValueOnce(ok({ id: "1", username: "pilot", email: "pilot@example.com" }))
      .mockResolvedValueOnce(ok(privateBots))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(maps));

    render(<App />);

    expect(await screen.findByText(/Lock in the duel/i)).toBeInTheDocument();
  });

  it("loads sample JSON into the editor after login state is present", async () => {
    window.localStorage.setItem("tank-token", "token");
    window.history.pushState({}, "", "/bot-lab");
    fetchMock
      .mockResolvedValueOnce(ok({ id: "1", username: "pilot", email: "pilot@example.com" }))
      .mockResolvedValueOnce(ok(privateBots))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(maps))
      .mockResolvedValueOnce(ok({
        name: "Sample",
        version: "1.0.0",
        stats: {
          forwardSpeed: 60,
          reverseSpeed: 60,
          rotationSpeed: 60,
          fireRate: 60,
          bulletSpeed: 60
        },
        goals: []
      }));

    render(<App />);

    const button = await screen.findByText(/Load sample/i);
    await userEvent.click(button);

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/schema/bot/example", expect.any(Object));
  });

  it("shows the post-match result card with Exit, Replay, and Play Again actions for a live result", async () => {
    const onReplayStart = jest.fn();
    const onPlayAgain = jest.fn();
    const onExit = jest.fn();

    render(
      <BattlefieldStagePage
        replay={{ id: "live-local", replay: replayFrames }}
        liveFrame={replayFrames[replayFrames.length - 1]}
        battlefieldMode="result"
        outcome={{
          winnerTankId: "left",
          winnerName: "Backstep Viper",
          leftTankName: "Backstep Viper",
          rightTankName: "Ricochet Lynx",
          reason: "elimination",
          totalTicks: 2,
          mapId: "crossfire",
          source: "liveResult"
        }}
        status="Battle saved. Press Replay when you are ready to watch it."
        mapName="Crossfire"
        mapId="crossfire"
        liveSpeed={1}
        replaySpeed={1}
        replayPlaybackToken={0}
        onReplayStart={onReplayStart}
        showPlayAgain
        onPlayAgain={onPlayAgain}
        onLiveSpeedChange={() => undefined}
        onReplaySpeedChange={() => undefined}
        onPlaybackComplete={() => undefined}
        onExit={onExit}
        onSignOut={() => undefined}
      />
    );

    expect(screen.getByText(/Backstep Viper Wins/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exit to Matchmaking/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Replay$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Play Again/i })).toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: /Replay speed controls/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Play Again/i }));

    expect(onPlayAgain).toHaveBeenCalled();
  });

  it("shows live speed controls on the battlefield and defaults to 1x", async () => {
    const onLiveSpeedChange = jest.fn();

    render(
      <BattlefieldStagePage
        replay={null}
        liveFrame={replayFrames[0]}
        battlefieldMode="live"
        outcome={null}
        status="Live battle started."
        mapName="Crossfire"
        mapId="crossfire"
        liveSpeed={1}
        replaySpeed={1}
        replayPlaybackToken={0}
        onReplayStart={() => undefined}
        showPlayAgain={false}
        onPlayAgain={() => undefined}
        onLiveSpeedChange={onLiveSpeedChange}
        onReplaySpeedChange={() => undefined}
        onPlaybackComplete={() => undefined}
        onExit={() => undefined}
        onSignOut={() => undefined}
      />
    );

    expect(screen.getByRole("toolbar", { name: /Live speed controls/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^1x$/i })).toHaveClass("active");

    await userEvent.click(screen.getByRole("button", { name: /^4x$/i }));

    expect(onLiveSpeedChange).toHaveBeenCalledWith(4);
  });

  it("does not show Play Again for saved replay result screens", () => {
    render(
      <BattlefieldStagePage
        replay={{ id: "match-1", replay: replayFrames }}
        liveFrame={replayFrames[replayFrames.length - 1]}
        battlefieldMode="replayComplete"
        outcome={{
          winnerTankId: "left",
          winnerName: "Pilot Bot",
          leftTankName: "Pilot Bot",
          rightTankName: "Backstep Viper",
          reason: "elimination",
          totalTicks: 2,
          mapId: "crossfire",
          source: "savedReplay"
        }}
        status="Replay complete. Choose Exit or Replay Again."
        mapName="Crossfire"
        mapId="crossfire"
        liveSpeed={1}
        replaySpeed={1}
        replayPlaybackToken={0}
        onReplayStart={() => undefined}
        showPlayAgain={false}
        onPlayAgain={() => undefined}
        onLiveSpeedChange={() => undefined}
        onReplaySpeedChange={() => undefined}
        onPlaybackComplete={() => undefined}
        onExit={() => undefined}
        onSignOut={() => undefined}
      />
    );

    expect(screen.queryByRole("button", { name: /^Play Again$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Replay Again/i })).toBeInTheDocument();
  });

  it("opens a saved replay with replay controls and can exit back to matchmaking", async () => {
    window.localStorage.setItem("tank-token", "token");
    window.history.pushState({}, "", "/matchmaking");
    fetchMock
      .mockResolvedValueOnce(ok({ id: "1", username: "pilot", email: "pilot@example.com" }))
      .mockResolvedValueOnce(ok(privateBots))
      .mockResolvedValueOnce(ok(savedMatches))
      .mockResolvedValueOnce(ok(maps))
      .mockResolvedValueOnce(ok({ id: "match-1", replay: replayFrames }));

    render(<App />);

    const replayButton = await screen.findByRole("button", { name: /Pilot Bot vs Backstep Viper/i });
    await userEvent.click(replayButton);

    expect(await screen.findByText(/Replay broadcast/i)).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: /Replay speed controls/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /0.25x/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /4x/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Exit to matchmaking/i }));

    expect(await screen.findByText(/Lock in the duel/i)).toBeInTheDocument();
  });
});
