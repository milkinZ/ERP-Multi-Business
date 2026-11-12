"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";

import { API_BASE_URL } from "@/lib/api/client";
import { kitchenKeys } from "@/features/erp/kitchen/api/queries";

const kitchenEvents = [
  "kitchen.cooking.started",
  "kitchen.ready",
  "kitchen.served",
  "kitchen.cancelled",
  "kitchen.recalled",
  "kitchen.updated",
] as const;

export function useKitchenRealtime(
  accessToken: string | null,
  tenantId: string | undefined,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!accessToken || !tenantId) return;

    const socket = io(`${API_BASE_URL}/ws`, {
      auth: { token: accessToken },
      transports: ["websocket", "polling"],
      tryAllTransports: true,
      reconnection: true,
    });
    const refreshKitchen = () => {
      void queryClient.invalidateQueries({
        queryKey: kitchenKeys.queue(tenantId),
      });
      void queryClient.invalidateQueries({
        queryKey: ["kitchen", tenantId, "detail"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["kitchen-analytics", tenantId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["kitchen-stations", tenantId],
      });
    };

    kitchenEvents.forEach((eventName) => socket.on(eventName, refreshKitchen));

    return () => {
      kitchenEvents.forEach((eventName) =>
        socket.off(eventName, refreshKitchen),
      );
      socket.disconnect();
    };
  }, [accessToken, queryClient, tenantId]);
}
