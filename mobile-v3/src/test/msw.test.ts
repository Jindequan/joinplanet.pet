import { describe, expect, it } from "vitest";
import { api } from "../core/api/client";

describe("MSW API boundary", () => {
  it("serves a real request through the test transport", async () => {
    await expect(api.get<{ ok: boolean }>("/test-resource")).resolves.toEqual({
      ok: true,
    });
  });
});
