/* Maps Tienda Nube order/customer/item payloads into our enriched local columns. */

/* eslint-disable @typescript-eslint/no-explicit-any */

function num(v: unknown): number | null {
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}
function date(v: any): Date | null {
  if (!v) return null;
  // TN sometimes wraps dates as { date, timezone_type, timezone } instead of an ISO string.
  const s = typeof v === "object" && v.date ? v.date : v;
  const d = new Date(String(s));
  return isNaN(d.getTime()) ? null : d;
}
function fmtAddr(a: any): string | null {
  if (!a || typeof a !== "object") return null;
  const parts = [a.address, a.number, a.floor, a.locality, a.city, a.province, a.zipcode, a.country]
    .map((x) => (x == null ? "" : String(x).trim()))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function mapOrderFields(o: any) {
  return {
    subtotal: num(o.subtotal),
    discount: num(o.discount),
    shippingCost: num(o.shipping_cost_customer),
    totalPaid: num(o.total_paid),
    currency: o.currency || null,
    paymentMethod: o.gateway_name || o.gateway || null,
    shippingStatus: o.shipping_status || null,
    shippingMethod: o.shipping_option || null,
    shippingType: o.shipping_pickup_type || null,
    trackingNumber: o.shipping_tracking_number || null,
    trackingUrl: o.shipping_tracking_url || null,
    shippingCarrier: o.shipping_carrier_name || null,
    shippingAddress: fmtAddr(o.shipping_address),
    paidAt: date(o.paid_at),
    shippedAt: date(o.shipped_at),
    completedAt: date(o.completed_at),
    cancelledAt: date(o.cancelled_at),
    closedAt: date(o.closed_at),
    customerNote: o.note || null,
    ownerNote: o.owner_note || null,
    channel: o.order_origin || o.storefront || null,
    rawData: JSON.stringify(o),
  };
}

export function mapCustomerFields(c: any) {
  return {
    identification: c.identification || null,
    customerType: c.customer_type || null,
    businessName: c.business_name || null,
    city: c.default_address?.city || c.billing_city || null,
    province: c.default_address?.province || c.billing_province || null,
    totalSpentTn: num(c.total_spent),
    acceptsMarketing: typeof c.accepts_marketing === "boolean" ? c.accepts_marketing : null,
    firstOrderAt: date(c.created_at),
    rawData: JSON.stringify(c),
  };
}

export function mapItemFields(p: any) {
  const variantName = Array.isArray(p.variant_values) && p.variant_values.length
    ? p.variant_values.join(" / ")
    : p.variant_name || null;
  return {
    variantName,
    sku: p.sku || null,
    imageUrl: p.image?.src || p.image || null,
  };
}
