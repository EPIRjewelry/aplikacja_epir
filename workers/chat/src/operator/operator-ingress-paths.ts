/**
 * Ścieżki ingress Operator Studio v2.
 */
export const STUDIO_PREFIX = '/internal/operator-studio';
export const OPERATOR_API_PREFIX = `${STUDIO_PREFIX}/api`;

export function isOperatorStudioAssetPath(pathname: string): boolean {
  return pathname.startsWith(`${STUDIO_PREFIX}/assets/`);
}

export function operatorAssetSubpath(pathname: string): string {
  return pathname.slice(STUDIO_PREFIX.length) || '/index.html';
}

export function isOperatorStudioIngressPath(pathname: string): boolean {
  return (
    pathname === STUDIO_PREFIX ||
    pathname === `${STUDIO_PREFIX}/` ||
    pathname.startsWith(`${OPERATOR_API_PREFIX}/`) ||
    pathname === OPERATOR_API_PREFIX
  );
}
