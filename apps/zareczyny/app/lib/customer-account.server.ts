import {createCustomerAccountClient} from '@shopify/hydrogen';
import type {EpirZareczynySession} from '../../src/session';
import {isCaaConfigured} from './caa-config.server';

export function createZareczynyCustomerAccount(params: {
  request: Request;
  session: EpirZareczynySession;
  env: Env;
  waitUntil: (promise: Promise<unknown>) => void;
}) {
  const {request, session, env, waitUntil} = params;
  if (!isCaaConfigured(env)) {
    return null;
  }

  return createCustomerAccountClient({
    session,
    customerAccountId: env.PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID!,
    shopId: env.SHOP_ID!,
    request,
    waitUntil,
  });
}
