-- NIE URUCHAMIAĆ w ramach PR ani deployu. Decyzja i uruchomienie: Krzysztof.
-- Ręczny scrub historycznych danych osobowych z checkoutu i alertów w D1 (jewelry-analytics-db).
-- pixel_events.raw_data i customer_events.event_data mają ten sam JSON {event, data, timestamp}
-- (workers/analytics/src/index.ts:1560-1564 i :1718).
-- Checkout: obiekt `checkout` przebudowany z BIAŁEJ LISTY pól (jak allowlistCheckout w TS), w obu kształtach:
--   $.data.data.checkout  (piksel aplikacji: całe zdarzenie Shopify w data)
--   $.data.checkout       (wklejka Customer Events: event.data na wierzchu)
-- alert_displayed: usuwa alert.value. customer_events: formularze tymi samymi ścieżkami co 006
-- (006 objęła tylko pixel_events).
-- Różnica wobec TS: brakujące pola dostają null zamiast zniknąć. Kolejność lineItems wg json_each.
-- Wiersze z niepoprawnym JSON są pomijane (CASE WHEN json_valid ... gwarantuje kolejność oceny).
-- Idempotentne. Nie kasuje wierszy. Time Travel D1 trzyma stan sprzed UPDATE do 30 dni.

UPDATE pixel_events
SET raw_data = json_set(raw_data, '$.data.data.checkout', json_object(
    'token', json_extract(raw_data, '$.data.data.checkout.token'),
    'currencyCode', json_extract(raw_data, '$.data.data.checkout.currencyCode'),
    'totalPrice', json_object('amount', json_extract(raw_data, '$.data.data.checkout.totalPrice.amount'), 'currencyCode', json_extract(raw_data, '$.data.data.checkout.totalPrice.currencyCode')),
    'subtotalPrice', json_object('amount', json_extract(raw_data, '$.data.data.checkout.subtotalPrice.amount'), 'currencyCode', json_extract(raw_data, '$.data.data.checkout.subtotalPrice.currencyCode')),
    'totalTax', json_object('amount', json_extract(raw_data, '$.data.data.checkout.totalTax.amount'), 'currencyCode', json_extract(raw_data, '$.data.data.checkout.totalTax.currencyCode')),
    'discountsAmount', json_object('amount', json_extract(raw_data, '$.data.data.checkout.discountsAmount.amount'), 'currencyCode', json_extract(raw_data, '$.data.data.checkout.discountsAmount.currencyCode')),
    'lineItems', json((SELECT json_group_array(json_object(
        'id', json_extract(value, '$.id'),
        'quantity', json_extract(value, '$.quantity'),
        'title', json_extract(value, '$.title'),
        'finalLinePrice', json_object('amount', json_extract(value, '$.finalLinePrice.amount'), 'currencyCode', json_extract(value, '$.finalLinePrice.currencyCode')),
        'variant', json_object(
          'id', json_extract(value, '$.variant.id'),
          'title', json_extract(value, '$.variant.title'),
          'sku', json_extract(value, '$.variant.sku'),
          'price', json_object('amount', json_extract(value, '$.variant.price.amount'), 'currencyCode', json_extract(value, '$.variant.price.currencyCode')),
          'product', json_object(
            'id', json_extract(value, '$.variant.product.id'),
            'title', json_extract(value, '$.variant.product.title'),
            'type', json_extract(value, '$.variant.product.type'),
            'vendor', json_extract(value, '$.variant.product.vendor'),
            'url', json_extract(value, '$.variant.product.url')))))
      FROM json_each(raw_data, '$.data.data.checkout.lineItems'))),
    'discountApplications', json((SELECT json_group_array(json_object(
        'type', json_extract(value, '$.type'),
        'title', json_extract(value, '$.title'),
        'allocationMethod', json_extract(value, '$.allocationMethod'),
        'targetSelection', json_extract(value, '$.targetSelection'),
        'targetType', json_extract(value, '$.targetType'),
        'value', json_object('amount', json_extract(value, '$.value.amount'), 'currencyCode', json_extract(value, '$.value.currencyCode'), 'percentage', json_extract(value, '$.value.percentage'))))
      FROM json_each(raw_data, '$.data.data.checkout.discountApplications'))),
    'shippingLine', json_object('price', json_object('amount', json_extract(raw_data, '$.data.data.checkout.shippingLine.price.amount'), 'currencyCode', json_extract(raw_data, '$.data.data.checkout.shippingLine.price.currencyCode'))),
    'delivery', json_object('selectedDeliveryOptions', json((SELECT json_group_array(json_object(
        'type', json_extract(value, '$.type'),
        'title', json_extract(value, '$.title'),
        'cost', json_object('amount', json_extract(value, '$.cost.amount'), 'currencyCode', json_extract(value, '$.cost.currencyCode')),
        'costAfterDiscounts', json_object('amount', json_extract(value, '$.costAfterDiscounts.amount'), 'currencyCode', json_extract(value, '$.costAfterDiscounts.currencyCode'))))
      FROM json_each(raw_data, '$.data.data.checkout.delivery.selectedDeliveryOptions')))),
    'localization', json_object(
      'country', json_object('isoCode', json_extract(raw_data, '$.data.data.checkout.localization.country.isoCode')),
      'language', json_object('isoCode', json_extract(raw_data, '$.data.data.checkout.localization.language.isoCode')),
      'market', json_object('id', json_extract(raw_data, '$.data.data.checkout.localization.market.id'), 'handle', json_extract(raw_data, '$.data.data.checkout.localization.market.handle'))),
    'order', json_object('id', json_extract(raw_data, '$.data.data.checkout.order.id'), 'customer', json_object('isFirstOrder', raw_data -> '$.data.data.checkout.order.customer.isFirstOrder')),
    'transactions', json((SELECT json_group_array(json_object(
        'gateway', json_extract(value, '$.gateway'),
        'amount', json_object('amount', json_extract(value, '$.amount.amount'), 'currencyCode', json_extract(value, '$.amount.currencyCode')),
        'paymentMethod', json_object('type', json_extract(value, '$.paymentMethod.type'), 'name', json_extract(value, '$.paymentMethod.name'))))
      FROM json_each(raw_data, '$.data.data.checkout.transactions')))))
WHERE event_type IN ('checkout_started', 'checkout_contact_info_submitted', 'checkout_address_info_submitted', 'checkout_shipping_info_submitted', 'payment_info_submitted', 'checkout_completed')
  AND (CASE WHEN json_valid(raw_data) THEN json_type(raw_data, '$.data.data.checkout') END) = 'object';

UPDATE pixel_events
SET raw_data = json_set(raw_data, '$.data.checkout', json_object(
    'token', json_extract(raw_data, '$.data.checkout.token'),
    'currencyCode', json_extract(raw_data, '$.data.checkout.currencyCode'),
    'totalPrice', json_object('amount', json_extract(raw_data, '$.data.checkout.totalPrice.amount'), 'currencyCode', json_extract(raw_data, '$.data.checkout.totalPrice.currencyCode')),
    'subtotalPrice', json_object('amount', json_extract(raw_data, '$.data.checkout.subtotalPrice.amount'), 'currencyCode', json_extract(raw_data, '$.data.checkout.subtotalPrice.currencyCode')),
    'totalTax', json_object('amount', json_extract(raw_data, '$.data.checkout.totalTax.amount'), 'currencyCode', json_extract(raw_data, '$.data.checkout.totalTax.currencyCode')),
    'discountsAmount', json_object('amount', json_extract(raw_data, '$.data.checkout.discountsAmount.amount'), 'currencyCode', json_extract(raw_data, '$.data.checkout.discountsAmount.currencyCode')),
    'lineItems', json((SELECT json_group_array(json_object(
        'id', json_extract(value, '$.id'),
        'quantity', json_extract(value, '$.quantity'),
        'title', json_extract(value, '$.title'),
        'finalLinePrice', json_object('amount', json_extract(value, '$.finalLinePrice.amount'), 'currencyCode', json_extract(value, '$.finalLinePrice.currencyCode')),
        'variant', json_object(
          'id', json_extract(value, '$.variant.id'),
          'title', json_extract(value, '$.variant.title'),
          'sku', json_extract(value, '$.variant.sku'),
          'price', json_object('amount', json_extract(value, '$.variant.price.amount'), 'currencyCode', json_extract(value, '$.variant.price.currencyCode')),
          'product', json_object(
            'id', json_extract(value, '$.variant.product.id'),
            'title', json_extract(value, '$.variant.product.title'),
            'type', json_extract(value, '$.variant.product.type'),
            'vendor', json_extract(value, '$.variant.product.vendor'),
            'url', json_extract(value, '$.variant.product.url')))))
      FROM json_each(raw_data, '$.data.checkout.lineItems'))),
    'discountApplications', json((SELECT json_group_array(json_object(
        'type', json_extract(value, '$.type'),
        'title', json_extract(value, '$.title'),
        'allocationMethod', json_extract(value, '$.allocationMethod'),
        'targetSelection', json_extract(value, '$.targetSelection'),
        'targetType', json_extract(value, '$.targetType'),
        'value', json_object('amount', json_extract(value, '$.value.amount'), 'currencyCode', json_extract(value, '$.value.currencyCode'), 'percentage', json_extract(value, '$.value.percentage'))))
      FROM json_each(raw_data, '$.data.checkout.discountApplications'))),
    'shippingLine', json_object('price', json_object('amount', json_extract(raw_data, '$.data.checkout.shippingLine.price.amount'), 'currencyCode', json_extract(raw_data, '$.data.checkout.shippingLine.price.currencyCode'))),
    'delivery', json_object('selectedDeliveryOptions', json((SELECT json_group_array(json_object(
        'type', json_extract(value, '$.type'),
        'title', json_extract(value, '$.title'),
        'cost', json_object('amount', json_extract(value, '$.cost.amount'), 'currencyCode', json_extract(value, '$.cost.currencyCode')),
        'costAfterDiscounts', json_object('amount', json_extract(value, '$.costAfterDiscounts.amount'), 'currencyCode', json_extract(value, '$.costAfterDiscounts.currencyCode'))))
      FROM json_each(raw_data, '$.data.checkout.delivery.selectedDeliveryOptions')))),
    'localization', json_object(
      'country', json_object('isoCode', json_extract(raw_data, '$.data.checkout.localization.country.isoCode')),
      'language', json_object('isoCode', json_extract(raw_data, '$.data.checkout.localization.language.isoCode')),
      'market', json_object('id', json_extract(raw_data, '$.data.checkout.localization.market.id'), 'handle', json_extract(raw_data, '$.data.checkout.localization.market.handle'))),
    'order', json_object('id', json_extract(raw_data, '$.data.checkout.order.id'), 'customer', json_object('isFirstOrder', raw_data -> '$.data.checkout.order.customer.isFirstOrder')),
    'transactions', json((SELECT json_group_array(json_object(
        'gateway', json_extract(value, '$.gateway'),
        'amount', json_object('amount', json_extract(value, '$.amount.amount'), 'currencyCode', json_extract(value, '$.amount.currencyCode')),
        'paymentMethod', json_object('type', json_extract(value, '$.paymentMethod.type'), 'name', json_extract(value, '$.paymentMethod.name'))))
      FROM json_each(raw_data, '$.data.checkout.transactions')))))
WHERE event_type IN ('checkout_started', 'checkout_contact_info_submitted', 'checkout_address_info_submitted', 'checkout_shipping_info_submitted', 'payment_info_submitted', 'checkout_completed')
  AND (CASE WHEN json_valid(raw_data) THEN json_type(raw_data, '$.data.checkout') END) = 'object';

UPDATE pixel_events
SET raw_data = json_remove(raw_data, '$.data.data.alert.value', '$.data.alert.value')
WHERE event_type = 'alert_displayed' AND json_valid(raw_data);

UPDATE customer_events
SET event_data = json_set(event_data, '$.data.data.checkout', json_object(
    'token', json_extract(event_data, '$.data.data.checkout.token'),
    'currencyCode', json_extract(event_data, '$.data.data.checkout.currencyCode'),
    'totalPrice', json_object('amount', json_extract(event_data, '$.data.data.checkout.totalPrice.amount'), 'currencyCode', json_extract(event_data, '$.data.data.checkout.totalPrice.currencyCode')),
    'subtotalPrice', json_object('amount', json_extract(event_data, '$.data.data.checkout.subtotalPrice.amount'), 'currencyCode', json_extract(event_data, '$.data.data.checkout.subtotalPrice.currencyCode')),
    'totalTax', json_object('amount', json_extract(event_data, '$.data.data.checkout.totalTax.amount'), 'currencyCode', json_extract(event_data, '$.data.data.checkout.totalTax.currencyCode')),
    'discountsAmount', json_object('amount', json_extract(event_data, '$.data.data.checkout.discountsAmount.amount'), 'currencyCode', json_extract(event_data, '$.data.data.checkout.discountsAmount.currencyCode')),
    'lineItems', json((SELECT json_group_array(json_object(
        'id', json_extract(value, '$.id'),
        'quantity', json_extract(value, '$.quantity'),
        'title', json_extract(value, '$.title'),
        'finalLinePrice', json_object('amount', json_extract(value, '$.finalLinePrice.amount'), 'currencyCode', json_extract(value, '$.finalLinePrice.currencyCode')),
        'variant', json_object(
          'id', json_extract(value, '$.variant.id'),
          'title', json_extract(value, '$.variant.title'),
          'sku', json_extract(value, '$.variant.sku'),
          'price', json_object('amount', json_extract(value, '$.variant.price.amount'), 'currencyCode', json_extract(value, '$.variant.price.currencyCode')),
          'product', json_object(
            'id', json_extract(value, '$.variant.product.id'),
            'title', json_extract(value, '$.variant.product.title'),
            'type', json_extract(value, '$.variant.product.type'),
            'vendor', json_extract(value, '$.variant.product.vendor'),
            'url', json_extract(value, '$.variant.product.url')))))
      FROM json_each(event_data, '$.data.data.checkout.lineItems'))),
    'discountApplications', json((SELECT json_group_array(json_object(
        'type', json_extract(value, '$.type'),
        'title', json_extract(value, '$.title'),
        'allocationMethod', json_extract(value, '$.allocationMethod'),
        'targetSelection', json_extract(value, '$.targetSelection'),
        'targetType', json_extract(value, '$.targetType'),
        'value', json_object('amount', json_extract(value, '$.value.amount'), 'currencyCode', json_extract(value, '$.value.currencyCode'), 'percentage', json_extract(value, '$.value.percentage'))))
      FROM json_each(event_data, '$.data.data.checkout.discountApplications'))),
    'shippingLine', json_object('price', json_object('amount', json_extract(event_data, '$.data.data.checkout.shippingLine.price.amount'), 'currencyCode', json_extract(event_data, '$.data.data.checkout.shippingLine.price.currencyCode'))),
    'delivery', json_object('selectedDeliveryOptions', json((SELECT json_group_array(json_object(
        'type', json_extract(value, '$.type'),
        'title', json_extract(value, '$.title'),
        'cost', json_object('amount', json_extract(value, '$.cost.amount'), 'currencyCode', json_extract(value, '$.cost.currencyCode')),
        'costAfterDiscounts', json_object('amount', json_extract(value, '$.costAfterDiscounts.amount'), 'currencyCode', json_extract(value, '$.costAfterDiscounts.currencyCode'))))
      FROM json_each(event_data, '$.data.data.checkout.delivery.selectedDeliveryOptions')))),
    'localization', json_object(
      'country', json_object('isoCode', json_extract(event_data, '$.data.data.checkout.localization.country.isoCode')),
      'language', json_object('isoCode', json_extract(event_data, '$.data.data.checkout.localization.language.isoCode')),
      'market', json_object('id', json_extract(event_data, '$.data.data.checkout.localization.market.id'), 'handle', json_extract(event_data, '$.data.data.checkout.localization.market.handle'))),
    'order', json_object('id', json_extract(event_data, '$.data.data.checkout.order.id'), 'customer', json_object('isFirstOrder', event_data -> '$.data.data.checkout.order.customer.isFirstOrder')),
    'transactions', json((SELECT json_group_array(json_object(
        'gateway', json_extract(value, '$.gateway'),
        'amount', json_object('amount', json_extract(value, '$.amount.amount'), 'currencyCode', json_extract(value, '$.amount.currencyCode')),
        'paymentMethod', json_object('type', json_extract(value, '$.paymentMethod.type'), 'name', json_extract(value, '$.paymentMethod.name'))))
      FROM json_each(event_data, '$.data.data.checkout.transactions')))))
WHERE event_type IN ('checkout_started', 'checkout_contact_info_submitted', 'checkout_address_info_submitted', 'checkout_shipping_info_submitted', 'payment_info_submitted', 'checkout_completed')
  AND (CASE WHEN json_valid(event_data) THEN json_type(event_data, '$.data.data.checkout') END) = 'object';

UPDATE customer_events
SET event_data = json_set(event_data, '$.data.checkout', json_object(
    'token', json_extract(event_data, '$.data.checkout.token'),
    'currencyCode', json_extract(event_data, '$.data.checkout.currencyCode'),
    'totalPrice', json_object('amount', json_extract(event_data, '$.data.checkout.totalPrice.amount'), 'currencyCode', json_extract(event_data, '$.data.checkout.totalPrice.currencyCode')),
    'subtotalPrice', json_object('amount', json_extract(event_data, '$.data.checkout.subtotalPrice.amount'), 'currencyCode', json_extract(event_data, '$.data.checkout.subtotalPrice.currencyCode')),
    'totalTax', json_object('amount', json_extract(event_data, '$.data.checkout.totalTax.amount'), 'currencyCode', json_extract(event_data, '$.data.checkout.totalTax.currencyCode')),
    'discountsAmount', json_object('amount', json_extract(event_data, '$.data.checkout.discountsAmount.amount'), 'currencyCode', json_extract(event_data, '$.data.checkout.discountsAmount.currencyCode')),
    'lineItems', json((SELECT json_group_array(json_object(
        'id', json_extract(value, '$.id'),
        'quantity', json_extract(value, '$.quantity'),
        'title', json_extract(value, '$.title'),
        'finalLinePrice', json_object('amount', json_extract(value, '$.finalLinePrice.amount'), 'currencyCode', json_extract(value, '$.finalLinePrice.currencyCode')),
        'variant', json_object(
          'id', json_extract(value, '$.variant.id'),
          'title', json_extract(value, '$.variant.title'),
          'sku', json_extract(value, '$.variant.sku'),
          'price', json_object('amount', json_extract(value, '$.variant.price.amount'), 'currencyCode', json_extract(value, '$.variant.price.currencyCode')),
          'product', json_object(
            'id', json_extract(value, '$.variant.product.id'),
            'title', json_extract(value, '$.variant.product.title'),
            'type', json_extract(value, '$.variant.product.type'),
            'vendor', json_extract(value, '$.variant.product.vendor'),
            'url', json_extract(value, '$.variant.product.url')))))
      FROM json_each(event_data, '$.data.checkout.lineItems'))),
    'discountApplications', json((SELECT json_group_array(json_object(
        'type', json_extract(value, '$.type'),
        'title', json_extract(value, '$.title'),
        'allocationMethod', json_extract(value, '$.allocationMethod'),
        'targetSelection', json_extract(value, '$.targetSelection'),
        'targetType', json_extract(value, '$.targetType'),
        'value', json_object('amount', json_extract(value, '$.value.amount'), 'currencyCode', json_extract(value, '$.value.currencyCode'), 'percentage', json_extract(value, '$.value.percentage'))))
      FROM json_each(event_data, '$.data.checkout.discountApplications'))),
    'shippingLine', json_object('price', json_object('amount', json_extract(event_data, '$.data.checkout.shippingLine.price.amount'), 'currencyCode', json_extract(event_data, '$.data.checkout.shippingLine.price.currencyCode'))),
    'delivery', json_object('selectedDeliveryOptions', json((SELECT json_group_array(json_object(
        'type', json_extract(value, '$.type'),
        'title', json_extract(value, '$.title'),
        'cost', json_object('amount', json_extract(value, '$.cost.amount'), 'currencyCode', json_extract(value, '$.cost.currencyCode')),
        'costAfterDiscounts', json_object('amount', json_extract(value, '$.costAfterDiscounts.amount'), 'currencyCode', json_extract(value, '$.costAfterDiscounts.currencyCode'))))
      FROM json_each(event_data, '$.data.checkout.delivery.selectedDeliveryOptions')))),
    'localization', json_object(
      'country', json_object('isoCode', json_extract(event_data, '$.data.checkout.localization.country.isoCode')),
      'language', json_object('isoCode', json_extract(event_data, '$.data.checkout.localization.language.isoCode')),
      'market', json_object('id', json_extract(event_data, '$.data.checkout.localization.market.id'), 'handle', json_extract(event_data, '$.data.checkout.localization.market.handle'))),
    'order', json_object('id', json_extract(event_data, '$.data.checkout.order.id'), 'customer', json_object('isFirstOrder', event_data -> '$.data.checkout.order.customer.isFirstOrder')),
    'transactions', json((SELECT json_group_array(json_object(
        'gateway', json_extract(value, '$.gateway'),
        'amount', json_object('amount', json_extract(value, '$.amount.amount'), 'currencyCode', json_extract(value, '$.amount.currencyCode')),
        'paymentMethod', json_object('type', json_extract(value, '$.paymentMethod.type'), 'name', json_extract(value, '$.paymentMethod.name'))))
      FROM json_each(event_data, '$.data.checkout.transactions')))))
WHERE event_type IN ('checkout_started', 'checkout_contact_info_submitted', 'checkout_address_info_submitted', 'checkout_shipping_info_submitted', 'payment_info_submitted', 'checkout_completed')
  AND (CASE WHEN json_valid(event_data) THEN json_type(event_data, '$.data.checkout') END) = 'object';

UPDATE customer_events
SET event_data = json_remove(event_data, '$.data.data.alert.value', '$.data.alert.value')
WHERE event_type = 'alert_displayed' AND json_valid(event_data);

UPDATE customer_events
SET event_data = json_remove(event_data,
  '$.data.element.value', '$.data.data.element.value',
  '$.data.element.elements', '$.data.data.element.elements',
  '$.data.input.value', '$.data.form')
WHERE event_type IN ('form_submitted', 'input_focused', 'input_blurred', 'input_changed')
  AND json_valid(event_data);
