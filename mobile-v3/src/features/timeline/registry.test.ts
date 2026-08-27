import { describe, expect, it } from "vitest";
import { parseEventPayload } from "./registry";

describe("timeline event registry", () => {
  it("validates known payloads and safely keeps unknown types", () => {
    expect(parseEventPayload("weight", { weight_g: 4200 }).kind).toBe("known");
    expect(parseEventPayload("weight", { weight_g: -1 }).kind).toBe("unknown");
    expect(parseEventPayload("future_event", { raw: true })).toEqual({
      kind: "unknown",
      payload: { raw: true },
    });
  });
});
