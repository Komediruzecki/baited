/** Only named Studio destinations survive sign-in. Never forward an arbitrary return URL. */
export function studioTabFromPath(pathname: string): 'studio' | 'cards' {
  return pathname === '/studio/cards' || pathname === '/studio/cards/' ? 'cards' : 'studio';
}

export function studioPathFromTab(tab: string): '/studio' | '/studio/cards' {
  return tab === 'cards' ? '/studio/cards' : '/studio';
}

export function studioSignInPath(pathname: string): string {
  return studioTabFromPath(pathname) === 'cards' ? '/auth/twitch?returnTo=cards' : '/auth/twitch';
}
