import { describe, expect, it, vi } from "vitest";
import { askDebug, askLearn, previewRequest } from "@/lib/assistant/client";
import type { DebugRequest, LearnRequest } from "@/lib/assistant/types";

const request: LearnRequest = { mode: "learn", question: "What is a variable?", level: "beginner" };

function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("askLearn", () => {
  it("posts JSON to the same site, relying on the session cookie", async () => {
    const answer = {
      status: "answered",
      mode: "learn",
      model: "claude-sonnet-5-5",
      createdAt: "2026-10-24T12:00:00.000Z",
      response: {
        mode: "learn",
        explanation: "A variable stores a value.",
        keyPoints: ["Names point at values."],
        followUpQuestions: [],
      },
    };
    const fetchMock = mockFetch(async () => Response.json(answer));

    const result = await askLearn(request);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/learn");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    // The default `same-origin` credentials send the session cookie; nothing wider.
    expect(init.credentials).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual(request);
    expect(result).toEqual(answer);
  });

  it("keeps the daily allowance and history id, but only a well-formed id", async () => {
    const answer = {
      status: "answered",
      mode: "learn",
      model: "claude-sonnet-5-5",
      createdAt: "2026-10-24T12:00:00.000Z",
      response: { mode: "learn", explanation: "A variable stores a value.", keyPoints: ["Names point at values."], followUpQuestions: [] },
    };
    const id = "11111111-2222-4333-8444-555555555555";
    mockFetch(async () => Response.json({ ...answer, remainingToday: 7, historyId: id }));
    expect(await askLearn(request)).toEqual({ ...answer, remainingToday: 7, historyId: id });

    mockFetch(async () => Response.json({ ...answer, remainingToday: "7", historyId: "../../evil" }));
    expect(await askLearn(request)).toEqual(answer);
  });

  it("passes through a server failure with its field errors", async () => {
    mockFetch(async () =>
      Response.json(
        { status: "error", code: "invalid_request", message: "Fix it", fieldErrors: { question: "Too short" } },
        { status: 400 },
      ),
    );
    expect(await askLearn(request)).toEqual({
      status: "error",
      code: "invalid_request",
      message: "Fix it",
      fieldErrors: { question: "Too short" },
    });
  });

  it("turns a network error into a typed failure", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await askLearn(request)).toMatchObject({ status: "error", code: "network" });
  });

  it("turns a non-JSON reply into a typed failure", async () => {
    mockFetch(async () => new Response("<html>Bad gateway</html>", { status: 502 }));
    expect(await askLearn(request)).toMatchObject({ status: "error", code: "unavailable" });
  });

  it("rejects an answer that does not match the contract", async () => {
    mockFetch(async () =>
      Response.json({ status: "answered", model: "m", createdAt: "t", response: { explanation: 1 } }),
    );
    expect(await askLearn(request)).toMatchObject({ status: "error", code: "malformed_output" });
  });

  it("rejects unknown error codes", async () => {
    mockFetch(async () => Response.json({ status: "error", code: "stack_trace", message: "at foo.js:1" }));
    expect(await askLearn(request)).toMatchObject({ status: "error", code: "unavailable" });
  });

  it("returns a failure instead of throwing when aborted", async () => {
    mockFetch((_url, init) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    const controller = new AbortController();
    const pending = askLearn(request, controller.signal);
    controller.abort();
    expect(await pending).toMatchObject({ status: "error" });
  });
});

describe("previewRequest", () => {
  it("stays local and points at the per-mode endpoint", async () => {
    const fetchMock = mockFetch(async () => new Response());
    const preview = await previewRequest({
      mode: "debug",
      language: "python",
      code: "print(x)",
      problem: "",
    });
    expect(preview).toMatchObject({ status: "not-connected", plannedEndpoint: "/api/debug" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("askDebug", () => {
  const debugRequest: DebugRequest = {
    mode: "debug",
    language: "python",
    code: "def total(xs):\n\tresult = 0\n    for x in xs:\n        result += x\n\n    return result",
    problem: "It returns 0 for [1, 2, 3]",
  };
  const answer = {
    status: "answered",
    mode: "debug",
    model: "claude-sonnet-5-5",
    createdAt: "2026-10-24T12:00:00.000Z",
    response: {
      mode: "debug",
      outcome: "diagnosed",
      diagnosis: "The return is inside the loop.",
      explanation: "It returns after the first item.",
      confirmed: ["return is indented under the loop."],
      hypotheses: [],
      missingInfo: [],
      correctedCode: { language: "python", code: "def total(xs):\n    result = 0\n" },
      changes: [{ change: "Moved return out of the loop.", reason: "So every item is added first." }],
      nextSteps: ["Call total([1, 2, 3]) and expect 6."],
    },
  };

  it("posts to /api/debug with the code byte for byte", async () => {
    const fetchMock = mockFetch(async () => Response.json(answer));
    const result = await askDebug(debugRequest);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/debug");
    expect(JSON.parse(init.body as string)).toEqual(debugRequest);
    expect(JSON.parse(init.body as string).code).toBe(debugRequest.code);
    expect(result).toEqual(answer);
  });

  it("maps field errors for code and problem, ignoring unknown fields", async () => {
    mockFetch(async () =>
      Response.json(
        {
          status: "error",
          code: "invalid_request",
          message: "Fix it",
          fieldErrors: { code: "Paste the code", problem: "Too short", hacker: "<b>x</b>" },
        },
        { status: 400 },
      ),
    );
    expect(await askDebug(debugRequest)).toEqual({
      status: "error",
      code: "invalid_request",
      message: "Fix it",
      fieldErrors: { code: "Paste the code", problem: "Too short" },
    });
  });

  it("rejects an answer that breaks the Debug contract", async () => {
    const broken = { ...answer, response: { ...answer.response, changes: [] } };
    mockFetch(async () => Response.json(broken));
    expect(await askDebug(debugRequest)).toMatchObject({ status: "error", code: "malformed_output" });
  });

  it("rejects corrected code in a different language from the request", async () => {
    const wrong = {
      ...answer,
      response: { ...answer.response, correctedCode: { language: "java", code: "class A {}" } },
    };
    mockFetch(async () => Response.json(wrong));
    expect(await askDebug(debugRequest)).toMatchObject({ status: "error", code: "malformed_output" });
  });

  it("turns a network error into a typed failure", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await askDebug(debugRequest)).toMatchObject({ status: "error", code: "network" });
  });
});
