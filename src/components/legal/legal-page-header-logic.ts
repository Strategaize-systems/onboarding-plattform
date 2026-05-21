export function shouldUseRouterBack(referrer: string, currentHost: string): boolean {
  if (!referrer) return false;
  try {
    const referrerUrl = new URL(referrer);
    return referrerUrl.host === currentHost;
  } catch {
    return false;
  }
}
