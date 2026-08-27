import { describe, expect, it } from "vitest";
import { scopeLabel } from "./scope";

describe("scope labels", () => {
  const families = [{ id: "f1", name: "Home" }];
  const pets = [{ id: "p1", name: "Bean" }];

  it("does not use display names as identifiers", () => {
    expect(scopeLabel({ type: "family", id: "f1" }, families, pets)).toBe(
      "Home",
    );
    expect(scopeLabel({ type: "pet", id: "p1" }, families, pets)).toBe("Bean");
  });
});
