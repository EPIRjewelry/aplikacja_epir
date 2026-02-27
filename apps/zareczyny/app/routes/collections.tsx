import {Outlet} from '@remix-run/react';

/**
 * Layout dla tras /collections i /collections/:handle.
 * Wymagany przez Remix flat routes dla collections._index i collections.$handle.
 */
export default function CollectionsLayout() {
  return <Outlet />;
}
