import { act, render, screen } from "@testing-library/react";
import { ArenaCanvas } from "./ArenaCanvas";

const replayFrames = [
  {
    tick: 0,
    tanks: [
      { id: "left", name: "Alpha", position: { x: 120, y: 120 }, rotation: 0, health: 3, cooldownTicks: 0 },
      { id: "right", name: "Beta", position: { x: 840, y: 520 }, rotation: Math.PI, health: 3, cooldownTicks: 0 }
    ],
    bullets: [],
    effects: []
  },
  {
    tick: 1,
    tanks: [
      { id: "left", name: "Alpha", position: { x: 160, y: 160 }, rotation: 0.2, health: 3, cooldownTicks: 0 },
      { id: "right", name: "Beta", position: { x: 800, y: 480 }, rotation: Math.PI - 0.2, health: 3, cooldownTicks: 0 }
    ],
    bullets: [],
    effects: []
  },
  {
    tick: 2,
    tanks: [
      { id: "left", name: "Alpha", position: { x: 200, y: 200 }, rotation: 0.3, health: 3, cooldownTicks: 0 },
      { id: "right", name: "Beta", position: { x: 760, y: 440 }, rotation: Math.PI - 0.3, health: 2, cooldownTicks: 0 }
    ],
    bullets: [],
    effects: []
  }
];

describe("ArenaCanvas", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("plays once at 1x and completes without looping", () => {
    const onPlaybackComplete = jest.fn();

    render(
      <ArenaCanvas
        replay={replayFrames}
        mapId="crossfire"
        mode="replay"
        theme="replay"
        isPlaying
        playbackSpeed={1}
        onPlaybackComplete={onPlaybackComplete}
      />
    );

    expect(screen.getByText(/Frame: 1 \/ 3/i)).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(30);
    });
    expect(screen.getByText(/Frame: 2 \/ 3/i)).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(30);
    });
    expect(screen.getByText(/Frame: 3 \/ 3/i)).toBeInTheDocument();
    expect(onPlaybackComplete).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(120);
    });
    expect(screen.getByText(/Frame: 3 \/ 3/i)).toBeInTheDocument();
    expect(onPlaybackComplete).toHaveBeenCalledTimes(1);
  });

  it("respects slower replay speeds", () => {
    render(
      <ArenaCanvas
        replay={replayFrames}
        mapId="crossfire"
        mode="replay"
        isPlaying
        playbackSpeed={0.25}
      />
    );

    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(screen.getByText(/Frame: 1 \/ 3/i)).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(20);
    });
    expect(screen.getByText(/Frame: 2 \/ 3/i)).toBeInTheDocument();
  });

  it("respects faster replay speeds", () => {
    render(
      <ArenaCanvas
        replay={replayFrames}
        mapId="crossfire"
        mode="replay"
        isPlaying
        playbackSpeed={4}
      />
    );

    act(() => {
      jest.advanceTimersByTime(8);
    });
    expect(screen.getByText(/Frame: 2 \/ 3/i)).toBeInTheDocument();
  });

  it("restarts playback from the first frame after a frozen result screen", () => {
    const onPlaybackComplete = jest.fn();
    const { rerender } = render(
      <ArenaCanvas
        replay={replayFrames}
        mapId="crossfire"
        mode="replay"
        isPlaying={false}
        playbackToken={0}
        fixedFrameIndex={2}
        onPlaybackComplete={onPlaybackComplete}
      />
    );

    expect(screen.getByText(/Frame: 3 \/ 3/i)).toBeInTheDocument();

    rerender(
      <ArenaCanvas
        replay={replayFrames}
        mapId="crossfire"
        mode="replay"
        theme="replay"
        isPlaying
        playbackSpeed={1}
        playbackToken={1}
        onPlaybackComplete={onPlaybackComplete}
      />
    );

    expect(screen.getByText(/Frame: 1 \/ 3/i)).toBeInTheDocument();
    expect(onPlaybackComplete).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(30);
    });

    expect(screen.getByText(/Frame: 2 \/ 3/i)).toBeInTheDocument();
    expect(onPlaybackComplete).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(60);
    });

    expect(screen.getByText(/Frame: 3 \/ 3/i)).toBeInTheDocument();
    expect(onPlaybackComplete).toHaveBeenCalledTimes(1);
  });
});
