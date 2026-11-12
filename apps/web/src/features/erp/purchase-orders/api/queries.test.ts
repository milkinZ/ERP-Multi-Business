import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/api/client";
import {
  cancelPurchaseOrder,
  getPurchaseOrderReturnableReceiptItems,
  getPurchaseOrderReturns,
  purchaseOrderKeys,
  returnPurchaseOrder,
} from "./queries";

vi.mock("@/lib/api/client", () => ({
  apiRequest: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);

describe("purchase order return API", () => {
  beforeEach(() => {
    mockedApiRequest.mockResolvedValue(undefined as never);
  });

  it("sends an idempotency key with the return request", async () => {
    const input = {
      items: [{ purchaseOrderReceiptItemId: "receipt-item-a", quantity: 1 }],
      note: "Damaged packaging",
    };

    await returnPurchaseOrder("token-a", "po/a", "return-key", input);

    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/purchase-orders/po%2Fa/returns",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer token-a",
          "Idempotency-Key": "return-key",
        },
        body: JSON.stringify(input),
      },
    );
  });

  it("requests return history with pagination and tenant-scoped query keys", async () => {
    await getPurchaseOrderReturns("token-a", "po-a", 20, 10);

    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/purchase-orders/po-a/returns?skip=20&take=10",
      {
        headers: {
          Authorization: "Bearer token-a",
        },
      },
    );
    expect(purchaseOrderKeys.returns("tenant-a", "po-a", 20, 10)).toEqual([
      "purchase-orders",
      "tenant-a",
      "po-a",
      "returns",
      { skip: 20, take: 10 },
    ]);
  });

  it("uses the dedicated cancellation endpoint", async () => {
    await cancelPurchaseOrder("token-a", "po-a");

    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/purchase-orders/po-a/cancel",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer token-a",
        },
      },
    );
  });

  it("loads receipt items with current returnable quantities", async () => {
    await getPurchaseOrderReturnableReceiptItems("token-a", "po-a");

    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/purchase-orders/po-a/returnable-receipt-items?skip=0&take=100",
      {
        headers: {
          Authorization: "Bearer token-a",
        },
      },
    );
    expect(
      purchaseOrderKeys.returnableReceiptItems("tenant-a", "po-a"),
    ).toEqual([
      "purchase-orders",
      "tenant-a",
      "po-a",
      "returnable-receipt-items",
    ]);
  });
});
