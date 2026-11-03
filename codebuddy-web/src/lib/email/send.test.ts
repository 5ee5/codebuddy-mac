import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/lib/email/send";

const CONFIG = { apiKey: "re_test_secret_key", from: "CodeBuddy <noreply@codebuddy.example>", siteUrl: "https://codebuddy.example" };
const MESSAGE = { subject: "Hi", text: "Hello", html: "<p>Hello</p>" };

let errorLog: ReturnType<typeof vi.spyOn>;

afterEach(() => {
  // Neither the address nor the API key may ever be logged.
  const logged = JSON.stringify(errorLog?.mock.calls ?? []);
  expect(logged).not.toContain("ada@example.com");
  expect(logged).not.toContain(CONFIG.apiKey);
});

function mockFetch(impl: () => Promise<Response>) {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("sendEmail", () => {
  it("sends one email through Resend's API", async () => {
    const fetchMock = mockFetch(async () => Response.json({ id: "email_1" }));
    expect(await sendEmail(CONFIG, "ada@example.com", MESSAGE)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${CONFIG.apiKey}` });
    expect(JSON.parse(init.body as string)).toEqual({
      from: CONFIG.from,
      to: ["ada@example.com"],
      subject: "Hi",
      html: "<p>Hello</p>",
      text: "Hello",
    });
  });

  it("reports a refused email", async () => {
    mockFetch(async () => new Response("domain not verified", { status: 403 }));
    expect(await sendEmail(CONFIG, "ada@example.com", MESSAGE)).toBe(false);
    expect(errorLog).toHaveBeenCalledWith("[email]", "send", 403);
  });

  it("reports a network failure instead of throwing", async () => {
    mockFetch(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await sendEmail(CONFIG, "ada@example.com", MESSAGE)).toBe(false);
  });
});
