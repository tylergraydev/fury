import { describe, it, expect } from "vitest";
import { formatDuration, formatTokens, formatCost } from "./format";

describe("formatDuration", () => {
  it("returns milliseconds for sub-1000ms values", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(1)).toBe("1ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("returns seconds with one decimal for sub-60s values", () => {
    expect(formatDuration(1000)).toBe("1.0s");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(59999)).toBe("60.0s");
  });

  it("returns minutes and seconds for 60s+ values", () => {
    expect(formatDuration(60000)).toBe("1m 0s");
    expect(formatDuration(90000)).toBe("1m 30s");
    expect(formatDuration(3661000)).toBe("61m 1s");
  });
});

describe("formatTokens", () => {
  it("returns raw number for sub-1000 values", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(1)).toBe("1");
    expect(formatTokens(999)).toBe("999");
  });

  it("returns k suffix for thousands", () => {
    expect(formatTokens(1000)).toBe("1.0k");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(999999)).toBe("1000.0k");
  });

  it("returns M suffix for millions", () => {
    expect(formatTokens(1000000)).toBe("1.00M");
    expect(formatTokens(2500000)).toBe("2.50M");
  });
});

describe("formatCost", () => {
  it("returns 4 decimals for sub-penny values", () => {
    expect(formatCost(0.001)).toBe("$0.0010");
    expect(formatCost(0.0001)).toBe("$0.0001");
  });

  it("returns 3 decimals for sub-dollar values", () => {
    expect(formatCost(0.01)).toBe("$0.010");
    expect(formatCost(0.5)).toBe("$0.500");
  });

  it("returns 2 decimals for dollar+ values", () => {
    expect(formatCost(1)).toBe("$1.00");
    expect(formatCost(99.99)).toBe("$99.99");
  });
});
