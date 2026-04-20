declare module '@remix-run/cloudflare' {
  // Lightweight type shims to satisfy local type-checking when Remix types differ
  // with runner bindings; these are temporary and intentionally permissive.
  export type LoaderArgs = any;
  export type ActionArgs = any;
  export type EntryContext = any;
  export type LinksFunction = any;
  export const defer: any;
  export const json: any;
  export const redirect: any;
  export function createCookieSessionStorage(...args: any[]): any;
  export type Session = any;
  export type SessionStorage = any;
}
