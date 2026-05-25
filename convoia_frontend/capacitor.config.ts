import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.convoia.mobile',
  appName: 'ConvoiaAI',
  webDir: 'dist',

  // Server — in production the app loads from the built dist folder.
  // During development you can point to your local Vite dev server:
  // server: { url: 'http://192.168.x.x:5173', cleartext: true },

  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#0D0D0D',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    GoogleAuth: {
      // The Web Client ID from Google Cloud Console — the idToken returned by
      // GoogleAuth.signIn() is signed for this audience, so the backend can
      // verify it with the same OAuth2Client it already uses for the web flow.
      // A separate *Android* OAuth client ID must be created in GCP with the
      // app's package + SHA-1 fingerprint — that one isn't referenced here
      // (Google Play Services picks it up automatically from the package match).
      clientId: '793440624394-09248vssleqnt5d475l2j81eesaorgcl.apps.googleusercontent.com',
      serverClientId: '793440624394-09248vssleqnt5d475l2j81eesaorgcl.apps.googleusercontent.com',
      scopes: ['profile', 'email'],
      forceCodeForRefreshToken: true,
    },
    StatusBar: {
      style: 'DARK',             // light text for dark background
      backgroundColor: '#0D0D0D',
      overlaysWebView: false,
    },
    Keyboard: {
      // 'native' = Android adjustResize: the WebView itself shrinks to the area
      // above the keyboard, so CSS 100dvh/100vh become keyboard-aware on their
      // own. The old 'body' mode JS-resized document.body, which double-counted
      // the keyboard height against our dvh-based layouts (the "twice the
      // keyboard space" gap) and clipped the un-scrollable login form.
      resize: 'native',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },

  // Android-specific
  android: {
    allowMixedContent: false,    // HTTPS only in production — Play Store requirement
    backgroundColor: '#0D0D0D',
  },

  // iOS-specific
  ios: {
    backgroundColor: '#0D0D0D',
    contentInset: 'automatic',   // respects safe areas (notch, home indicator)
    preferredContentMode: 'mobile',
    scheme: 'ConvoiaAI',         // deep link scheme: convoiaai://
  },
};

export default config;
