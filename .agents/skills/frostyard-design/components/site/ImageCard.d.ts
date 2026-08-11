/** Product image card: alpine hero-art band (cropped from assets/hero/), mono kicker, tags. @startingPoint section="Site" subtitle="Product card with alpine hero art" viewport="400x460" */
export interface ImageCardProps {
  /** kicker, e.g. "Desktop" | "Server" | "Surface" */
  type: string;
  /** 0-based; picks gradient + default hero scene, renders 0{n+1} */
  index?: number;
  /** lowercase product name, e.g. "snow" */
  name: string;
  title: string;
  body: string;
  tags?: string[];
  href?: string;
  /** explicit hero image URL; overrides the index-based default */
  artSrc?: string;
  /** relative path from the consuming page to assets/ (default "../../assets") */
  assetsBase?: string;
}