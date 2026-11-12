import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { io, type Socket } from "socket.io-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useKitchenRealtime } from "./use-kitchen-realtime";

const listeners = new Map<string, () => void>();
const socketMock = {
  on: vi.fn((event: string, listener: () => void) => {
    listeners.set(event, listener);
    return socketMock;
  }),
  off: vi.fn((event: string) => {
    listeners.delete(event);
    return socketMock;
  }),
  disconnect: vi.fn(),
} as unknown as Socket;

vi.mock("socket.io-client", () => ({ io: vi.fn() }));

function RealtimeHarness() {
  useKitchenRealtime("test-token", "tenant-1");
  return null;
}

describe("Kitchen realtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    vi.mocked(io).mockReturnValue(socketMock);
  });

  it("authenticates the socket, supports polling fallback, and refreshes Kitchen data", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();
    const view = render(
      <QueryClientProvider client={queryClient}>
        <RealtimeHarness />
      </QueryClientProvider>,
    );

    expect(io).toHaveBeenCalledWith(
      expect.stringMatching(/\/ws$/),
      expect.objectContaining({
        auth: { token: "test-token" },
        transports: ["websocket", "polling"],
        tryAllTransports: true,
      }),
    );

    listeners.get("kitchen.updated")?.();
    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledTimes(4);
    });

    view.unmount();
    expect(socketMock.disconnect).toHaveBeenCalledOnce();
  });
});
