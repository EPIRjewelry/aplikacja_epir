import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Capture register() callback using vi.hoisted (avoids TDZ in mock factory)
// ============================================================================
const mockState = vi.hoisted(() => ({
    registeredCallback: null as ((api: MockWebPixelAPI) => Promise<void>) | null,
}));

vi.mock('@shopify/web-pixels-extension', () => ({
    register: vi.fn((callback: (api: MockWebPixelAPI) => Promise<void>) => {
        mockState.registeredCallback = callback;
    }),
}));

// ============================================================================
// Type definitions for mock API
// ============================================================================
interface MockWebPixelAPI {
    analytics: {
        subscribe: ReturnType<typeof vi.fn>;
    };
    browser: {
        cookie?: {
            get: ReturnType<typeof vi.fn>;
            set?: ReturnType<typeof vi.fn>;
        };
        sessionStorage: {
            getItem: ReturnType<typeof vi.fn>;
            setItem: ReturnType<typeof vi.fn>;
        };
    };
    init: {
        data?: {
            customer?: {
                id: string;
            } | null;
            customerPrivacy?: {
                analyticsProcessingAllowed?: boolean;
            };
        };
        context?: Record<string, unknown>;
        clientId?: string;
        customerPrivacy?: {
            analyticsProcessingAllowed?: boolean;
        };
    };
    customerPrivacy?: {
        analyticsProcessingAllowed?: boolean;
    };
    settings: {
        pixelEndpoint?: string;
        accountID?: string;
    };
}

// ============================================================================
// Import index.ts to trigger register() call
// ============================================================================
import './index';
import { PII, checkoutFixture } from './__checkout-fixture';

/** Mock Web Pixel event: jawna zgoda analytics na evencie (zgodnie z modelem Shopify). */
function withAnalyticsConsent(eventLike: Record<string, unknown> = {}): Record<string, unknown> {
    const prevCtx =
        eventLike.context && typeof eventLike.context === 'object' && eventLike.context !== null
            ? {...(eventLike.context as Record<string, unknown>)}
            : {};
    return {
        ...eventLike,
        context: {
            ...prevCtx,
            customerPrivacy: {analyticsProcessingAllowed: true},
        },
    };
}

// ============================================================================
// Helper: invoke registered callback with given mock API
// ============================================================================
async function invokePixelCallback(overrides: Partial<MockWebPixelAPI> = {}): Promise<{
    subscriptions: Map<string, (event: unknown) => void>;
    api: MockWebPixelAPI;
}> {
    const subscriptions = new Map<string, (event: unknown) => void>();

    const mergedInit: MockWebPixelAPI['init'] = {
        data: {customer: null},
        clientId: 'test-session-id',
        ...(overrides.init ?? {}),
    };

    const api: MockWebPixelAPI = {
        analytics: {
            subscribe: vi.fn((eventName: string, handler: (event: unknown) => void) => {
                subscriptions.set(eventName, handler);
            }),
        },
        init: mergedInit,
        settings:
            overrides.settings !== undefined
                ? {...overrides.settings}
                : {pixelEndpoint: 'https://test-pixel.example.com'},
        browser: {
            cookie: {
                get: vi.fn().mockResolvedValue('test-session-id'),
                set: vi.fn().mockResolvedValue(undefined),
            },
            sessionStorage: {
                getItem: vi.fn().mockResolvedValue(null),
                setItem: vi.fn().mockResolvedValue(undefined),
            },
            ...overrides.browser,
        },
        customerPrivacy: overrides.customerPrivacy,
    };

    if (mockState.registeredCallback) {
        await mockState.registeredCallback(api);
    }

    return {subscriptions, api};
}

// ============================================================================
// Tests
// ============================================================================
describe('web-pixel extension – identity resolution (clientId only)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ ok: true, activate_chat: false }),
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('uses event clientId as pixel session_id (ignores _epir / _shopify_y / chat storage)', async () => {
        const set = vi.fn().mockResolvedValue(undefined);
        const { subscriptions, api } = await invokePixelCallback({
            browser: {
                cookie: {
                    get: vi.fn().mockImplementation((name: string) =>
                        Promise.resolve(
                            name === '_epir_session_id'
                                ? 'epir-cookie'
                                : name === '_shopify_y'
                                  ? 'y-cookie'
                                  : null,
                        ),
                    ),
                    set,
                },
                sessionStorage: {
                    getItem: vi.fn().mockResolvedValue('sess_chat-should-not-be-session-id'),
                    setItem: vi.fn(),
                },
            },
        });

        const handler = subscriptions.get('page_viewed');
        await handler!(withAnalyticsConsent({ clientId: 'shopify-client-abc' }));

        const bodies = (fetch as ReturnType<typeof vi.fn>).mock.calls.map((call) =>
            JSON.parse(call[1].body),
        );
        const pageView = bodies.find((b) => b.type === 'page_viewed');
        expect(pageView.data.session_id).toBe('shopify-client-abc');
        expect(pageView.data.sessionId).toBe('shopify-client-abc');
        expect(set).not.toHaveBeenCalled();
        expect(api.browser.cookie?.get).not.toHaveBeenCalledWith('_shopify_y');
    });

    it('falls back to init.clientId when event clientId is missing', async () => {
        const { subscriptions } = await invokePixelCallback({
            init: { clientId: 'init-shopify-client-abc' },
            browser: {
                cookie: { get: vi.fn().mockResolvedValue(null) },
                sessionStorage: {
                    getItem: vi.fn().mockResolvedValue(null),
                    setItem: vi.fn(),
                },
            },
        });

        const handler = subscriptions.get('page_viewed');
        await handler!(withAnalyticsConsent({}));

        const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
        expect(body.data.sessionId).toBe('init-shopify-client-abc');
    });

    it('does not POST when clientId sources are absent', async () => {
        const { subscriptions } = await invokePixelCallback({
            init: {clientId: '', data: {customer: null}},
            browser: {
                cookie: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
                sessionStorage: {
                    getItem: vi.fn().mockResolvedValue('sess_orphan'),
                    setItem: vi.fn().mockResolvedValue(undefined),
                },
            },
        });

        const handler = subscriptions.get('page_viewed');
        await handler!(withAnalyticsConsent({}));

        expect(fetch).not.toHaveBeenCalled();
    });

    it('reuses remembered clientId when the next event omits clientId', async () => {
        const { subscriptions } = await invokePixelCallback({
            init: {clientId: '', data: {customer: null}},
            browser: {
                cookie: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
                sessionStorage: {
                    getItem: vi.fn().mockResolvedValue(null),
                    setItem: vi.fn().mockResolvedValue(undefined),
                },
            },
        });

        const handler = subscriptions.get('page_viewed');
        await handler!(withAnalyticsConsent({ clientId: 'stable-client' }));
        await handler!(withAnalyticsConsent({}));

        const pageViews = (fetch as ReturnType<typeof vi.fn>).mock.calls
            .map((call) => JSON.parse(call[1].body))
            .filter((b) => b.type === 'page_viewed');
        expect(pageViews).toHaveLength(2);
        expect(pageViews[0].data.session_id).toBe('stable-client');
        expect(pageViews[1].data.session_id).toBe('stable-client');
    });

    it('emits one chat_session_linked when consent and sess_* in sessionStorage', async () => {
        const getItem = vi.fn().mockImplementation((key: string) =>
            Promise.resolve(key === 'epir-assistant-session' ? 'sess_link-me-0001' : null),
        );
        const { subscriptions } = await invokePixelCallback({
            browser: {
                cookie: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
                sessionStorage: { getItem, setItem: vi.fn() },
            },
        });

        const handler = subscriptions.get('page_viewed');
        await handler!(withAnalyticsConsent({ clientId: 'pixel-client-1' }));
        await handler!(withAnalyticsConsent({ clientId: 'pixel-client-1' }));

        const linked = (fetch as ReturnType<typeof vi.fn>).mock.calls
            .map((call) => JSON.parse(call[1].body))
            .filter((b) => b.type === 'chat_session_linked');
        expect(linked).toHaveLength(1);
        expect(linked[0].data).toMatchObject({
            chat_session_id: 'sess_link-me-0001',
            client_id: 'pixel-client-1',
            session_id: 'pixel-client-1',
        });
        expect(getItem).toHaveBeenCalledWith('epir-assistant-session');
    });

    it('does not emit chat_session_linked without analytics consent', async () => {
        const getItem = vi.fn().mockResolvedValue('sess_link-me-0001');
        const { subscriptions } = await invokePixelCallback({
            init: { customerPrivacy: { analyticsProcessingAllowed: false } },
            browser: {
                cookie: { get: vi.fn().mockResolvedValue(null) },
                sessionStorage: { getItem, setItem: vi.fn() },
            },
        });

        const handler = subscriptions.get('page_viewed');
        await handler!({ clientId: 'pixel-client-1' });

        expect(fetch).not.toHaveBeenCalled();
        expect(getItem).not.toHaveBeenCalled();
    });

    it('does not emit chat_session_linked for invalid sessionStorage', async () => {
        const { subscriptions } = await invokePixelCallback({
            browser: {
                cookie: { get: vi.fn().mockResolvedValue(null) },
                sessionStorage: {
                    getItem: vi.fn().mockResolvedValue('not-a-sess-id'),
                    setItem: vi.fn(),
                },
            },
        });

        const handler = subscriptions.get('page_viewed');
        await handler!(withAnalyticsConsent({ clientId: 'pixel-client-1' }));

        const linked = (fetch as ReturnType<typeof vi.fn>).mock.calls
            .map((call) => JSON.parse(call[1].body))
            .filter((b) => b.type === 'chat_session_linked');
        expect(linked).toHaveLength(0);
    });
});

describe('web-pixel extension – customer identification', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ ok: true, activate_chat: false }),
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('extracts customer ID from init data when logged in', async () => {
        const { subscriptions } = await invokePixelCallback({
            init: { data: { customer: { id: 'gid://shopify/Customer/12345' } } },
        });

        const handler = subscriptions.get('page_viewed');
        expect(handler).toBeDefined();
        await handler!(withAnalyticsConsent({}));

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.data.customerId).toBe('gid://shopify/Customer/12345');
    });

    it('uses null customer ID for anonymous visitors', async () => {
        const { subscriptions } = await invokePixelCallback({
            init: { data: { customer: null } },
        });

        const handler = subscriptions.get('page_viewed');
        expect(handler).toBeDefined();
        await handler!(withAnalyticsConsent({}));

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.data.customerId).toBeNull();
    });

    it('handles missing init.data gracefully', async () => {
        const { subscriptions } = await invokePixelCallback({
            init: {},
        });

        const handler = subscriptions.get('page_viewed');
        await handler!(withAnalyticsConsent({}));

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.data.customerId).toBeNull();
    });
});

describe('web-pixel extension – pixel endpoint construction', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ ok: true, activate_chat: false }),
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('uses pixelEndpoint from settings', async () => {
        const { subscriptions } = await invokePixelCallback({
            settings: { pixelEndpoint: 'https://custom-endpoint.example.com' },
        });

        const handler = subscriptions.get('page_viewed');
        await handler!(withAnalyticsConsent({}));

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(fetchCall[0]).toBe('https://custom-endpoint.example.com/pixel');
    });

    it('strips trailing slash from pixelEndpoint', async () => {
        const { subscriptions } = await invokePixelCallback({
            settings: { pixelEndpoint: 'https://custom-endpoint.example.com/' },
        });

        const handler = subscriptions.get('page_viewed');
        await handler!(withAnalyticsConsent({}));

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(fetchCall[0]).toBe('https://custom-endpoint.example.com/pixel');
    });

    it('uses default endpoint when settings.pixelEndpoint is not set', async () => {
        const { subscriptions } = await invokePixelCallback({
            settings: {},
        });

        const handler = subscriptions.get('page_viewed');
        await handler!(withAnalyticsConsent({}));

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(fetchCall[0]).toBe('https://asystent.epirbizuteria.pl/pixel');
    });
});

describe('web-pixel extension – event payload structure', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ ok: true, activate_chat: false }),
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('sends correct POST payload for page_viewed event', async () => {
        const mockEvent = withAnalyticsConsent({
            clientId: 'session-abc',
            context: {document: {url: 'https://shop.example.com/home'}},
        });
        const { subscriptions } = await invokePixelCallback({
            init: { data: { customer: { id: 'cust-123' } } },
        });

        const handler = subscriptions.get('page_viewed');
        await handler!(mockEvent);

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(fetchCall[1].method).toBe('POST');
        expect(fetchCall[1].headers['Content-Type']).toBe('application/json');

        const body = JSON.parse(fetchCall[1].body);
        expect(body.type).toBe('page_viewed');
        expect(body.data).toMatchObject({
            customerId: 'cust-123',
            sessionId: 'session-abc',
            session_id: 'session-abc',
            pixel_sender: 'web_pixel_extension',
            context: expect.objectContaining({
                document: {url: 'https://shop.example.com/home'},
                customerPrivacy: {analyticsProcessingAllowed: true},
            }),
        });
    });

    it('enriches product_viewed with product_handle and epir-liquid storefront on apex', async () => {
        const { subscriptions } = await invokePixelCallback({
            init: {
                context: {
                    document: {
                        location: { href: 'https://epirbizuteria.pl/products/pierscionek-test' },
                    },
                },
            },
        });

        const handler = subscriptions.get('product_viewed');
        await handler!(
            withAnalyticsConsent({
                context: {
                    document: {
                        location: { href: 'https://epirbizuteria.pl/products/pierscionek-test' },
                    },
                    customerPrivacy: { analyticsProcessingAllowed: true },
                },
                productVariant: {
                    id: 'var-1',
                    product: {
                        id: 'prod-1',
                        title: 'Ring',
                        handle: 'pierscionek-test',
                    },
                },
            }),
        );

        const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
        expect(body.data.product_handle).toBe('pierscionek-test');
        expect(body.data.storefront_id).toBe('epir-liquid');
        expect(body.data.channel).toBe('online-store');
    });

    it('derives product_handle from product.url when Shopify omits handle', async () => {
        const { subscriptions } = await invokePixelCallback({
            init: {
                context: {
                    document: {
                        location: { href: 'https://epirbizuteria.pl/products/pierscionek-test' },
                    },
                },
            },
        });

        const handler = subscriptions.get('product_viewed');
        await handler!(
            withAnalyticsConsent({
                context: {
                    document: {
                        location: { href: 'https://epirbizuteria.pl/products/pierscionek-test?variant=1' },
                    },
                    customerPrivacy: { analyticsProcessingAllowed: true },
                },
                data: {
                    productVariant: {
                        id: 'var-1',
                        product: {
                            id: 'prod-1',
                            title: 'Ring',
                            url: '/products/pierscionek-test?variant=1',
                        },
                    },
                },
            }),
        );

        const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
        expect(body.data.product_handle).toBe('pierscionek-test');
        expect(body.data.storefront_id).toBe('epir-liquid');
        expect(body.data.channel).toBe('online-store');
    });

    it('enriches event with customerId and sessionId', async () => {
        const sessionId = 'session_existing_123';
        const customerId = 'gid://shopify/Customer/99';
        const { subscriptions } = await invokePixelCallback({
            init: { data: { customer: { id: customerId } } },
        });

        const handler = subscriptions.get('product_viewed');
        await handler!(
            withAnalyticsConsent({
                clientId: sessionId,
                productVariant: {id: 'var-1', product: {id: 'prod-1', title: 'Ring'}},
            }),
        );

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);

        expect(body.data.customerId).toBe(customerId);
        expect(body.data.sessionId).toBe(sessionId);
        expect(body.data.session_id).toBe(sessionId);
    });

    it('does not swallow original event data when enriching', async () => {
        const originalEvent = { x: 100, y: 200, element: 'button', viewport: { w: 1920, h: 1080 } };
        const { subscriptions } = await invokePixelCallback();

        const handler = subscriptions.get('epir:click_with_position');
        await handler!(withAnalyticsConsent({customData: originalEvent}));

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.type).toBe('click_with_position');
        expect(body.data.x).toBe(100);
        expect(body.data.y).toBe(200);
        expect(body.data.element).toBe('button');
    });
});

describe('web-pixel extension – proactive chat activation', () => {
    const dispatchedEvents: CustomEvent[] = [];

    beforeEach(() => {
        dispatchedEvents.length = 0;
        vi.stubGlobal('window', {
            dispatchEvent: vi.fn((event: CustomEvent) => {
                dispatchedEvents.push(event);
            }),
            CustomEvent: globalThis.CustomEvent,
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('dispatches epir:activate-chat event when activate_chat=true', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({
                ok: true,
                activate_chat: true,
                reason: 'high_engagement_score',
            }),
        }));

        const { subscriptions } = await invokePixelCallback({
            init: { data: { customer: { id: 'cust-active' } } },
        });

        const handler = subscriptions.get('page_viewed');
        await handler!(withAnalyticsConsent({clientId: 'session-active'}));

        expect(window.dispatchEvent).toHaveBeenCalledOnce();
        const event = dispatchedEvents[0];
        expect(event.type).toBe('epir:activate-chat');
        expect(event.detail.reason).toBe('high_engagement_score');
        expect(event.detail.session_id).toBe('session-active');
        expect(event.detail.customer_id).toBe('cust-active');
        expect(typeof event.detail.timestamp).toBe('number');
    });

    it('does not dispatch event when activate_chat=false', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ ok: true, activate_chat: false }),
        }));

        const { subscriptions } = await invokePixelCallback();
        const handler = subscriptions.get('page_viewed');
        await handler!(withAnalyticsConsent({}));

        expect(window.dispatchEvent).not.toHaveBeenCalled();
    });

    it('does not dispatch event when response is not ok', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
        }));

        const { subscriptions } = await invokePixelCallback();
        const handler = subscriptions.get('page_viewed');
        await handler!(withAnalyticsConsent({}));

        expect(window.dispatchEvent).not.toHaveBeenCalled();
    });

    it('does not throw when fetch fails', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

        const { subscriptions } = await invokePixelCallback();
        const handler = subscriptions.get('page_viewed');

        await expect(handler!(withAnalyticsConsent({}))).resolves.toBeUndefined();
    });
});

describe('web-pixel extension – event subscriptions coverage', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ ok: true, activate_chat: false }),
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const standardEvents = [
        'page_viewed',
        'product_viewed',
        'cart_updated',
        'checkout_started',
        'purchase_completed',
        'cart_viewed',
        'product_added_to_cart',
        'product_removed_from_cart',
        'collection_viewed',
        'search_submitted',
        'checkout_completed',
        'checkout_contact_info_submitted',
        'checkout_address_info_submitted',
        'checkout_shipping_info_submitted',
        'payment_info_submitted',
        'alert_displayed',
        'ui_extension_errored',
        'form_submitted',
        'input_focused',
        'input_blurred',
        'input_changed',
    ];

    const customEvents = [
        'epir:click_with_position',
        'epir:scroll_depth',
        'epir:page_exit',
        'epir:mouse_sample',
        'epir:cocreate_submitted',
    ];

    it.each(standardEvents)('subscribes to %s event', async (eventName) => {
        const { subscriptions } = await invokePixelCallback();
        expect(subscriptions.has(eventName)).toBe(true);
    });

    it.each(customEvents)('subscribes to custom %s event', async (eventName) => {
        const { subscriptions } = await invokePixelCallback();
        expect(subscriptions.has(eventName)).toBe(true);
    });

    it.each(standardEvents)('sends %s event to pixel endpoint', async (eventName) => {
        const { subscriptions } = await invokePixelCallback();
        const handler = subscriptions.get(eventName);
        expect(handler).toBeDefined();

        await handler!(withAnalyticsConsent({testData: 'value'}));

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.type).toBe(eventName);
    });
});

describe('web-pixel extension – custom event data extraction', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ ok: true, activate_chat: false }),
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('extracts customData from epir:click_with_position event', async () => {
        const { subscriptions } = await invokePixelCallback();
        const handler = subscriptions.get('epir:click_with_position');

        const customData = { x: 300, y: 150, element: 'a', viewport: { w: 1280, h: 800 } };
        await handler!(withAnalyticsConsent({customData}));

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.type).toBe('click_with_position');
        expect(body.data.x).toBe(300);
        expect(body.data.y).toBe(150);
    });

    it('extracts customData from epir:scroll_depth event', async () => {
        const { subscriptions } = await invokePixelCallback();
        const handler = subscriptions.get('epir:scroll_depth');

        const customData = { depth: 75, pageUrl: 'https://shop.example.com/products' };
        await handler!(withAnalyticsConsent({customData}));

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.type).toBe('scroll_depth');
        expect(body.data.depth).toBe(75);
    });

    it('extracts customData from epir:page_exit event', async () => {
        const { subscriptions } = await invokePixelCallback();
        const handler = subscriptions.get('epir:page_exit');

        const customData = { time_on_page_seconds: 120, max_scroll_percent: 60 };
        await handler!(withAnalyticsConsent({customData}));

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.type).toBe('page_exit');
        expect(body.data.time_on_page_seconds).toBe(120);
    });

    it('extracts customData from epir:mouse_sample event', async () => {
        const { subscriptions } = await invokePixelCallback();
        const handler = subscriptions.get('epir:mouse_sample');

        const customData = { x: 500, y: 300 };
        await handler!(withAnalyticsConsent({customData}));

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.type).toBe('mouse_sample');
        expect(body.data.x).toBe(500);
        expect(body.data.y).toBe(300);
    });

    it('falls back to whole event when customData is missing', async () => {
        const { subscriptions } = await invokePixelCallback();
        const handler = subscriptions.get('epir:click_with_position');

        const rawEvent = { x: 100, y: 200, noCustomData: true };
        await handler!(withAnalyticsConsent(rawEvent));

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.data.noCustomData).toBe(true);
    });
});

describe('web-pixel extension – customer privacy gate', () => {
    beforeEach(() => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({ ok: true, activate_chat: false }),
            }),
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('posts pixel_sender and clientId when only init.customerPrivacy allows analytics', async () => {
        const {subscriptions} = await invokePixelCallback({
            init: {customerPrivacy: {analyticsProcessingAllowed: true}},
            browser: {
                cookie: {get: vi.fn().mockResolvedValue(null)},
            },
        });
        const handler = subscriptions.get('page_viewed');
        await handler!({
            name: 'page_viewed',
            clientId: 'shopify-client-after-consent',
            context: {
                document: {location: {href: 'https://epirbizuteria.pl/products/pierscionek'}},
            },
        });
        expect(fetch).toHaveBeenCalledOnce();
        const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
        expect(body.type).toBe('page_viewed');
        expect(body.data.pixel_sender).toBe('web_pixel_extension');
        expect(body.data.session_id).toBe('shopify-client-after-consent');
        expect(body.data.sessionId).toBe('shopify-client-after-consent');
    });

    it('does not fetch when init.customerPrivacy disallows analytics', async () => {
        const {subscriptions} = await invokePixelCallback({
            init: {customerPrivacy: {analyticsProcessingAllowed: false}},
        });
        const handler = subscriptions.get('page_viewed');
        await handler!({clientId: 'should-not-send'});
        expect(fetch).not.toHaveBeenCalled();
    });

    it('does not fetch when the event disallows analytics even if init allows it', async () => {
        const {subscriptions} = await invokePixelCallback({
            init: {customerPrivacy: {analyticsProcessingAllowed: true}},
        });
        const handler = subscriptions.get('page_viewed');
        await handler!({
            clientId: 'should-not-send',
            context: {customerPrivacy: {analyticsProcessingAllowed: false}},
        });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('does not fetch when pixel event omits customerPrivacy fields', async () => {
        const {subscriptions} = await invokePixelCallback({});
        const handler = subscriptions.get('page_viewed');
        await handler!({});
        expect(fetch).not.toHaveBeenCalled();
    });

    it('does not fetch when event omits privacy fields (standard event payload only)', async () => {
        const {subscriptions} = await invokePixelCallback({});
        const handler = subscriptions.get('product_viewed');
        await handler!({productVariant: {id: 'v1'}});
        expect(fetch).not.toHaveBeenCalled();
    });

    it('fetches when event.context.customerPrivacy allows analytics', async () => {
        const {subscriptions} = await invokePixelCallback({});
        const handler = subscriptions.get('page_viewed');
        await handler!({
            context: {
                customerPrivacy: {analyticsProcessingAllowed: true},
            },
        });
        expect(fetch).toHaveBeenCalledOnce();
    });

    it('does not fetch when event.context.customerPrivacy explicitly disallows', async () => {
        const {subscriptions} = await invokePixelCallback({});
        const handler = subscriptions.get('page_viewed');
        await handler!({
            context: {
                customerPrivacy: {analyticsProcessingAllowed: false},
            },
        });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('does not infer consent from prior sends — bare event still drops silently', async () => {
        const {subscriptions} = await invokePixelCallback({});
        const handler = subscriptions.get('page_viewed');
        await handler!(withAnalyticsConsent({}));
        expect(fetch).toHaveBeenCalledOnce();
        vi.mocked(fetch).mockClear();
        await handler!({});
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe('form and cocreate privacy', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ ok: true, activate_chat: false }),
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('form_submitted drops field values and keeps id plus action without query', async () => {
        const { subscriptions } = await invokePixelCallback();
        const handler = subscriptions.get('form_submitted');
        await handler!(withAnalyticsConsent({
            clientId: 'pixel-client-1',
            context: {
                document: {
                    location: {
                        href: 'https://epirbizuteria.pl/pages/zaprojektuj-swoj-model?utm_source=google&email=secret@example.com',
                    },
                },
            },
            data: {
                element: {
                    id: 'cocreate-form',
                    action: 'https://epirbizuteria.pl/apps/assistant/cocreate?shop=secret',
                    elements: [
                        { name: 'email', type: 'email', value: 'secret@example.com' },
                        { name: 'phone', type: 'tel', value: '+48111222333' },
                    ],
                },
            },
        }));

        const bodies = (fetch as ReturnType<typeof vi.fn>).mock.calls
            .map((call) => JSON.parse(call[1].body))
            .filter((b) => b.type === 'form_submitted');
        expect(bodies).toHaveLength(1);
        const payload = JSON.stringify(bodies[0].data);
        expect(payload).not.toContain('secret@example.com');
        expect(payload).not.toContain('+48111222333');
        expect(bodies[0].data.data.element).toEqual({
            id: 'cocreate-form',
            action: 'https://epirbizuteria.pl/apps/assistant/cocreate',
        });
        expect(bodies[0].data.session_id).toBe('pixel-client-1');
        expect(bodies[0].data.page_url).toContain('/pages/zaprojektuj-swoj-model');
        expect(bodies[0].data.page_url).not.toContain('secret@example.com');
    });

    it('cocreate_submitted carries reference_id and clientId, and is dropped without consent', async () => {
        const { subscriptions } = await invokePixelCallback();
        const handler = subscriptions.get('epir:cocreate_submitted');
        await handler!(withAnalyticsConsent({
            clientId: 'pixel-client-1',
            customData: { reference_id: 'EPIR-2026-ABCDEF01', form_id: 'cocreate-form' },
            context: {
                document: {
                    location: { href: 'https://epirbizuteria.pl/pages/zaprojektuj-swoj-model' },
                },
            },
        }));
        const sent = (fetch as ReturnType<typeof vi.fn>).mock.calls
            .map((call) => JSON.parse(call[1].body))
            .filter((b) => b.type === 'cocreate_submitted');
        expect(sent).toHaveLength(1);
        expect(sent[0].data.reference_id).toBe('EPIR-2026-ABCDEF01');
        expect(sent[0].data.session_id).toBe('pixel-client-1');
        expect(sent[0].data.page_url).toContain('/pages/zaprojektuj-swoj-model');

        vi.mocked(fetch).mockClear();
        await handler!({
            clientId: 'pixel-client-1',
            customData: { reference_id: 'EPIR-2026-ABCDEF01', form_id: 'cocreate-form' },
        });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('does not send a second chat_session_linked when the pair is already in sessionStorage', async () => {
        const store = new Map<string, string>([
            ['_epir_chat_linked_pairs', JSON.stringify(['sess_link-me-0001\0pixel-client-1'])],
        ]);
        const { subscriptions } = await invokePixelCallback({
            browser: {
                cookie: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
                sessionStorage: {
                    getItem: vi.fn((key: string) => {
                        if (key === 'epir-assistant-session') return Promise.resolve('sess_link-me-0001');
                        return Promise.resolve(store.get(key) ?? null);
                    }),
                    setItem: vi.fn((key: string, value: string) => {
                        store.set(key, value);
                        return Promise.resolve();
                    }),
                },
            },
        });
        const handler = subscriptions.get('page_viewed');
        await handler!(withAnalyticsConsent({ clientId: 'pixel-client-1' }));
        const linked = (fetch as ReturnType<typeof vi.fn>).mock.calls
            .map((call) => JSON.parse(call[1].body))
            .filter((b) => b.type === 'chat_session_linked');
        expect(linked).toHaveLength(0);
    });
});

describe('checkout PII allowlist – wiring', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ ok: true }) }));
    });
    afterEach(() => { vi.unstubAllGlobals(); });
    it('checkout_completed body has no PII and keeps token at data.data.checkout', async () => {
        const { subscriptions } = await invokePixelCallback();
        await subscriptions.get('checkout_completed')!(withAnalyticsConsent({ clientId: 'pixel-client-1', name: 'checkout_completed', data: { checkout: checkoutFixture() } }));
        const bodies = (fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.parse(c[1].body)).filter((b) => b.type === 'checkout_completed');
        expect(bodies).toHaveLength(1);
        const s = JSON.stringify(bodies[0]);
        for (const p of PII) expect(s).not.toContain(p);
        expect(bodies[0].data.data.checkout.token).toBe('chk-token-1');
        expect(bodies[0].data.session_id).toBe('pixel-client-1');
    });
});
