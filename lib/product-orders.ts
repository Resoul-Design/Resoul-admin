export type ProductLineItem = {
  title: string;
  quantity: number;
};

export type ProductOrderRow = {
  shopify_order_id: string;
  order_name: string;
  shopify_created_at: string;
  shopify_updated_at: string | null;
  customer_name: string | null;
  email: string | null;
  phone: string | null;
  phone_key: string | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  total_amount: number;
  currency: string;
  line_items: ProductLineItem[];
  cancelled_at: string | null;
  synced_at: string;
};

type Attribute = { key?: string; name?: string; value?: string };

export type ShopifyWebhookOrder = {
  id?: number | string;
  admin_graphql_api_id?: string;
  name?: string;
  order_number?: number;
  created_at?: string;
  updated_at?: string;
  cancelled_at?: string | null;
  email?: string | null;
  contact_email?: string | null;
  phone?: string | null;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  current_total_price?: string;
  total_price?: string;
  currency?: string;
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    default_address?: { phone?: string | null } | null;
  } | null;
  billing_address?: { phone?: string | null } | null;
  shipping_address?: { phone?: string | null } | null;
  note_attributes?: Attribute[];
  line_items?: {
    title?: string;
    name?: string;
    quantity?: number;
    properties?: Attribute[];
  }[];
};

export type ShopifyGraphQLOrder = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  email: string | null;
  phone: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  customAttributes: { key: string; value: string }[];
  customer: {
    displayName: string | null;
    defaultEmailAddress: { emailAddress: string } | null;
    defaultPhoneNumber: { phoneNumber: string } | null;
    defaultAddress: { phone: string | null } | null;
  } | null;
  shippingAddress: { phone: string | null } | null;
  billingAddress: { phone: string | null } | null;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  lineItems: { edges: { node: { title: string; quantity: number } }[] };
};

export const phoneKey = (value?: string | null) =>
  (value || "").replace(/\D/g, "").slice(-8);

function firstPhone(values: (string | null | undefined)[]) {
  return values.find((value) => phoneKey(value)) || null;
}

function hasPaymentRef(attributes: Attribute[] = []) {
  return attributes.some((attribute) => {
    const key = String(attribute.key || attribute.name || "").trim().toLowerCase();
    return key === "payment_ref" && Boolean(String(attribute.value || "").trim());
  });
}

export function isCremationWebhookOrder(order: ShopifyWebhookOrder) {
  return hasPaymentRef([
    ...(order.note_attributes || []),
    ...((order.line_items || []).flatMap((item) => item.properties || [])),
  ]);
}

export function productOrderFromWebhook(order: ShopifyWebhookOrder): ProductOrderRow {
  const id = order.admin_graphql_api_id || (order.id ? `gid://shopify/Order/${order.id}` : "");
  const phone = firstPhone([
    order.phone,
    order.customer?.phone,
    order.shipping_address?.phone,
    order.billing_address?.phone,
    order.customer?.default_address?.phone,
  ]);
  const customerName = [order.customer?.first_name, order.customer?.last_name]
    .filter(Boolean)
    .join(" ") || null;

  return {
    shopify_order_id: id,
    order_name: order.name || (order.order_number ? `#${order.order_number}` : id),
    shopify_created_at: order.created_at || new Date().toISOString(),
    shopify_updated_at: order.updated_at || null,
    customer_name: customerName,
    email: order.email || order.contact_email || order.customer?.email || null,
    phone,
    phone_key: phoneKey(phone) || null,
    financial_status: order.financial_status?.toUpperCase() || null,
    fulfillment_status: order.fulfillment_status?.toUpperCase() || "UNFULFILLED",
    total_amount: Number(order.current_total_price || order.total_price || 0),
    currency: order.currency || "HKD",
    line_items: (order.line_items || []).map((item) => ({
      title: item.title || item.name || "產品",
      quantity: Number(item.quantity || 0),
    })),
    cancelled_at: order.cancelled_at || null,
    synced_at: new Date().toISOString(),
  };
}

export function isCremationGraphQLOrder(order: ShopifyGraphQLOrder) {
  return hasPaymentRef(order.customAttributes || []);
}

export function productOrderFromGraphQL(order: ShopifyGraphQLOrder): ProductOrderRow {
  const phone = firstPhone([
    order.phone,
    order.customer?.defaultPhoneNumber?.phoneNumber,
    order.shippingAddress?.phone,
    order.billingAddress?.phone,
    order.customer?.defaultAddress?.phone,
  ]);

  return {
    shopify_order_id: order.id,
    order_name: order.name,
    shopify_created_at: order.createdAt,
    shopify_updated_at: order.updatedAt,
    customer_name: order.customer?.displayName || null,
    email: order.email || order.customer?.defaultEmailAddress?.emailAddress || null,
    phone,
    phone_key: phoneKey(phone) || null,
    financial_status: order.displayFinancialStatus,
    fulfillment_status: order.displayFulfillmentStatus,
    total_amount: Number(order.totalPriceSet.shopMoney.amount),
    currency: order.totalPriceSet.shopMoney.currencyCode,
    line_items: order.lineItems.edges.map(({ node }) => ({
      title: node.title,
      quantity: node.quantity,
    })),
    cancelled_at: order.cancelledAt,
    synced_at: new Date().toISOString(),
  };
}
