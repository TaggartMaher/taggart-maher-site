import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chooseMode, MODE_OVERRIDE_STORAGE_KEY } from "./chooseMode";

interface MediaQueryFixture {
  query: string;
  matches: boolean;
}

interface FakeEnvironment {
  hostname: string;
  search: string;
  storage: Record<string, string>;
  webgl2Available: boolean;
  touchPoints: number;
  mediaQueries: MediaQueryFixture[];
}

let environment: FakeEnvironment;

function makeMatchMedia(env: FakeEnvironment): typeof window.matchMedia {
  return ((query: string) => {
    const fixture = env.mediaQueries.find((entry) => entry.query === query);
    return {
      matches: fixture?.matches ?? false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

beforeEach(() => {
  environment = {
    hostname: "example.com",
    search: "",
    storage: {},
    webgl2Available: true,
    touchPoints: 0,
    mediaQueries: [],
  };

  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      get hostname() {
        return environment.hostname;
      },
      get search() {
        return environment.search;
      },
    },
  });

  vi.spyOn(window, "matchMedia").mockImplementation(makeMatchMedia(environment));

  Object.defineProperty(navigator, "maxTouchPoints", {
    configurable: true,
    get: () => environment.touchPoints,
  });

  vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(
    (key: unknown) => environment.storage[String(key)] ?? null,
  );
  vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(
    (key: unknown, value: unknown) => {
      environment.storage[String(key)] = String(value);
    },
  );

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((type: string) => {
    if (type === "webgl2" && environment.webgl2Available) {
      return {
        getExtension: () => ({}),
      } as unknown as WebGL2RenderingContext;
    }
    return null;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chooseMode — query string overrides", () => {
  it("returns FULL_MODE for ?mode=full and persists it", () => {
    environment.search = "?mode=full";
    const result = chooseMode();
    expect(result.mode).toBe("FULL_MODE");
    expect(result.source).toBe("query");
    expect(environment.storage[MODE_OVERRIDE_STORAGE_KEY]).toBe("FULL_MODE");
  });

  it("accepts ?mode=lite as LIGHTWEIGHT_MODE", () => {
    environment.search = "?mode=lite";
    const result = chooseMode();
    expect(result.mode).toBe("LIGHTWEIGHT_MODE");
    expect(result.source).toBe("query");
  });

  it("is case-insensitive", () => {
    environment.search = "?mode=Fallback";
    const result = chooseMode();
    expect(result.mode).toBe("FALLBACK_MODE");
  });

  it("ignores invalid values and falls through to auto-detect", () => {
    environment.search = "?mode=garbage";
    const result = chooseMode();
    expect(result.source).toBe("auto");
  });
});

describe("chooseMode — localStorage override", () => {
  it("uses stored value when no query param is present", () => {
    environment.storage[MODE_OVERRIDE_STORAGE_KEY] = "lightweight";
    const result = chooseMode();
    expect(result.mode).toBe("LIGHTWEIGHT_MODE");
    expect(result.source).toBe("storage");
  });

  it("query param takes precedence over storage", () => {
    environment.storage[MODE_OVERRIDE_STORAGE_KEY] = "fallback";
    environment.search = "?mode=full";
    const result = chooseMode();
    expect(result.mode).toBe("FULL_MODE");
    expect(result.source).toBe("query");
  });
});

describe("chooseMode — auto detection", () => {
  it("returns FALLBACK_MODE on blog. subdomain", () => {
    environment.hostname = "blog.example.com";
    const result = chooseMode();
    expect(result.mode).toBe("FALLBACK_MODE");
    expect(result.detail).toContain("blog");
  });

  it("returns FALLBACK_MODE when WebGL2 is unavailable", () => {
    environment.webgl2Available = false;
    const result = chooseMode();
    expect(result.mode).toBe("FALLBACK_MODE");
    expect(result.detail).toContain("webgl2");
  });

  it("returns FALLBACK_MODE on small viewport", () => {
    environment.mediaQueries = [
      {
        query: "(max-width: 900px), (orientation: portrait) and (max-width: 1100px)",
        matches: true,
      },
    ];
    const result = chooseMode();
    expect(result.mode).toBe("FALLBACK_MODE");
  });

  it("returns LIGHTWEIGHT_MODE on touch-primary capable device", () => {
    environment.mediaQueries = [{ query: "(pointer: coarse)", matches: true }];
    const result = chooseMode();
    expect(result.mode).toBe("LIGHTWEIGHT_MODE");
  });

  it("returns LIGHTWEIGHT_MODE on touchPoints > 0 even without coarse pointer", () => {
    environment.touchPoints = 5;
    const result = chooseMode();
    expect(result.mode).toBe("LIGHTWEIGHT_MODE");
  });

  it("returns FULL_MODE for capable desktop", () => {
    const result = chooseMode();
    expect(result.mode).toBe("FULL_MODE");
    expect(result.source).toBe("auto");
  });
});
