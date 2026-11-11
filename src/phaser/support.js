export const TIP_URL = 'https://www.buymeacoffee.com/jd4rider'

/**
 * Open the arcade tip jar. The drop-in client owns the URL and the new-tab
 * handling; this fallback keeps the button working in a build that loads
 * without it (a bare static copy or an old Electron shell).
 */
export function openTipJar() {
  const arcade = typeof window === 'undefined' ? null : window.LittleJoyArcade
  if (arcade?.tipJar?.open) {
    arcade.tipJar.open()
    return
  }
  if (typeof window !== 'undefined') window.open(TIP_URL, '_blank', 'noopener,noreferrer')
}
