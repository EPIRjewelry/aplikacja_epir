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
        };
        context?: Record<string, unknown>;
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
                get: vi.fn().mockResolvedValue(null),
            },
            sessionStorage: {
                getItem: vi.fn().mockResolvedValue(null),
                setItem: vi.fn().mockResolvedValue(undefined),
            },
            ...overrides.browser,
        },
    };

    if (mockState.registeredCallback) {
        await mockState.registeredCallback(api);
    }

    return {subscriptions, api};
}

// ============================================================================
// Tests
// ============================================================================
describe('web-pixel extension – identity resolution (cookie + clientId)', () => {
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

    it('reads _epir_session_id via browser.cookie.get (no client-side generation)', async () => {
        const fromHydrogen = 'a1b2c3d4e5f6789012345678abcdef01';
        const { subscriptions, api } = await invokePixelCallback({
            browser: {
                cookie: {
                    get: vi.fn().mockImplementation((name: string) =>
                        name === '_epir_session_id' ? Promise.resolve(fromHydrogen) : Promise.resolve(null),
                    ),
                },
            },
        });

        const handler = subscriptions.get('page_viewed');
        await handler!(withAnalyticsConsent({ clientId: 'shopify-client-fallback' }));

        expect(api.browser.cookie?.get).toHaveBeenCalledWith('_epir_session_id');

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.data.sessionId).toBe(fromHydrogen);
        expect(body.data.session_id).toBe(fromHydrogen);
    });

    it('falls back to event clientId when cookie is empty', async () => {
        const { subscriptions } = await invokePixelCallback({
            browser: {
                cookie: {
                    get: vi.fn().mockResolvedValue(null),
                },
            },
        });

        const handler = subscriptions.get('page_viewed');
        await handler!(withAnalyticsConsent({ clientId: 'pixel-native-client-id-xyz' }));

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.data.sessionId).toBe('pixel-native-client-id-xyz');
        expect(body.data.session_id).toBe('pixel-native-client-id-xyz');
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
            context: {document: {url: 'https://shop.example.com/home'}},
        });
        const { subscriptions } = await invokePixelCallback({
            init: { data: { customer: { id: 'cust-123' } } },
            browser: {
                cookie: {
                    get: vi.fn().mockResolvedValue('session-abc'),
                },
            },
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
            context: expect.objectContaining({
                document: {url: 'https://shop.example.com/home'},
                customerPrivacy: {analyticsProcessingAllowed: true},
            }),
        });
    });

    it('enriches event with customerId and sessionId', async () => {
        const sessionId = 'session_existing_123';
        const customerId = 'gid://shopify/Customer/99';
        const { subscriptions } = await invokePixelCallback({
            init: { data: { customer: { id: customerId } } },
            browser: {
                cookie: {
                    get: vi.fn().mockResolvedValue(sessionId),
                },
            },
        });

        const handler = subscriptions.get('product_viewed');
        await handler!(
            withAnalyticsConsent({
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
            browser: {
                cookie: {
                    get: vi.fn().mockResolvedValue('session-active'),
                },
            },
        });

        const handler = subscriptions.get('page_viewed');
        await handler!(withAnalyticsConsent({}));

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
