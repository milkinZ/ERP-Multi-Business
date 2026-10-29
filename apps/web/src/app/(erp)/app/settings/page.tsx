import React from "react";
import { PageHeader } from "@/components/data-display/states";
import { TenantCurrencySettings } from "@/features/erp/settings/components/tenant-currency-settings";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tenant configuration"
        title="Settings"
        description="Manage tenant-wide financial configuration."
      />
      <TenantCurrencySettings />
    </div>
  );
}
