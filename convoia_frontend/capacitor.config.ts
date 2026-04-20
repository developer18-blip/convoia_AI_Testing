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
      clientId: '358969037364-srrjvmqlliir7ae72oic2phqake26sde.apps.googleusercontent.com',
      serverClientId: '358969037364-srrjvmqlliir7ae72oic2phqake26sde.apps.googleusercontent.com',
      scopes: ['profile', 'email'],
      forceCodeForRefreshToken: true,
    },
    StatusBar: {
      style: 'DARK',             // light text for dark background
      backgroundColor: '#0D0D0D',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'body',            // resize viewport when keyboard opens (critical for chat input)
      resizeOnFullScreen: true,
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
