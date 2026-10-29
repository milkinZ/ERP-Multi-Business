"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  PageHeader,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import { ApiError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";
import {
  getOrder,
  orderKeys,
  payOrder,
  updateOrderStatus,
  type OrderStatus,
  type PaymentMethod,
} from "@/features/erp/orders/api/queries";
import {
  paymentSchema,
  type PaymentFormValues,
} from "@/features/erp/orders/schemas/order.schema";

function formatAmount(value: number, currencyCode?: string | null) {
  return currencyCode
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode,
        maximumFractionDigits: 0,
      }).format(value)
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
        value,
      );
}

function statusTone(status: OrderStatus) {
  if (status === "PAID" || status === "COMPLETED") return "success" as const;
  if (status === "CANCELLED") return "danger" as const;
  if (status === "IN_PROGRESS" || status === "READY") return "info" as const;
  return "warning" as const;
}

function userMessage(cause: unknown, fallback: string) {
  if (!(cause instanceof ApiError))
    return cause instanceof Error ? cause.message : fallback;
  if (cause.status === 403)
    return "Your session is not authorized for this action.";
  if (cause.status === 404)
    return "The order was not found in the current tenant scope.";
  if (cause.status === 409)
    return "The order changed before this action completed. Refresh and try again.";
  return cause.message || fallback;
}

export function OrderDetailWorkspace({ orderId }: { orderId: string }) {
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canCreatePayment = hasPermission(session, "payment.create");
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const query = useQuery({
    queryKey: tenantId
      ? orderKeys.detail(tenantId, orderId)
      : ["orders", "unauthenticated", orderId],
    queryFn: () => getOrder(token as string, orderId),
    enabled: Boolean(token && tenantId && orderId),
    staleTime: 15_000,
  });

  const invalidateOrderState = async (includeInventory: boolean) => {
    if (tenantId) {
      await queryClient.invalidateQueries({
        queryKey: orderKeys.all(tenantId),
      });
      await queryClient.invalidateQueries({
        queryKey: orderKeys.detail(tenantId, orderId),
      });
    }
    if (includeInventory)
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
    await queryClient.invalidateQueries({ queryKey: ["erp-dashboard"] });
  };

  const statusMutation = useMutation({
    mutationFn: (status: OrderStatus) => {
      if (!token) throw new Error("Authentication required");
      return updateOrderStatus(token, orderId, status);
    },
    onSuccess: async () => {
      setActionError(null);
      await invalidateOrderState(false);
    },
    onError: (cause) =>
      setActionError(userMessage(cause, "Unable to update order status")),
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { method: "CASH", amount: query.data?.totalAmount ?? 0 },
  });
  useEffect(() => {
    if (query.data)
      setValue(
        "amount",
        Math.max(0, query.data.totalAmount - query.data.paidAmount),
      );
  }, [query.data, setValue]);
  const paymentMutation = useMutation({
    mutationFn: (values: PaymentFormValues) => {
      if (!token) throw new Error("Authentication required");
      return payOrder(token, {
        orderId,
        method: values.method as PaymentMethod,
        amount: values.amount,
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setPaymentOpen(false);
      reset({
        method: "CASH",
        amount: Math.max(
          0,
          (query.data?.totalAmount ?? 0) - (query.data?.paidAmount ?? 0),
        ),
      });
      await invalidateOrderState(true);
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (cause) =>
      setActionError(userMessage(cause, "Unable to process payment")),
  });

  if (query.isPending)
    return (
      <div className="h-64 animate-pulse rounded-[24px] bg-[var(--muted)]" />
    );
  if (query.isError)
    return (
      <UnavailableState
        title="Unable to load order"
        description={
          query.error instanceof ApiError && query.error.status === 404
            ? "This order was not found in the current tenant scope."
            : "The order detail API could not be reached."
        }
      />
    );
  if (!query.data)
    return (
      <UnavailableState
        title="Order not found"
        description="The API returned no order for this route."
      />
    );

  const order = query.data;
  const canCancel =
    order.status !== "COMPLETED" && order.status !== "CANCELLED";
  const outstandingAmount = Math.max(0, order.totalAmount - order.paidAmount);
  const canPay =
    canCreatePayment &&
    order.paymentStatus !== "PAID" &&
    order.status !== "CANCELLED" &&
    (order.status !== "COMPLETED" || order.orderMode === "OPEN_BILL");
  const busy = statusMutation.isPending || paymentMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tenant application / commerce"
        title={order.orderNumber}
        description={`${order.orderMode === "OPEN_BILL" ? "Open bill" : "Regular order"} · tenant-scoped order`}
        actions={
          <StatusBadge tone={statusTone(order.status)}>
            {order.status}
          </StatusBadge>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Total", order.totalAmount],
          ["Paid", order.paidAmount],
          ["Outstanding", outstandingAmount],
        ].map(([label, amount]) => (
          <div
            key={label}
            className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5"
          >
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatAmount(Number(amount), order.currencyCode)}
            </p>
          </div>
        ))}
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Payment status
          </p>
          <p className="mt-2 font-semibold">{order.paymentStatus}</p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Outlet: {order.outletId ?? "All outlets"}
          </p>
        </div>
      </div>
      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Order actions</p>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {order.orderMode === "OPEN_BILL"
                ? "Open bills may be paid in multiple installments, including after serving."
                : "Regular cafe orders are sent to the kitchen after full payment."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canPay ? (
              <button
                type="button"
                onClick={() => setPaymentOpen((open) => !open)}
                disabled={busy}
                className="rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {paymentOpen ? "Close payment" : "Record payment"}
              </button>
            ) : null}
            {canCancel ? (
              <button
                type="button"
                onClick={() => statusMutation.mutate("CANCELLED")}
                disabled={busy}
                className="rounded-xl border border-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-[var(--danger)] disabled:opacity-50"
              >
                {statusMutation.isPending ? "Updating..." : "Cancel order"}
              </button>
            ) : null}
          </div>
        </div>
        {paymentOpen && canPay ? (
          <form
            onSubmit={handleSubmit((values) => paymentMutation.mutate(values))}
            className="mt-5 grid gap-4 border-t border-[var(--border)] pt-5 md:grid-cols-[1fr_1fr_auto] md:items-end"
            noValidate
          >
            <label className="block text-sm font-medium">
              Method
              <select
                {...register("method")}
                className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
              >
                <option value="CASH">Cash</option>
                <option value="QRIS">QRIS</option>
                <option value="TRANSFER">Transfer</option>
              </select>
              {errors.method && (
                <span className="mt-1 block text-xs text-[var(--danger)]">
                  {errors.method.message}
                </span>
              )}
            </label>
            <label className="block text-sm font-medium">
              Amount ({order.currencyCode ?? "tenant currency"})
              <input
                {...register("amount", { valueAsNumber: true })}
                type="number"
                min="1"
                max={outstandingAmount}
                step="1"
                className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
              />
              {errors.amount && (
                <span className="mt-1 block text-xs text-[var(--danger)]">
                  {errors.amount.message}
                </span>
              )}
              <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
                Outstanding:{" "}
                {formatAmount(outstandingAmount, order.currencyCode)}
              </span>
            </label>
            <Button type="submit" disabled={paymentMutation.isPending}>
              {paymentMutation.isPending ? "Processing..." : "Confirm payment"}
            </Button>
          </form>
        ) : null}
        {actionError ? (
          <p role="alert" className="mt-4 text-sm text-[var(--danger)]">
            {actionError}
          </p>
        ) : null}
      </section>
      <section className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--panel)]">
        <div className="border-b border-[var(--border)] p-5">
          <h2 className="text-xl font-semibold">Order items</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Prices and subtotals are returned by the backend.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
              <tr>
                {["Product", "Quantity", "Unit price", "Subtotal"].map(
                  (heading) => (
                    <th
                      key={heading}
                      className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]"
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {order.SalesOrderItem.map((item) => (
                <tr key={item.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-4">
                    <p className="font-semibold">
                      {item.Product?.name ?? item.productId}
                    </p>
                    {item.Product?.sku ? (
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {item.Product.sku}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4">{item.quantity}</td>
                  <td className="px-4 py-4">
                    {formatAmount(item.price, order.currencyCode)}
                  </td>
                  <td className="px-4 py-4 font-medium">
                    {formatAmount(item.subtotal, order.currencyCode)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Link
        href="/app/orders"
        className="inline-flex text-sm font-semibold text-[var(--primary)] hover:underline"
      >
        Back to orders
      </Link>
    </div>
  );
}
