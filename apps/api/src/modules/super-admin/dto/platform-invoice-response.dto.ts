export type PlatformInvoiceResponse = {
  id: string;
  tenantId: string;
  subscriptionId: string | null;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  status: string;
  dueAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  tenant: {
    id: string;
    name: string;
  };
};
