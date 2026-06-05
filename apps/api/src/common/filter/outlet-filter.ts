export function buildOutletFilter(user: { outletId?: string | null }) {
  if (!user.outletId) {
    return {};
  }

  return {
    outletId: user.outletId,
  };
}
