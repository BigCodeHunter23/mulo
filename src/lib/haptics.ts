/**
 * A small physical tap at the moments that matter: a score landing, a pick
 * made, a badge earned. It's what makes an app feel like it answers back.
 *
 * Android browsers take `navigator.vibrate`. iPhones ignore it entirely, but
 * since iOS 18 Safari gives a real haptic tick when a switch-style checkbox
 * is toggled, so a hidden one is flipped instead. That only works in direct
 * response to a tap, so call these straight from a click handler, before any
 * waiting; after an await, only Android will feel it.
 *
 * Browsers without either simply do nothing.
 */

export type Haptic = "tap" | "select" | "success" | "celebrate" | "error";

const PATTERNS: Record<Haptic, number | number[]> = {
  /** The lightest touch: a button or a toggle. */
  tap: 8,
  /** A choice made: a score, a pick. */
  select: 14,
  /** Something saved or completed. */
  success: [12, 60, 18],
  /** A badge, a milestone, a finished run. */
  celebrate: [20, 50, 20, 50, 45],
  /** Something went wrong. */
  error: [40, 40, 40],
};

/** How many iOS ticks stand in for each pattern. */
const TICKS: Record<Haptic, number> = { tap: 1, select: 1, success: 2, celebrate: 3, error: 2 };

let iosSwitch: HTMLLabelElement | null = null;

function iosTick() {
  if (!iosSwitch) {
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    iosSwitch = label;
  }
  // The click moves focus to the hidden switch; hand it straight back so a
  // text box being typed in keeps its keyboard.
  const focused = document.activeElement as HTMLElement | null;
  iosSwitch.click();
  focused?.focus?.({ preventScroll: true });
}

export function haptic(kind: Haptic = "tap") {
  if (typeof window === "undefined") return;
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(PATTERNS[kind]);
      return;
    }
    // Only iPhones and iPads get the switch; elsewhere it does nothing useful.
    if (!/iP(hone|ad|od)/.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))) {
      return;
    }
    const ticks = TICKS[kind];
    iosTick();
    for (let i = 1; i < ticks; i++) setTimeout(iosTick, i * 90);
  } catch {
    // Never worth breaking a tap over.
  }
}
