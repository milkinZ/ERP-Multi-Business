import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getKitchenTimerState, KitchenItemTimer } from "./kitchen-item-timer";

describe("KitchenItemTimer", () => {
  it("counts down the product-specific target from the cooking start", () => {
    const state = getKitchenTimerState(
      5,
      "2026-10-31T00:00:00.000Z",
      null,
      Date.parse("2026-10-31T00:04:10.000Z"),
    );

    expect(state).toEqual({ kind: "running", label: "00:50 remaining" });
  });

  it("marks an item overdue after its individual target expires", () => {
    const state = getKitchenTimerState(
      2,
      "2026-10-31T00:00:00.000Z",
      null,
      Date.parse("2026-10-31T00:02:30.000Z"),
    );

    expect(state).toEqual({ kind: "overdue", label: "00:30 overdue" });
  });

  it("uses the persisted completion timestamp for completed items", () => {
    const state = getKitchenTimerState(
      2,
      "2026-10-31T00:00:00.000Z",
      "2026-10-31T00:02:30.000Z",
      Date.parse("2026-10-31T00:30:00.000Z"),
    );

    expect(state).toEqual({
      kind: "completed-late",
      label: "Finished 00:30 over target",
    });
  });

  it("renders a clear waiting state before cooking begins", () => {
    render(
      <KitchenItemTimer
        prepTimeMinutes={8}
        startedAt={null}
        completedAt={null}
      />,
    );
    expect(screen.getByTestId("kitchen-item-timer")).toHaveTextContent(
      "Target 8 min · starts with cooking",
    );
  });
});
