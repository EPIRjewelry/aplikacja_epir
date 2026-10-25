import {
  createCookieSessionStorage,
  Session,
  SessionStorage,
} from '@remix-run/cloudflare';

/** Klucz mostka sesji na `EventContext.data` (wrapper `onRequest` w `server.ts`). */
export const EPIR_SESSION_BRIDGE_KEY = '__epirSession';

/**
 * Sesja Hydrogen na Pages. `isPending` mówi mostkowi, że `commit()`
 * ma dopisać `Set-Cookie` po turze Customer Account API.
 */
export class HydrogenCloudflareSession {
  isPending = false;

  constructor(
    private sessionStorage: SessionStorage,
    private session: Session,
  ) {}

  static async init(request: Request, secrets: string[]) {
    const storage = createCookieSessionStorage({
      cookie: {
        name: 'session',
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secrets,
      },
    });

    const session = await storage.getSession(request.headers.get('Cookie'));

    return new this(storage, session);
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
