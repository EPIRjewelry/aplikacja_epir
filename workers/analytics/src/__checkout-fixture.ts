/** Kształt wg shopify.dev standard-events/checkout_completed (Checkout). Wartości fikcyjne, oznaczone PII_. */
export const PII = ['pii-buyer@example.com', '+48500000001', '+48500000002', '+48500000003', 'PII_First', 'PII_Last', 'PII_Street 1', 'PII_Apt 2', 'PII_City', '00-001', 'PII_ENGRAVE', 'PII_ATTR', 'PII_ALERT_VALUE', 'PII_PICKUP_DESC', 'gid://shopify/Customer/999'];
const address = { address1: 'PII_Street 1', address2: 'PII_Apt 2', city: 'PII_City', country: 'Poland', countryCode: 'PL', firstName: 'PII_First', lastName: 'PII_Last', phone: '+48500000002', province: null, provinceCode: null, zip: '00-001' };
export function checkoutFixture() {
  return {
    attributes: [{ key: 'note', value: 'PII_ATTR' }],
    billingAddress: { ...address },
    buyerAcceptsEmailMarketing: true,
    buyerAcceptsSmsMarketing: false,
    currencyCode: 'PLN',
    delivery: { selectedDeliveryOptions: [{ type: 'shipping', title: 'Kurier', handle: 'h1', description: 'PII_PICKUP_DESC', cost: { amount: 15, currencyCode: 'PLN' }, costAfterDiscounts: { amount: 15, currencyCode: 'PLN' }, targetLineItems: ['li1'] }] },
    discountApplications: [{ type: 'DISCOUNT_CODE', title: 'WIOSNA10', allocationMethod: 'ACROSS', targetSelection: 'ALL', targetType: 'LINE_ITEM', value: { percentage: 10 } }],
    discountsAmount: { amount: 10, currencyCode: 'PLN' },
    email: 'pii-buyer@example.com',
    lineItems: [{ id: 'li1', quantity: 1, title: 'Pierścionek Soliter', finalLinePrice: { amount: 100, currencyCode: 'PLN' }, properties: [{ key: 'Grawer', value: 'PII_ENGRAVE' }], discountAllocations: [], sellingPlanAllocation: null,
      variant: { id: 'gid://shopify/ProductVariant/1', title: '14', sku: 'SKU1', untranslatedTitle: '14', image: { src: 'https://cdn.example/x.jpg' }, price: { amount: 110, currencyCode: 'PLN' },
        product: { id: 'gid://shopify/Product/1', title: 'Pierścionek Soliter', type: 'Pierścionek', vendor: 'EPIR', url: '/products/soliter', untranslatedTitle: 'x' } } }],
    localization: { country: { isoCode: 'PL' }, language: { isoCode: 'pl-PL' }, market: { id: 'gid://shopify/Market/1', handle: 'pl' } },
    order: { id: 'gid://shopify/Order/1904', customer: { id: 'gid://shopify/Customer/999', isFirstOrder: true } },
    phone: '+48500000001',
    shippingAddress: { ...address },
    shippingLine: { price: { amount: 15, currencyCode: 'PLN' } },
    smsMarketingPhone: '+48500000003',
    subtotalPrice: { amount: 100, currencyCode: 'PLN' },
    token: 'chk-token-1',
    totalPrice: { amount: 115, currencyCode: 'PLN' },
    totalTax: { amount: 21.5, currencyCode: 'PLN' },
    transactions: [{ gateway: 'shopify_payments', amount: { amount: 115, currencyCode: 'PLN' }, paymentMethod: { type: 'local', name: 'BLIK' } }],
  };
}
