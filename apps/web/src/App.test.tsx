import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

const fetchMock = jest.fn();

Object.defineProperty(window, "fetch", {
  writable: true,
  value: fetchMock
});

const publicBots = [
  {
    id: "system-1",
    ownerId: null,
    name: "Crossfire Fox",
    version: "2.0.0",
    author: "System",
    isSystem: true,
    definition: {
      name: "Crossfire Fox",
      version: "2.0.0",
      goals: [{ type: "attack" }, { type: "evade" }]
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

    expect(await screen.findByText(/Crossfire Fox/i)).toBeInTheDocument();

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
      .mockResolvedValueOnce(ok({ name: "Sample", version: "1.0.0", goals: [] }));

    render(<App />);

    const button = await screen.findByText(/Load sample/i);
    await userEvent.click(button);

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/schema/bot/example", expect.any(Object));
  });
});
