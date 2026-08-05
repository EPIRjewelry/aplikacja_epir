/**
 * Brand storytelling — dowód społeczny (retail, bez listy B2B).
 *
 * CMS-ready (przyszły metaobiekt `social_proof`):
 *   text → text
 */
export interface SocialProofBannerProps {
  text: string;
}

export function SocialProofBanner({text}: SocialProofBannerProps) {
  return (
    <aside
      aria-label="Dowód jakości"
      className="font-body w-full px-4 py-12 md:px-8 md:py-16"
    >
      <p className="font-heading mx-auto max-w-3xl text-center text-lg font-medium leading-snug tracking-tight text-[rgb(var(--color-primary))] md:text-xl">
        {text}
      </p>
    </aside>
  );
}
