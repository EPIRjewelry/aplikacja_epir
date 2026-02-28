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

// ============================================================================
// Helper: invoke registered callback with given mock API
// ============================================================================
async function invokePixelCallback(overrides: Partial<MockWebPixelAPI> = {}): Promise<{
    subscriptions: Map<string, (event: unknown) => void>;
    api: MockWebPixelAPI;
}> {
    const subscriptions = new Map<string, (event: unknown) => void>();

    const api: MockWebPixelAPI = {
        analytics: {
            subscribe: vi.fn((eventName: string, handler: (event: unknown) => void) => {
                subscriptions.set(eventName, handler);
            }),
        },
        browser: {
            sessionStorage: {
                getItem: vi.fn().mockResolvedValue(null),
                setItem: vi.fn().mockResolvedValue(undefined),
            },
        },
        init: { data: { customer: null } },
        settings: { pixelEndpoint: 'https://test-pixel.example.com' },
        ...overrides,
    };

    if (mockState.registeredCallback) {
        await mockState.registeredCallback(api);
    }

    return { subscriptions, api };
}

// ============================================================================
// Tests
// ============================================================================
describe('web-pixel extension – session management', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset fetch mock
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ ok: true, activate_chat: false }),
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('creates a new session ID when sessionStorage is empty', async () => {
        const { api } = await invokePixelCallback({
            browser: {
                sessionStorage: {
                    getItem: vi.fn().mockResolvedValue(null),
                    setItem: vi.fn().mockResolvedValue(undefined),
                },
            },
        });

        expect(api.browser.sessionStorage.getItem).toHaveBeenCalledWith('_epir_session_id');
        expect(api.browser.sessionStorage.setItem).toHaveBeenCalledOnce();

        const [key, value] = api.browser.sessionStorage.setItem.mock.calls[0];
        expect(key).toBe('_epir_session_id');
        expect(value).toMatch(/^session_\d+_[a-z0-9]+$/);
    });

    it('reuses existing session ID from sessionStorage', async () => {
        const existingSessionId = 'session_1234567890_abc123';

        const { api } = await invokePixelCallback({
            browser: {
                sessionStorage: {
                    getItem: vi.fn().mockResolvedValue(existingSessionId),
                    setItem: vi.fn().mockResolvedValue(undefined),
                },
            },
        });

        expect(api.browser.sessionStorage.getItem).toHaveBeenCalledWith('_epir_session_id');
        expect(api.browser.sessionStorage.setItem).not.toHaveBeenCalled();
    });

    it('generates fallback session ID when sessionStorage throws', async () => {
        const { api } = await invokePixelCallback({
            browser: {
                sessionStorage: {
                    getItem: vi.fn().mockRejectedValue(new Error('sessionStorage unavailable')),
                    setItem: vi.fn().mockResolvedValue(undefined),
                },
            },
        });

        expect(api.browser.sessionStorage.getItem).toHaveBeenCalled();
        // setItem should NOT be called because the error path uses a local fallback
        expect(api.browser.sessionStorage.setItem).not.toHaveBeenCalled();
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
        await handler!({});

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
        await handler!({});

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.data.customerId).toBeNull();
    });

    it('handles missing init.data gracefully', async () => {
        const { subscriptions } = await invokePixelCallback({
            init: {},
        });

        const handler = subscriptions.get('page_viewed');
        await handler!({});

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
        await handler!({});

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(fetchCall[0]).toBe('https://custom-endpoint.example.com/pixel');
    });

    it('strips trailing slash from pixelEndpoint', async () => {
        const { subscriptions } = await invokePixelCallback({
            settings: { pixelEndpoint: 'https://custom-endpoint.example.com/' },
        });

        const handler = subscriptions.get('page_viewed');
        await handler!({});

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(fetchCall[0]).toBe('https://custom-endpoint.example.com/pixel');
    });

    it('uses default endpoint when settings.pixelEndpoint is not set', async () => {
        const { subscriptions } = await invokePixelCallback({
            settings: {},
        });

        const handler = subscriptions.get('page_viewed');
        await handler!({});

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
        const mockEvent = { context: { document: { url: 'https://shop.example.com/home' } } };
        const { subscriptions } = await invokePixelCallback({
            init: { data: { customer: { id: 'cust-123' } } },
            browser: {
                sessionStorage: {
                    getItem: vi.fn().mockResolvedValue('session-abc'),
                    setItem: vi.fn().mockResolvedValue(undefined),
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
            context: { document: { url: 'https://shop.example.com/home' } },
        });
    });

    it('enriches event with customerId and sessionId', async () => {
        const sessionId = 'session_existing_123';
        const customerId = 'gid://shopify/Customer/99';
        const { subscriptions } = await invokePixelCallback({
            init: { data: { customer: { id: customerId } } },
            browser: {
                sessionStorage: {
                    getItem: vi.fn().mockResolvedValue(sessionId),
                    setItem: vi.fn().mockResolvedValue(undefined),
                },
            },
        });

        const handler = subscriptions.get('product_viewed');
        await handler!({ productVariant: { id: 'var-1', product: { id: 'prod-1', title: 'Ring' } } });

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);

        expect(body.data.customerId).toBe(customerId);
        expect(body.data.sessionId).toBe(sessionId);
    });

    it('does not swallow original event data when enriching', async () => {
        const originalEvent = { x: 100, y: 200, element: 'button', viewport: { w: 1920, h: 1080 } };
        const { subscriptions } = await invokePixelCallback();

        const handler = subscriptions.get('epir:click_with_position');
        await handler!({ customData: originalEvent });

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
                sessionStorage: {
                    getItem: vi.fn().mockResolvedValue('session-active'),
                    setItem: vi.fn().mockResolvedValue(undefined),
                },
            },
        });

        const handler = subscriptions.get('page_viewed');
        handler!({});

        // sendPixelEvent is async (fetch → response.json → dispatchEvent);
        // flush the microtask queue so all awaited promises resolve
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

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
        handler!({});

        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(window.dispatchEvent).not.toHaveBeenCalled();
    });

    it('does not dispatch event when response is not ok', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
        }));

        const { subscriptions } = await invokePixelCallback();
        const handler = subscriptions.get('page_viewed');
        handler!({});

        await Promise.resolve();
        await Promise.resolve();

        expect(window.dispatchEvent).not.toHaveBeenCalled();
    });

    it('does not throw when fetch fails', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

        const { subscriptions } = await invokePixelCallback();
        const handler = subscriptions.get('page_viewed');

        // handler returns void (not a Promise) because sendPixelEvent is not awaited
        expect(() => handler!({})).not.toThrow();
        // Ensure the background rejection is handled gracefully (no unhandled rejection)
        await Promise.resolve();
        await Promise.resolve();
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

        await handler!({ testData: 'value' });

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
        await handler!({ customData });

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
        await handler!({ customData });

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.type).toBe('scroll_depth');
        expect(body.data.depth).toBe(75);
    });

    it('extracts customData from epir:page_exit event', async () => {
        const { subscriptions } = await invokePixelCallback();
        const handler = subscriptions.get('epir:page_exit');

        const customData = { time_on_page_seconds: 120, max_scroll_percent: 60 };
        await handler!({ customData });

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.type).toBe('page_exit');
        expect(body.data.time_on_page_seconds).toBe(120);
    });

    it('extracts customData from epir:mouse_sample event', async () => {
        const { subscriptions } = await invokePixelCallback();
        const handler = subscriptions.get('epir:mouse_sample');

        const customData = { x: 500, y: 300 };
        await handler!({ customData });

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
        await handler!(rawEvent);

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.data.noCustomData).toBe(true);
    });
});
