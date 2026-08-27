import { describe, expect, it } from "vitest";
import { createCommandId } from "./idempotency";
import { ApiError, errorMessage } from "./errors";

describe("API errors", () => {
  it("keeps structured conflict details", () => {
    const error = new ApiError({
      status: 409,
      code: "VERSION_CONFLICT",
      message: "changed",
      current: { version: 2 },
    });
    expect(error.code).toBe("VERSION_CONFLICT");
    expect(error.current).toEqual({ version: 2 });
  });

  it("maps permission and retry states to user-readable copy", () => {
    expect(
      errorMessage(
        new ApiError({ status: 403, code: "ROLE_FORBIDDEN", message: "no" }),
      ),
    ).toContain("权限");
    expect(
      errorMessage(
        new ApiError({ status: 429, code: "RATE_LIMITED", message: "no" }),
      ),
    ).toContain("稍后再试");
  });
});

describe("idempotency", () => {
  it("creates a stable command value that callers can reuse", () => {
    const command = createCommandId();
    expect(command).toEqual(expect.any(String));
    expect(command.length).toBeGreaterThanOrEqual(8);
  });
});
