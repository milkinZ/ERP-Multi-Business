"use client";

import React from "react";
import { useParams } from "next/navigation";

import { KitchenTicketDetailWorkspace } from "@/features/erp/kitchen/components/kitchen-ticket-detail-workspace";

export default function KitchenTicketDetailPage() {
  const params = useParams<{ orderId: string }>();
  return <KitchenTicketDetailWorkspace orderId={params.orderId} />;
}
