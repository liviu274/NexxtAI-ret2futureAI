import { useEffect, useRef } from "react";
import { LogoMark } from "./Logo";

// Splatter drops: direction (deg), distance (px) and size, fixed so the intro looks the same every time.
const DROPS = [[12, 260, 26], [47, 330, 14], [80, 220, 34], [118, 300, 18], [150, 380, 22], [192, 250, 30], [228, 340, 12], [260, 280, 24], [300, 360, 16], [332, 230, 28]] as const;

/**
 * Landing intro: a full yellow screen from the first frame; a rubber stamp drops onto it, the screen shakes,
 * black ink splashes, the R² imprint stays, the stamp lifts, the yellow fades and the imprint flies into the header logo. Whether it plays is
 * decided before first paint by the root script (html[data-intro="play"]). Click or any key skips it.
 */
export function Splash() {
  const overlay = useRef<HTMLDivElement>(null);
  const stamp = useRef<HTMLDivElement>(null);
  const ink = useRef<HTMLDivElement>(null);
  const imprint = useRef<HTMLDivElement>(null);
  const drops = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset["intro"] !== "play" || !overlay.current || !stamp.current || !ink.current || !imprint.current) return;
    // With reduced motion the intro still plays, but without shaking the screen.
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animations: Animation[] = [];
    // Each step starts from the previous animation's finish (not timers), so a busy main thread
    // during page load cannot leave the stamp hanging on screen.
    const run = (el: Element | null | undefined, frames: Keyframe[], opts: KeyframeAnimationOptions) => { const a = el?.animate(frames, { fill: "forwards", ...opts }); if (a) animations.push(a); return a; };
    let done = false;
    const end = () => { if (done) return; done = true; animations.forEach((a) => a.cancel()); delete root.dataset["intro"]; };
    const skip = () => end();
    window.addEventListener("keydown", skip, { once: true });
    overlay.current.addEventListener("click", skip, { once: true });
    const IMPRINT = 150; // LogoMark size used for the imprint
    const ease = "cubic-bezier(.65,0,.25,1)";

    // 1. The stamp drops into view, hovers as if aiming, rises for the swing, then slams down.
    const fall = run(stamp.current, [
      { transform: "translate(-50%, -100%) translateY(-110vh) rotate(-16deg) scale(1.35)", easing: "cubic-bezier(.2,.8,.3,1)" },
      { transform: "translate(-50%, -100%) translateY(-30vh) rotate(-9deg) scale(1.12)", offset: 0.4, easing: "ease-in-out" },
      { transform: "translate(-50%, -100%) translateY(-34vh) rotate(-11deg) scale(1.14)", offset: 0.6, easing: "cubic-bezier(.4,0,.2,1)" },
      { transform: "translate(-50%, -100%) translateY(-40vh) rotate(-13deg) scale(1.18)", offset: 0.78, easing: "cubic-bezier(.7,0,1,.6)" },
      { transform: "translate(-50%, -100%) translateY(0) rotate(-6deg) scale(1)" },
    ], { duration: 1500, delay: 150 });

    if (fall) fall.onfinish = () => {
      if (done) return;
      // 2. Impact: shake, a shock ring spreads, black ink drops fly, the imprint appears under the stamp.
      if (!calm) run(document.body, [0, -9, 8, -6, 4, -2, 0].map((x, i) => ({ transform: `translate(${x}px, ${i % 2 ? 5 : -4}px)` })), { duration: 300, fill: "none" });
      run(ink.current, [{ transform: "translate(-50%, -50%) scale(.3)", opacity: 0.55 }, { transform: "translate(-50%, -50%) scale(7)", opacity: 0 }], { duration: 750, easing: "cubic-bezier(.2,.8,.2,1)" });
      drops.current.forEach((d, i) => {
        const [deg, dist, size] = DROPS[i] ?? DROPS[0];
        const rad = (deg * Math.PI) / 180;
        run(d, [
          { transform: "translate(-50%, -50%) scale(.4)", opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(rad) * dist}px), calc(-50% + ${Math.sin(rad) * dist}px)) scale(${size / 20})`, opacity: 1, offset: 0.55 },
          { transform: `translate(calc(-50% + ${Math.cos(rad) * dist}px), calc(-50% + ${Math.sin(rad) * dist}px)) scale(${size / 20})`, opacity: 0 },
        ], { duration: 1100, easing: "cubic-bezier(.1,.7,.3,1)" });
      });
      run(imprint.current, [{ opacity: 0, transform: "translate(-50%, -50%) rotate(-6deg) scale(1.15)" }, { opacity: 1, transform: "translate(-50%, -50%) rotate(-6deg) scale(1)" }], { duration: 160 });

      // 3. The stamp squashes on impact, stays pressed, then lifts away slowly.
      run(stamp.current, [
        { transform: "translate(-50%, -100%) translateY(0) rotate(-6deg) scale(1)" },
        { transform: "translate(-50%, -100%) translateY(0) rotate(-6deg) scale(1.04, .92)", offset: 0.08 },
        { transform: "translate(-50%, -100%) translateY(0) rotate(-6deg) scale(1)", offset: 0.2 },
        { transform: "translate(-50%, -100%) translateY(0) rotate(-6deg) scale(1)", offset: 0.5, easing: "cubic-bezier(.5,0,.75,0)" },
        { transform: "translate(-50%, -100%) translateY(-115vh) rotate(4deg) scale(1.2)" },
      ], { duration: 1500 });

      // 4. After a short hold, the yellow screen fades to reveal the page and the imprint flies into the header logo.
      const target = document.querySelector("header [data-logo-mark]")?.getBoundingClientRect();
      if (!target) return;
      const dx = target.left + target.width / 2 - window.innerWidth / 2;
      const dy = target.top + target.height / 2 - window.innerHeight / 2;
      if (overlay.current) run(overlay.current, [{ backgroundColor: "rgb(255 230 0 / 1)" }, { backgroundColor: "rgb(255 230 0 / 0)" }], { duration: 520, delay: 1650, easing: ease });
      const fly = run(imprint.current, [
        { opacity: 1, transform: "translate(-50%, -50%) rotate(-6deg) scale(1)" },
        { opacity: 1, transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(0deg) scale(${target.width / IMPRINT})` },
      ], { duration: 700, delay: 1550, easing: ease });
      if (fly) fly.onfinish = end;
    };

    return () => {
      window.removeEventListener("keydown", skip); animations.forEach((a) => a.cancel());
      // React may remount at once (StrictMode); only drop the intro if the splash is really gone.
      window.setTimeout(() => { if (!document.querySelector(".r2f-splash")) delete root.dataset["intro"]; }, 0);
    };
  }, []);

  return (
    <div ref={overlay} className="r2f-splash" aria-hidden>
      {/* Rough ink edge for the imprint. */}
      <svg width="0" height="0" className="absolute">
        <filter id="r2f-ink"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="7" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter>
      </svg>
      <div ref={ink} className="absolute left-1/2 top-1/2 h-40 w-40 rounded-full border-[6px] border-[#111111] opacity-0" />
      {DROPS.map((_, i) => <span key={i} ref={(el) => { drops.current[i] = el; }} className="absolute left-1/2 top-1/2 h-5 w-5 rounded-full bg-[#111111] opacity-0" />)}
      <div ref={imprint} className="absolute left-1/2 top-1/2 opacity-0" style={{ filter: "url(#r2f-ink)", transform: "translate(-50%, -50%) rotate(-6deg)" }}>
        <LogoMark size={150} />
      </div>
      <div ref={stamp} className="absolute left-1/2 top-1/2 w-[300px]" style={{ transform: "translate(-50%, -100%) translateY(-110vh)" }}>
        <svg viewBox="0 0 200 230" className="w-full drop-shadow-[0_24px_30px_rgba(0,0,0,.35)]">
          <ellipse cx="100" cy="40" rx="40" ry="34" fill="#1A1A1A" />
          <rect x="80" y="62" width="40" height="70" rx="10" fill="#111111" />
          <rect x="22" y="128" width="156" height="58" rx="14" fill="#111111" />
          <rect x="30" y="186" width="140" height="22" rx="6" fill="#2A2A2A" />
          <text x="100" y="166" textAnchor="middle" fontFamily="Onest, system-ui, sans-serif" fontWeight="700" fontSize="22" fill="#FFE600">Raif2Future</text>
        </svg>
      </div>
    </div>
  );
}
