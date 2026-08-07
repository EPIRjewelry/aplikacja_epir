import type {CampaignLandingData} from './campaign';

export class HeroTitleHandler {
  constructor(private readonly campaign: CampaignLandingData) {}

  element(element: Element) {
    if (this.campaign.heroTitle) {
      element.setInnerContent(this.campaign.heroTitle);
    }
  }
}

export class HeroSubtitleHandler {
  constructor(private readonly campaign: CampaignLandingData) {}

  element(element: Element) {
    if (this.campaign.heroSubtitle != null) {
      element.setInnerContent(this.campaign.heroSubtitle);
    }
  }
}

export class ProductsHandler {
  constructor(private readonly campaign: CampaignLandingData) {}

  element(element: Element) {
    element.setInnerContent('');
    element.setAttribute(
      'data-campaign-product-ids',
      JSON.stringify(this.campaign.productIds),
    );
  }
}

export class CtaHandler {
  constructor(private readonly campaign: CampaignLandingData) {}

  element(element: Element) {
    if (this.campaign.ctaLabel) {
      element.setInnerContent(this.campaign.ctaLabel);
    }
    if (this.campaign.ctaUrl) {
      element.setAttribute('href', this.campaign.ctaUrl);
    }
  }
}

export function applyCampaignRewriter(
  response: Response,
  campaign: CampaignLandingData,
): Response {
  return new HTMLRewriter()
    .on('[data-dynamic-hero-title]', new HeroTitleHandler(campaign))
    .on('[data-dynamic-hero-subtitle]', new HeroSubtitleHandler(campaign))
    .on('[data-dynamic-products]', new ProductsHandler(campaign))
    .on('[data-dynamic-cta]', new CtaHandler(campaign))
    .transform(response);
}
