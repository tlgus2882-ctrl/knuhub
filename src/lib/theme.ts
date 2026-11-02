/** 화면 테마: 라이트, 다크, or the device's setting. The choice is kept per device (localStorage). */
export type ThemeChoice = "light" | "dark" | "system";

const KEY = "theme";

/**
 * Runs in <head> before the page paints, so a dark page never flashes white. It also follows the
 * device when it switches between light and dark while 시스템 is chosen.
 */
export const THEME_SCRIPT = `(() => {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    let choice = null;
    try { choice = localStorage.getItem("${KEY}"); } catch {}
    document.documentElement.classList.toggle("dark", choice === "dark" || (choice !== "light" && media.matches));
  };
  apply();
  media.addEventListener("change", apply);
})();`;

export function readTheme(): ThemeChoice {
  try {
    const choice = localStorage.getItem(KEY);
    return choice === "light" || choice === "dark" ? choice : "system";
  } catch {
    return "system";
  }
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Storage blocked (private mode): the choice still applies to this page.
  }
  const dark = choice === "dark" || (choice === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
