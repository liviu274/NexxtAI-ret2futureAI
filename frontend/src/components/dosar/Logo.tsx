import { Link } from "@tanstack/react-router";

/** The Raif2Future mark: a yellow tile with "R" and a raised "2". Colors are fixed so it reads the same in both themes. */
export function LogoMark({ size = 32, className, ...rest }: { size?: number; className?: string } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} aria-hidden {...rest}>
      <rect width="40" height="40" rx="11" fill="#FFE600" />
      <text x="17.5" y="29" textAnchor="middle" fontFamily="Onest, system-ui, sans-serif" fontWeight="700" fontSize="25" fill="#111111">R</text>
      <text x="30" y="17" textAnchor="middle" fontFamily="Onest, system-ui, sans-serif" fontWeight="700" fontSize="13" fill="#111111">2</text>
    </svg>
  );
}

/** Mark + wordmark, linking home. `inverted` is for the black side rail. */
export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link to="/" aria-label="Raif2Future, pagina principală" className={`flex shrink-0 items-center gap-2.5 text-[17px] tracking-tight ${inverted ? "text-rail-foreground" : "text-ink"}`}>
      <LogoMark data-logo-mark="" />
      <span className="font-bold">Raif<span className="mx-[2px] rounded-[5px] bg-brand px-[5px] py-px text-on-brand">2</span><span className="font-medium">Future</span></span>
    </Link>
  );
}
