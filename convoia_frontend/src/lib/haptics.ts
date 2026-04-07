/**
 * Haptic feedback for mobile.
 * No-ops silently on web/desktop.
 */
import { isNative } from './capacitor'

async function getHaptics(): Promise<any> {
  if (!isNative) return null
  try {
    const mod = await import(/* @vite-ignore */ '@capacitor/' + 'haptics')
    return mod.Haptics
  } catch { return null }
}

/** Light tap — for button presses, chip selections */
export async function hapticLight() {
  const H = await getHaptics()
  if (H) try { await H.impact({ style: 'LIGHT' }) } catch { /* silent */ }
}

/** Medium tap — for toggle switches, drag */
export async function hapticMedium() {
  const H = await getHaptics()
  if (H) try { await H.impact({ style: 'MEDIUM' }) } catch { /* silent */ }
}

/** Success notification — for purchases, login success */
export async function hapticSuccess() {
  const H = await getHaptics()
  if (H) try { await H.notification({ type: 'SUCCESS' }) } catch { /* silent */ }
}

/** Error notification — for failed auth, errors */
export async function hapticError() {
  const H = await getHaptics()
  if (H) try { await H.notification({ type: 'ERROR' }) } catch { /* silent */ }
}
