/**
 * Demo mode shows the "Demo data" label, lists demo sign-ins on the login page and seeds synthetic leads.
 * On by default only for the local database; a hosted database must opt in with DEMO_MODE=1.
 */
export function isDemo(): boolean {
  const flag = process.env.DEMO_MODE?.trim();
  if (flag) return flag === "1" || flag.toLowerCase() === "true";
  return !process.env.DATABASE_URL?.trim();
}
