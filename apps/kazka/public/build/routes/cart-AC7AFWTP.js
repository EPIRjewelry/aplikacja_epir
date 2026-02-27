import{a as g}from"/build/_shared/chunk-U23VUJIC.js";import{j as s,k as i,l as c}from"/build/_shared/chunk-CPW2IHSO.js";import{h as a,n,r as o}from"/build/_shared/chunk-3LKBDPDS.js";import{c as e}from"/build/_shared/chunk-Q3IECNXJ.js";var m=e(g(),1);var t=e(o(),1);function u(){let{cart:r}=n();return r?.totalQuantity>0?(0,t.jsxs)("div",{className:"w-full max-w-6xl mx-auto pb-12 grid md:grid-cols-2 md:items-start gap-8 md:gap-8 lg:gap-12",children:[(0,t.jsx)("div",{className:"flex-grow md:translate-y-4",children:(0,t.jsx)(s,{linesObj:r.lines})}),(0,t.jsxs)("div",{className:"fixed left-0 right-0 bottom-0 md:sticky md:top-[65px] grid gap-6 p-4 md:px-6 md:translate-y-4 bg-gray-100 rounded-md w-full",children:[(0,t.jsx)(i,{cost:r.cost}),(0,t.jsx)(c,{checkoutUrl:r.checkoutUrl})]})]}):(0,t.jsxs)("div",{className:"flex flex-col space-y-7 justify-center items-center md:py-8 md:px-12 px-4 py-6 h-screen",children:[(0,t.jsx)("h2",{className:"whitespace-pre-wrap max-w-prose font-bold text-4xl",children:"Your cart is empty"}),(0,t.jsx)(a,{to:"/",className:"inline-block rounded-sm font-medium text-center py-3 px-6 max-w-xl leading-none bg-black text-white w-full",children:"Continue shopping"})]})}var d=`#graphql
  fragment ErrorFragment on CartUserError {
    message
    field
    code
  }
`,l=`#graphql
  fragment CartLinesFragment on Cart {
    id
    totalQuantity
  }
`;var y=`#graphql
  mutation ($input: CartInput!, $country: CountryCode = ZZ, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    cartCreate(input: $input) {
      cart {
        ...CartLinesFragment
      }
      errors: userErrors {
        ...ErrorFragment
      }
    }
  }
  ${l}
  ${d}
`,I=`#graphql
  mutation ($cartId: ID!, $lines: [CartLineInput!]!, $country: CountryCode = ZZ, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        ...CartLinesFragment
      }
      errors: userErrors {
        ...ErrorFragment
      }
    }
  }
  ${l}
  ${d}
`;export{u as default};
/**
 * Create a cart with line(s) mutation
 * @param input CartInput https://shopify.dev/api/storefront/{api_version}/input-objects/CartInput
 * @param storefront
 * @see https://shopify.dev/api/storefront/{api_version}/mutations/cartcreate
 * @returns result {cart, errors}
 * @preserve
 */
/**
 * Storefront API cartLinesAdd mutation
 * @param cartId
 * @param lines [CartLineInput!]! https://shopify.dev/api/storefront/{api_version}/input-objects/CartLineInput
 * @param storefront
 * @see https://shopify.dev/api/storefront/{api_version}/mutations/cartLinesAdd
 * @returns result {cart, errors}
 * @preserve
 */
/**
 * Create a cart with line(s) mutation
 * @param cartId the current cart id
 * @param lineIds
 * @param storefront
 * @see https://shopify.dev/api/storefront/2022-07/mutations/cartlinesremove
 * @returns mutated cart
 * @preserve
 */
//! @see: https://shopify.dev/api/storefront/{api_version}/mutations/cartcreate
