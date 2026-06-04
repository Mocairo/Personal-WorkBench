import { describe, expect, it } from "vitest";
import { fail, notImplemented, ok, permissionDenied, unwrapApiResult } from "./apiResult";

describe("ApiResult contract", () => {
  it("wraps success and safe errors with a stable shape", () => {
    expect(ok({ value: 1 })).toEqual({ ok: true, data: { value: 1 } });
    expect(permissionDenied("Level 3 is disabled in phase 1")).toMatchObject({
      error: {
        code: "PERMISSION_DENIED",
        message: "Level 3 is disabled in phase 1",
        retryable: false,
      },
      ok: false,
    });
    expect(notImplemented("LLM calls are phase 2")).toMatchObject({
      error: { code: "NOT_IMPLEMENTED", message: "LLM calls are phase 2" },
      ok: false,
    });

    const result = fail({
      code: "UNKNOWN_ERROR",
      detail: "D:\\Users\\mocairo\\secret\\token.txt failed",
      message: "D:\\Users\\mocairo\\secret\\token.txt failed",
    });

    expect(result.error.message).toBe("Local operation failed");
    expect(result.error.detail).not.toContain("token.txt");
  });

  it("unwraps ApiResult for existing data hooks", () => {
    expect(unwrapApiResult(ok({ page: "home" }))).toEqual({ page: "home" });
    expect(() => unwrapApiResult(permissionDenied("Denied"))).toThrow("Denied");
  });
});
