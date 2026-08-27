import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ui";

describe("ConfirmDialog", () => {
  it("requires the exact confirmation text", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="Delete family?"
        consequence="This removes access."
        confirmLabel="Delete"
        requireText="family-name"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    await user.type(screen.getByRole("textbox"), "family-name");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("keeps the dialog open and renders mutation failures", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        title="Remove?"
        consequence="Access ends."
        confirmLabel="Remove"
        onCancel={vi.fn()}
        onConfirm={async () => {
          throw new Error("server refused");
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "server refused",
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
