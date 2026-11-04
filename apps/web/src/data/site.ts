/**
 * Global settings (docs/06 `siteSettings`). Single source for NAP.
 * Facts here come from the roadmap/user brief; anything unverified is listed in `unverified`.
 */
export const site = {
  name: 'AblePoint Australia',
  shortName: 'AblePoint',
  tagline: 'NDIS supports across regional NSW',
  phoneDisplay: '1300 088 549',
  phoneHref: 'tel:1300088549',
  email: 'hello@ablepointaustralia.com.au',
  headOffice: 'Gosford, New South Wales',
  /** NDIS registration number: NOT provided yet. When set, the trust strip renders it. */
  registrationNumber: undefined as string | undefined,
  /** Registered support groups: NOT provided yet. */
  registrationGroups: undefined as string[] | undefined,
  unverified: [
    'NDIS registration number and registered support groups',
    'Brand spelling (AblePoint vs Ablepoint) and vector logo',
    'Street address policy for head office',
    'Hours of operation',
  ],
} as const;

export const nav = [
  { href: '/about-us/', label: 'About' },
  { href: '/for-support-coordinators/', label: 'For coordinators' },
  { href: '/services/', label: 'Services' },
  { href: '/locations/', label: 'Locations' },
  { href: '/vacancies/', label: 'Vacancies' },
  { href: '/guides/', label: 'Guides' },
  { href: '/contact-us/', label: 'Contact' },
] as const;

export const footerLinks = {
  services: [
    { href: '/core-support/', label: 'Core support' },
    { href: '/supported-independent-living/', label: 'Supported independent living' },
    { href: '/sda/', label: 'Specialist disability accommodation' },
    { href: '/short-term-accommodation/', label: 'Short term accommodation' },
    { href: '/support-coordinator/', label: 'Support coordination' },
    { href: '/community-access/', label: 'Community access' },
  ],
  about: [
    { href: '/about-us/', label: 'About us' },
    { href: '/for-support-coordinators/', label: 'For support coordinators' },
    { href: '/our-support-team/', label: 'Our support team' },
    { href: '/locations/', label: 'Where we work' },
    { href: '/vacancies/', label: 'Vacancies' },
    { href: '/guides/', label: 'Guides' },
    { href: '/blog/', label: 'Blog' },
  ],
  legal: [
    { href: '/privacy-policy/', label: 'Privacy policy' },
    { href: '/pricing-and-agreements/', label: 'Pricing and agreements' },
    { href: '/faq/', label: 'Help and FAQs' },
    { href: '/glossary/', label: 'NDIS words explained' },
    { href: '/feedback-complaints/', label: 'Feedback and complaints' },
    { href: '/accessibility/', label: 'Accessibility' },
    { href: '/easy-read/', label: 'Easy Read' },
  ],
} as const;
