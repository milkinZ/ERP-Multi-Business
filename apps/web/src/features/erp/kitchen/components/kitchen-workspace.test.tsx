import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assignKitchenTicket,
  getKitchenAnalytics,
  getKitchenOperators,
  getKitchenOutlets,
  getKitchenQueueWithFilters,
  getKitchenSettings,
  getKitchenStations,
  getKitchenTicket,
  updateKitchenStation,
} from "@/features/erp/kitchen/api/queries";
import { KitchenTicketDetailWorkspace } from "./kitchen-ticket-detail-workspace";
import { KitchenWorkspace } from "./kitchen-workspace";

vi.mock("@/stores/auth.store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      accessToken: "test-token",
      session: {
        scope: "tenant",
        userId: "user-1",
        tenantId: "tenant-1",
        outletId: "outlet-1",
        permissions: ["kitchen.read", "kitchen.update"],
      },
    }),
}));

vi.mock("@/features/erp/kitchen/hooks/use-kitchen-realtime", () => ({
  useKitchenRealtime: vi.fn(),
}));

vi.mock("@/features/erp/kitchen/api/queries", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/erp/kitchen/api/queries")>();
  return {
    ...actual,
    assignKitchenTicket: vi.fn(),
    getKitchenAnalytics: vi.fn(),
    getKitchenOperators: vi.fn(),
    getKitchenOutlets: vi.fn(),
    getKitchenQueueWithFilters: vi.fn(),
    getKitchenSettings: vi.fn(),
    getKitchenStations: vi.fn(),
    getKitchenTicket: vi.fn(),
    updateKitchenStation: vi.fn(),
  };
});

const ticket = {
  id: "ticket-1",
  ticketNumber: "K-1001",
  salesOrderId: "order-1",
  tenantId: "tenant-1",
  outletId: "outlet-1",
  assignedUser: null,
  releasedAt: "2026-10-31T10:00:00.000Z",
  startedAt: null,
  readyAt: null,
  items: [
    {
      productId: "product-1",
      productName: "Flat white",
      category: "coffee",
      quantity: 1,
      stationId: "station-1",
      stationName: "Coffee",
      prepTimeMinutes: 5,
      startedAt: null,
      completedAt: null,
      recipeSnapshotAvailable: true,
      ingredients: [],
    },
  ],
  status: "QUEUED" as const,
  priority: 0,
  waitingTooLong: false,
  createdById: "user-1",
  createdAt: "2026-10-31T10:00:00.000Z",
  updatedAt: "2026-10-31T10:00:00.000Z",
};

const station = {
  id: "station-1",
  tenantId: "tenant-1",
  outletId: "outlet-1",
  name: "Coffee",
  displayOrder: 0,
  isActive: true,
  Categories: [{ id: "category-1", category: "coffee" }],
};

function renderWithQueryClient(element: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
  );
}

describe("Kitchen workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getKitchenSettings).mockResolvedValue({
      waitThresholdMinutes: 15,
    });
    vi.mocked(getKitchenOutlets).mockResolvedValue([
      { id: "outlet-1", name: "Downtown" },
    ]);
    vi.mocked(getKitchenStations).mockResolvedValue([station]);
    vi.mocked(getKitchenOperators).mockResolvedValue([
      { id: "operator-1", email: "barista@example.test" },
    ]);
    vi.mocked(getKitchenQueueWithFilters).mockResolvedValue([ticket]);
    vi.mocked(getKitchenAnalytics).mockResolvedValue({
      totalTickets: 1,
      startAt: "2026-10-01T00:00:00.000Z",
      endAt: "2026-10-31T23:59:59.999Z",
      stations: [
        {
          stationId: "station-1",
          stationName: "Coffee",
          ticketCount: 1,
          averageWaitSeconds: 30,
          averageCookSeconds: 120,
          onTimeItems: 1,
          timedItems: 1,
          slaPercent: 100,
        },
      ],
    });
    vi.mocked(assignKitchenTicket).mockResolvedValue({
      ...ticket,
      assignedUser: { id: "operator-1", email: "barista@example.test" },
    });
    vi.mocked(updateKitchenStation).mockResolvedValue(station);
  });

  it("filters by station, assigns an operator, and displays the Kitchen timer", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<KitchenWorkspace />);

    expect(await screen.findByText("K-1001")).toBeInTheDocument();
    expect(
      screen.getByText("Target 5 min · starts with cooking"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/1 tickets released in this date range/),
    ).toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Queue station" }),
      "station-1",
    );
    await waitFor(() => {
      expect(getKitchenQueueWithFilters).toHaveBeenCalledWith(
        "test-token",
        expect.objectContaining({ stationId: "station-1" }),
        0,
      );
    });

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Primary operator" }),
      "operator-1",
    );
    await waitFor(() => {
      expect(assignKitchenTicket).toHaveBeenCalledWith(
        "test-token",
        "order-1",
        "operator-1",
      );
    });
  });

  it("reactivates an inactive station from the station manager", async () => {
    vi.mocked(getKitchenStations).mockResolvedValue([
      { ...station, isActive: false },
    ]);
    const user = userEvent.setup();
    renderWithQueryClient(<KitchenWorkspace />);

    await user.click(await screen.findByRole("button", { name: "Activate" }));
    await waitFor(() => {
      expect(updateKitchenStation).toHaveBeenCalledWith(
        "test-token",
        "station-1",
        { isActive: true },
      );
    });
  });
});

describe("Kitchen ticket printing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getKitchenTicket).mockResolvedValue(ticket);
  });

  it("opens the browser print dialog for ticket details", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    renderWithQueryClient(<KitchenTicketDetailWorkspace orderId="order-1" />);

    await screen.findByText("K-1001");
    fireEvent.click(screen.getByRole("button", { name: "Print ticket" }));

    expect(print).toHaveBeenCalledOnce();
  });
});
