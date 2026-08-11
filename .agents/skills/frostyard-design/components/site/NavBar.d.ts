/** frostyard.org top nav: wordmark, hairline bottom rule, pill source link. @startingPoint section="Site" subtitle="Site navigation bar" viewport="1240x120" */
export interface NavBarProps {
  /** [label, href] pairs */
  links?: [string, string][];
  /** label of the active link (rendered in ice) */
  current?: string;
  sourceLabel?: string;
  sourceHref?: string;
  /** intercepts link clicks for SPA-style kits */
  onNavigate?: (href: string) => void;
}