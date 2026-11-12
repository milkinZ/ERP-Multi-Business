export type Surface = "platform" | "erp";
export type NavigationItem = {
  label: string;
  href: string;
  permission?: string;
  featureModule?: string;
};

const platformNavigation: NavigationItem[] = [
  { label: "Dashboard", href: "/platform/dashboard" },
  { label: "Tenants", href: "/platform/tenants" },
  {
    label: "Plans & modules",
    href: "/platform/plans",
    permission: "super-admin.read",
  },
  { label: "Subscriptions", href: "/platform/subscriptions" },
  { label: "Billing", href: "/platform/billing" },
  { label: "Observability", href: "/platform/observability" },
  { label: "Workers", href: "/platform/workers" },
  { label: "Jobs", href: "/platform/jobs" },
  { label: "Audit logs", href: "/platform/audit-logs" },
  { label: "Settings", href: "/platform/settings" },
];
const erpNavigation: NavigationItem[] = [
  { label: "Dashboard", href: "/app/dashboard" },
  { label: "Products", href: "/app/products" },
  { label: "Orders", href: "/app/orders" },
  { label: "Inventory", href: "/app/inventory", featureModule: "INVENTORY" },
  {
    label: "Ingredients",
    href: "/app/ingredients",
    featureModule: "INVENTORY",
  },
  { label: "Recipes", href: "/app/recipes", featureModule: "INVENTORY" },
  { label: "Kitchen", href: "/app/kitchen" },
  { label: "Warehouses", href: "/app/warehouses", featureModule: "INVENTORY" },
  { label: "Suppliers", href: "/app/suppliers", featureModule: "PROCUREMENT" },
  {
    label: "Purchase orders",
    href: "/app/purchase-orders",
    featureModule: "PROCUREMENT",
  },
  {
    label: "Finance",
    href: "/app/finance",
    permission: "finance.read",
    featureModule: "FINANCE",
  },
  { label: "Payments", href: "/app/payments" },
  { label: "Billing", href: "/app/billing" },
  { label: "Subscriptions", href: "/app/subscriptions" },
  { label: "Users", href: "/app/users" },
  { label: "Notifications", href: "/app/notifications" },
  {
    label: "Audit logs",
    href: "/app/audit-logs",
    permission: "audit-log.read",
  },
  { label: "Roles", href: "/app/roles" },
  { label: "Outlets", href: "/app/outlets" },
  { label: "Settings", href: "/app/settings" },
];
export function navigationFor(
  surface: Surface,
  featureModules?: readonly string[],
) {
  const items = surface === "platform" ? platformNavigation : erpNavigation;
  if (surface === "platform" || featureModules === undefined) return items;
  const entitledModules = new Set(featureModules);
  return items.filter(
    (item) => !item.featureModule || entitledModules.has(item.featureModule),
  );
}
