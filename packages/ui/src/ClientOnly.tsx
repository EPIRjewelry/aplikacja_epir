import { useState, useEffect, type ReactNode } from 'react';

type ClientOnlyProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * A wrapper to delay rendering children until the component is mounted on the client.
 * This helps prevent React Hydration errors (e.g. Minified error #418) when using
 * Web Components or components that behave differently on server vs client.
 */
export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted ? <>{children}</> : <>{fallback}</>;
}
