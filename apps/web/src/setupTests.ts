import "@testing-library/jest-dom";

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: () => ({
    clearRect: () => undefined,
    fillRect: () => undefined,
    beginPath: () => undefined,
    arc: () => undefined,
    fill: () => undefined,
    save: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
    restore: () => undefined,
    fillText: () => undefined
  })
});
