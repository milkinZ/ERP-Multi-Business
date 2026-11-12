"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";

import { API_BASE_URL } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth.store";

export function usePlatformRealtime(enabled: boolean) {
  const token = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!enabled || !token) return;

    const socket = io(
      `${API_BASE_URL.replace(/\/$/, "")}/platform-operations`,
      {
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1_000,
        reconnectionDelayMax: 10_000,
        timeout: 10_000,
      },
    );

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));
    socket.on("connect_error", () => setIsConnected(false));
    socket.on("platform.operations.updated", () => {
      void queryClient.invalidateQueries({
        queryKey: ["platform-observability"],
      });
      void queryClient.invalidateQueries({ queryKey: ["platform-workers"] });
      void queryClient.invalidateQueries({
        queryKey: ["platform-job-executions"],
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [enabled, queryClient, token]);

  return isConnected;
}
