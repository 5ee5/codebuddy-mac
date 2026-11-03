import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/debug/route";
import { POST as learnPOST } from "@/app/api/learn/route";
import { CONCURRENT_REQUEST_LIMIT, HOURLY_REQUEST_LIMIT, resetUsageForTests } from "@/lib/server/usage-cap";
import { DEBUG_MAX_TOKENS, DEBUG_RESPONSE_SCHEMA, DEBUG_TIMEOUT_MS } from "@/lib/server/debug";

/*
 * The Anthropic client is replaced with a fake, so these tests never need a
 * real API key and never spend credits.
 */
const { create, createAnthropicClient } = vi.hoisted(() => {
  const create = vi.fn();
  return { create, createAnthropicClient: vi.fn(() => ({ messages: { create } })) };
});
vi.mock("@/lib/server/anthropic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/anthropic")>()),
  createAnthropicClient,
}));

/*
 * Sign-in is replaced with a fake too: by default the request comes from a
 * signed-in user; a test can make it anonymous.
 */
const { getRequestContext } = vi.hoisted(() => ({ getRequestContext: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ getRequestContext }));
const USER = { id: "00000000-0000-4000-8000-000000000001", email: "student@example.com" };
/** Stands in for the client the guard would build from a cookie or bearer token. */
const SUPABASE = {};

/*
 * The database is faked as well: by default the student has questions left
 * and answers are saved.
 */
const { claimAiRequest, recordAiAnswer } = vi.hoisted(() => ({
  claimAiRequest: vi.fn(),
  recordAiAnswer: vi.fn(),
}));
vi.mock("@/lib/db/ai-requests", () => ({ claimAiRequest, recordAiAnswer }));
const HISTORY_ID = "11111111-2222-4333-8444-555555555555";

const API_KEY = "sk-ant-test-key-never-real";
const MODEL = "claude-sonnet-5-5";
const PROVIDER_SECRET = "internal provider detail xyz";

// Distinctive strings, so tests can prove they never reach logs or errors.
const STUDENT_CODE = "secret_marker_1 = [10, 20, 30]\n\nfor i in range(4):\n\tprint(secret_marker_1[i])";
const STUDENT_PROBLEM = "secret_marker_2: IndexError: list index out of range";

const FIXED = "secret_marker_1 = [10, 20, 30]\n\nfor i in range(len(secret_marker_1)):\n\tprint(secret_marker_1[i])\n";

const diagnosed = {
  outcome: "diagnosed",
  diagnosis: "The loop reads one position past the end of the list.",
  explanation: "range(4) produces 0 to 3.\n\nThe list only has positions 0 to 2.",
  confirmed: ["The list has three items.", "The error is an IndexError on the print line."],
  hypotheses: [],
  missingInfo: [],
  correctedCode: { language: "python", code: FIXED },
  changes: [{ change: "range(4) became range(len(...))", reason: "The loop now follows the list length." }],
  nextSteps: ["Run the program and check it prints three numbers."],
};

const needsMoreInfo = {
  outcome: "needs_more_info",
  diagnosis: "The code alone doesn't show why the total is wrong.",
  explanation: "The loop looks correct, so the problem probably depends on the input.",
  confirmed: [],
  hypotheses: ["The numbers might be read as text."],
  missingInfo: ["The exact input you typed.", "The output you expected."],
  correctedCode: null,
  changes: [],
  nextSteps: ["Print each value and its type before adding it."],
};

function message(text: string, stop_reason: Anthropic.StopReason = "end_turn"): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: MODEL,
    content: [{ type: "text", text, citations: null }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 },
  } as unknown as Anthropic.Message;
}

const validBody = { mode: "debug", language: "python", code: STUDENT_CODE, problem: STUDENT_PROBLEM };

function makeRequest(
  url: string,
  body: unknown,
  { headers = {}, raw }: { headers?: Record<string, string>; raw?: string } = {},
): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      host: "localhost:3001",
      "content-type": "application/json",
      ...headers,
    },
    body: raw ?? JSON.stringify(body),
  });
}

function post(body: unknown = validBody, options?: Parameters<typeof makeRequest>[2]): Promise<Response> {
  return POST(makeRequest("http://localhost:3001/api/debug", body, options));
}

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetUsageForTests();
  create.mockReset();
  createAnthropicClient.mockClear();
  vi.stubEnv("ANTHROPIC_API_KEY", API_KEY);
  vi.stubEnv("ANTHROPIC_MODEL", MODEL);
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  getRequestContext.mockReset().mockResolvedValue({ user: USER, supabase: SUPABASE });
  claimAiRequest.mockReset().mockResolvedValue({ ok: true, requestId: HISTORY_ID, remaining: 19 });
  recordAiAnswer.mockReset().mockResolvedValue(true);
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  // Nothing sensitive or submitted may ever reach the server log.
  const logged = JSON.stringify(errorLog.mock.calls);
  for (const secret of [API_KEY, USER.email, PROVIDER_SECRET, "secret_marker_1", "secret_marker_2"]) {
    expect(logged).not.toContain(secret);
  }
});

async function expectFailure(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get("cache-control")).toBe("no-store");
  const text = await res.text();
  for (const secret of [API_KEY, USER.email, PROVIDER_SECRET, "secret_marker_1", "secret_marker_2"]) {
    expect(text).not.toContain(secret);
  }
  const body = JSON.parse(text);
  expect(body).toMatchObject({ status: "error", code });
  expect(typeof body.message).toBe("string");
  return body;
}

describe("POST /api/debug: rejected before any paid call", () => {
  afterEach(() => expect(create).not.toHaveBeenCalled());

  it.each(["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"])(
    "returns 503 when %s is missing",
    async (name) => {
      vi.stubEnv(name, "");
      await expectFailure(await post(), 503, "not_configured");
    },
  );

  it("returns 401 when nobody is signed in", async () => {
    getRequestContext.mockResolvedValue(null);
    await expectFailure(await post(), 401, "access_denied");
  });

  it("returns 403 for a cross-site request", async () => {
    await expectFailure(await post(validBody, { headers: { origin: "https://evil.example" } }), 403, "access_denied");
  });

  it("returns 415 for a non-JSON content type", async () => {
    await expectFailure(await post(validBody, { headers: { "content-type": "text/plain" } }), 415, "invalid_request");
  });

  it("returns 413 for a body over 64 KB", async () => {
    const raw = JSON.stringify({ ...validBody, code: "x".repeat(70_000) });
    await expectFailure(await post(null, { raw }), 413, "invalid_request");
  });

  it("returns 400 for malformed JSON", async () => {
    await expectFailure(await post(null, { raw: "{not json" }), 400, "invalid_request");
  });

  it.each([
    ["the wrong mode", { ...validBody, mode: "learn" }],
    ["an unknown language", { ...validBody, language: "rust" }],
    ["a missing problem", { mode: "debug", language: "python", code: STUDENT_CODE }],
  ])("returns 400 for %s", async (_label, body) => {
    await expectFailure(await post(body), 400, "invalid_request");
  });

  it.each([
    ["empty code", { code: "   \n  " }, "code"],
    ["oversized code (within the body limit)", { code: "x".repeat(10_001) }, "code"],
    ["an empty problem", { problem: "" }, "problem"],
    ["an oversized problem", { problem: "x".repeat(4_001) }, "problem"],
  ])("returns 400 with a field error for %s", async (_label, patch, field) => {
    const body = await expectFailure(await post({ ...validBody, ...patch }), 400, "invalid_request");
    expect(typeof body.fieldErrors[field]).toBe("string");
  });

  it("returns 429 once the shared hourly cap is used up by Learn questions", async () => {
    create.mockResolvedValue(
      message(
        JSON.stringify({
          explanation: "A loop repeats code.",
          example: null,
          keyPoints: ["Loops repeat."],
          followUpQuestions: [],
        }),
      ),
    );
    const learnBody = { mode: "learn", question: "What is a for loop in Python?", level: "beginner" };
    for (let i = 0; i < HOURLY_REQUEST_LIMIT; i++) {
      const res = await learnPOST(makeRequest("http://localhost:3001/api/learn", learnBody));
      expect(res.status).toBe(200);
    }
    create.mockClear();
    await expectFailure(await post(), 429, "rate_limited");
  });
});

describe("POST /api/debug: concurrency", () => {
  it(`refuses a request while ${CONCURRENT_REQUEST_LIMIT} are still in progress`, async () => {
    const pending: Array<(value: Anthropic.Message) => void> = [];
    create.mockImplementation(() => new Promise<Anthropic.Message>((resolve) => pending.push(resolve)));

    const inFlight = Array.from({ length: CONCURRENT_REQUEST_LIMIT }, () => post());
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(CONCURRENT_REQUEST_LIMIT));

    await expectFailure(await post(), 429, "rate_limited");
    expect(create).toHaveBeenCalledTimes(CONCURRENT_REQUEST_LIMIT);

    pending.forEach((resolve) => resolve(message(JSON.stringify(diagnosed))));
    for (const res of await Promise.all(inFlight)) expect(res.status).toBe(200);

    // Slots are released afterwards.
    create.mockResolvedValueOnce(message(JSON.stringify(diagnosed)));
    expect((await post()).status).toBe(200);
  });
});

describe("POST /api/debug: model call", () => {
  it("returns a validated diagnosis and sends the expected request", async () => {
    create.mockResolvedValueOnce(message(JSON.stringify(diagnosed)));
    const res = await post();

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ status: "answered", mode: "debug", model: MODEL, historyId: HISTORY_ID });
    expect(claimAiRequest).toHaveBeenCalledWith(SUPABASE, "debug");
    expect(recordAiAnswer).toHaveBeenCalledWith(SUPABASE, HISTORY_ID, expect.anything(), {
      mode: "debug",
      language: "python",
      code: STUDENT_CODE,
      problem: STUDENT_PROBLEM,
    });
    expect(body.response).toEqual({ mode: "debug", ...diagnosed });
    expect(body.response.correctedCode.code).toBe(FIXED);
    expect(Date.parse(body.createdAt)).not.toBeNaN();

    expect(createAnthropicClient).toHaveBeenCalledWith(API_KEY);
    expect(create).toHaveBeenCalledTimes(1);
    const [params, options] = create.mock.calls[0];
    expect(params).toMatchObject({
      model: MODEL,
      max_tokens: DEBUG_MAX_TOKENS,
      output_config: { effort: "low", format: { type: "json_schema", schema: DEBUG_RESPONSE_SCHEMA } },
    });
    expect(DEBUG_MAX_TOKENS).toBe(8000);
    for (const key of ["temperature", "top_p", "top_k", "thinking", "tools", "fallbacks"]) {
      expect(params).not.toHaveProperty(key);
    }
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.timeout).toBe(DEBUG_TIMEOUT_MS);
    expect(DEBUG_TIMEOUT_MS).toBe(90_000);

    // The submission travels as JSON data, with its exact code.
    const content: string = params.messages[0].content;
    const submission = JSON.parse(content.slice(content.indexOf("{")));
    expect(submission).toMatchObject({ languageId: "python", code: STUDENT_CODE, problem: STUDENT_PROBLEM });
  });

  it("returns an answer that asks for more information", async () => {
    create.mockResolvedValueOnce(message(JSON.stringify(needsMoreInfo)));
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.response.outcome).toBe("needs_more_info");
    expect(body.response.missingInfo).toHaveLength(2);
    expect(body.response).not.toHaveProperty("correctedCode");
  });

  it.each([
    ["non-JSON text", message("I ran your code and the bug is on line 4.")],
    ["JSON missing fields", message(JSON.stringify({ diagnosis: "Only this" }))],
    ["needs_more_info without missing information", message(JSON.stringify({ ...needsMoreInfo, missingInfo: [] }))],
    ["corrected code without explained changes", message(JSON.stringify({ ...diagnosed, changes: [] }))],
    ["corrected code in another language", message(JSON.stringify({ ...diagnosed, correctedCode: { language: "java", code: "x" } }))],
    ["no text block", { ...message(""), content: [] } as unknown as Anthropic.Message],
    ["a max_tokens stop", message('{"diagnosis": "cut of', "max_tokens")],
  ])("returns 502 malformed_output for %s", async (_label, reply) => {
    create.mockResolvedValueOnce(reply);
    await expectFailure(await post(), 502, "malformed_output");
  });

  it("explains a cut-off answer in terms of code size", async () => {
    create.mockResolvedValueOnce(message("{", "max_tokens"));
    const body = await expectFailure(await post(), 502, "malformed_output");
    expect(body.message).toMatch(/smaller piece of code/);
  });

  it("returns 422 refused when the model refuses", async () => {
    create.mockResolvedValueOnce(message("", "refusal"));
    await expectFailure(await post(), 422, "refused");
  });

  const headers = new Headers({ "request-id": "req_test_123" });
  const apiBody = { type: "error", error: { type: "x", message: PROVIDER_SECRET } };
  it.each([
    ["RateLimitError", new Anthropic.RateLimitError(429, apiBody, PROVIDER_SECRET, headers), 429, "rate_limited"],
    ["AuthenticationError", new Anthropic.AuthenticationError(401, apiBody, PROVIDER_SECRET, headers), 503, "not_configured"],
    ["NotFoundError (bad model)", new Anthropic.NotFoundError(404, apiBody, PROVIDER_SECRET, headers), 503, "not_configured"],
    ["BadRequestError", new Anthropic.BadRequestError(400, apiBody, PROVIDER_SECRET, headers), 502, "unavailable"],
    ["InternalServerError", new Anthropic.InternalServerError(500, apiBody, PROVIDER_SECRET, headers), 503, "unavailable"],
    ["APIConnectionTimeoutError", new Anthropic.APIConnectionTimeoutError({ message: PROVIDER_SECRET }), 504, "timeout"],
    ["APIConnectionError", new Anthropic.APIConnectionError({ message: PROVIDER_SECRET }), 503, "unavailable"],
    ["an unexpected Error", new Error(PROVIDER_SECRET), 500, "unavailable"],
  ])("maps %s to a safe %i response without retrying", async (_label, error, status, code) => {
    create.mockRejectedValueOnce(error);
    await expectFailure(await post(), status, code);
    expect(create).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith("[api/debug]", code, status, expect.any(String));
  });
});
