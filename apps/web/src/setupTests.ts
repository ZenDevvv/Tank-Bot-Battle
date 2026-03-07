import "@testing-library/jest-dom";
import { TextDecoder, TextEncoder } from "util";

Object.defineProperty(globalThis, "TextEncoder", {
  value: TextEncoder
});

Object.defineProperty(globalThis, "TextDecoder", {
  value: TextDecoder
});

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: () => ({
    clearRect: () => undefined,
    fillRect: () => undefined,
    beginPath: () => undefined,
    arc: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    save: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
    restore: () => undefined,
    fillText: () => undefined
  })
});
