import { describe, expect, it } from "vitest";
import { siteOriginFrom } from "@/lib/auth/origin";

const from = (headers: Record<string, string>) => siteOriginFrom((name) => headers[name] ?? null);

describe("siteOriginFrom", () => {
  it("uses the public host and protocol behind Cloudflare", () => {
    expect(from({ host: "codebuddy.5ee5.dev", "x-forwarded-proto": "https" })).toBe("https://codebuddy.5ee5.dev");
  });

  it("prefers X-Forwarded-Host and takes the first of a list", () => {
    expect(from({ host: "localhost:3100", "x-forwarded-host": "codebuddy.5ee5.dev, other", "x-forwarded-proto": "https, http" }))
      .toBe("https://codebuddy.5ee5.dev");
  });

  it("assumes http for local and LAN addresses, https otherwise", () => {
    expect(from({ host: "localhost:3001" })).toBe("http://localhost:3001");
    expect(from({ host: "192.168.8.8:3001" })).toBe("http://192.168.8.8:3001");
    expect(from({ host: "codebuddy.5ee5.dev" })).toBe("https://codebuddy.5ee5.dev");
  });
});
