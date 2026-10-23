import {
  createCookieSessionStorage,
  type Session,
  type SessionStorage,
} from '@remix-run/cloudflare';

/** Session bridge key on `EventContext.data` (Pages `onRequest` wrapper). */
export const EPIR_SESSION_BRIDGE_KEY = '__epirSession';

export type EpirZareczynySession = HydrogenCloudflareSession | NoopSession;

/**
 * Fail-closed session when `SESSION_SECRET` is missing in the Functions runtime.
 * Does not parse `Cookie` or call `createCookieSessionStorage`.
 */
export class NoopSession {
  isPending = false;

  get(_key: string) {
    return undefined;
  }

  set(_key: string, _value: unknown) {
    this.isPending = false;
  }

  unset(_key: string) {
    this.isPending = false;
  }

  flash(_key: string, _value: unknown) {
    this.isPending = false;
  }

  commit() {
    return Promise.resolve('');
  }

  destroy() {
    return Promise.resolve('');
  }
}

export class HydrogenCloudflareSession {
  isPending = false;

  constructor(
    private sessionStorage: SessionStorage,
    private session: Session,
  ) {}

  static async init(request: Request, secrets: string[] | null) {
    const secret = secrets?.[0]?.trim();
    if (!secret) {
      return new NoopSession();
    }

    const storage = createCookieSessionStorage({
      cookie: {
        name: 'session',
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secrets: [secret],
      },
    });

    const session = await storage.getSession(request.headers.get('Cookie'));

    return new HydrogenCloudflareSession(storage, session);
  }

  get(key: string) {
    return this.session.get(key);
  }

  destroy() {
    return this.sessionStorage.destroySession(this.session);
  }

  flash(key: string, value: unknown) {
    this.isPending = true;
    this.session.flash(key, value);
  }

  unset(key: string) {
    this.isPending = true;
    this.session.unset(key);
  }

  set(key: string, value: unknown) {
    this.isPending = true;
    this.session.set(key, value);
  }

  commit() {
    this.isPending = false;
    return this.sessionStorage.commitSession(this.session);
  }
}
