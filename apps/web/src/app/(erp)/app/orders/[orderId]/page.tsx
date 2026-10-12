"use client"

import React from "react"
import { useParams } from "next/navigation"

import { OrderDetailWorkspace } from "@/features/erp/orders/components/order-detail-workspace"

export default function OrderDetailPage() {
	const params = useParams<{ orderId: string }>()
	return <OrderDetailWorkspace orderId={params.orderId} />
}