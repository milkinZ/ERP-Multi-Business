export type Surface = "platform" | "erp"
export type NavigationItem = { label: string; href: string }

const platformNavigation: NavigationItem[] = [
  { label: "Dashboard", href: "/platform/dashboard" }, { label: "Tenants", href: "/platform/tenants" }, { label: "Subscriptions", href: "/platform/subscriptions" }, { label: "Billing", href: "/platform/billing" }, { label: "Observability", href: "/platform/observability" }, { label: "Workers", href: "/platform/workers" }, { label: "Jobs", href: "/platform/jobs" }, { label: "Audit logs", href: "/platform/audit-logs" }, { label: "Settings", href: "/platform/settings" },
]
const erpNavigation: NavigationItem[] = [
  { label: "Dashboard", href: "/app/dashboard" }, { label: "Products", href: "/app/products" }, { label: "Orders", href: "/app/orders" }, { label: "Inventory", href: "/app/inventory" }, { label: "Ingredients", href: "/app/ingredients" }, { label: "Recipes", href: "/app/recipes" }, { label: "Kitchen", href: "/app/kitchen" }, { label: "Warehouses", href: "/app/warehouses" }, { label: "Suppliers", href: "/app/suppliers" }, { label: "Purchase orders", href: "/app/purchase-orders" }, { label: "Payments", href: "/app/payments" }, { label: "Billing", href: "/app/billing" }, { label: "Subscriptions", href: "/app/subscriptions" }, { label: "Users", href: "/app/users" }, { label: "Notifications", href: "/app/notifications" }, { label: "Roles", href: "/app/roles" }, { label: "Outlets", href: "/app/outlets" }, { label: "Settings", href: "/app/settings" },
]
export function navigationFor(surface: Surface) { return surface === "platform" ? platformNavigation : erpNavigation }
