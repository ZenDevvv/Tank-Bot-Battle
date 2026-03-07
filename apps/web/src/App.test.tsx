import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

const fetchMock = jest.fn();

Object.defineProperty(window, "fetch", {
  writable: true,
  value: fetchMock
});

describe("App", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    window.localStorage.clear();
  });

  it("shows auth form by default", () => {
    render(<App />);
    expect(screen.getByText(/Build ricochet tanks/i)).toBeInTheDocument();
  });

  it("loads sample JSON into the editor after login state is present", async () => {
    window.localStorage.setItem("tank-token", "token");
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "1", username: "pilot", email: "pilot@example.com" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ([]) })
      .mockResolvedValueOnce({ ok: true, json: async () => ([{ id: "crossfire", name: "Crossfire", width: 960, height: 640, spawnPoints: [], walls: [] }]) })
      .mockResolvedValueOnce({ ok: true, json: async () => ([]) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ name: "Sample", version: "1.0.0", rules: [] }) });

    render(<App />);

    const button = await screen.findByText(/Load sample/i);
    await userEvent.click(button);

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/schema/bot/example", expect.any(Object));
  });
});
