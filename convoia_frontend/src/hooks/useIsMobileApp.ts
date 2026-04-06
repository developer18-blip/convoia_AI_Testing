import { isNative } from '../lib/capacitor'

/**
 * Returns true when running inside the Capacitor native shell (Android/iOS).
 * Desktop users on small screens still see the desktop UI.
 * This is a constant — no re-renders, no state, no listeners.
 */
export function useIsMobileApp(): boolean {
  return isNative
}
