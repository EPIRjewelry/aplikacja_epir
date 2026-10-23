import type {EpirZareczynySession} from '../../src/session';

/** Append `Set-Cookie` only when `commit()` returns a non-empty string (NoopSession → skip). */
export async function appendSessionCookie(
  headers: Headers,
  session: EpirZareczynySession,
) {
  const cookie = await session.commit();
  if (cookie) {
    headers.append('Set-Cookie', cookie);
  }
}
