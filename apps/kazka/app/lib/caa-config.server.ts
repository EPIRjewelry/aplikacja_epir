export function isCaaConfigured(env: Env): boolean {
  return Boolean(
    env.SESSION_SECRET?.trim() &&
      env.PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID?.trim() &&
      env.SHOP_ID?.trim(),
  );
}
