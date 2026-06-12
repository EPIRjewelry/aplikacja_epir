/**
 * Normalizacja ścieżek ingress Operator Studio v2.
 */
const SOLO_PREFIX = '/internal/solo-dev-chat';
const STUDIO_PREFIX = '/internal/operator-studio';

export function normalizeOperatorIngressPath(pathname: string): string {
  if (pathname === STUDIO_PREFIX || pathname === `${STUDIO_PREFIX}/`) {
    return STUDIO_PREFIX;
  }
  if (pathname.startsWith(`${STUDIO_PREFIX}/api/`)) {
    return SOLO_PREFIX + pathname.slice(STUDIO_PREFIX.length);
  }
  if (pathname.startsWith(`${STUDIO_PREFIX}/assets/`)) {
    return pathname;
  }
  return pathname;
}

export function isOperatorStudioAssetPath(pathname: string): boolean {
  return pathname.startsWith(`${STUDIO_PREFIX}/assets/`);
}

export function operatorAssetSubpath(pathname: string): string {
  return pathname.slice(STUDIO_PREFIX.length) || '/index.html';
}

export { SOLO_PREFIX, STUDIO_PREFIX };
