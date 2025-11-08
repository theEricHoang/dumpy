// Load env variables from common filenames so Expo bundler can inline EXPO_PUBLIC_*
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const projectRoot = __dirname;
const searchRoots = [projectRoot, path.join(projectRoot, '..')];
const candidates = (
  [process.env.ENVFILE, '.env.local', process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : undefined, '.env.development', '.env']
    .filter(Boolean) as string[]
);

let loadedEnv: string | null = null;
for (const root of searchRoots) {
  for (const file of candidates) {
    const full = path.join(root, file);
    if (fs.existsSync(full)) {
      dotenv.config({ path: full });
      loadedEnv = full;
      // eslint-disable-next-line no-console
      console.log(`[env] Loaded ${file} from ${root}`);
      break;
    }
  }
  if (loadedEnv) break;
}

// Base from app.json if present so Expo Doctor sees we're using it
let base: any = {};
try {
  // Prefer require so Expo Doctor can detect direct usage of app.json
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  base = require('./app.json');
} catch {
  const appJsonPath = path.join(projectRoot, 'app.json');
  if (fs.existsSync(appJsonPath)) {
    base = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  }
}

const config = {
  ...base,
  expo: {
    ...(base as any).expo,
    // Explicit config (these override app.json when both exist)
    name: 'frontend',
    slug: 'frontend',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'frontend',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: { supportsTablet: true },
    android: {
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png'
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false
    },
    web: { output: 'static', favicon: './assets/images/favicon.png' },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: { backgroundColor: '#000000' }
        }
      ],
      'expo-font',
      'expo-video'
    ],
    experiments: { typedRoutes: true, reactCompiler: true },
    extra: {
      // These remain available via process.env.* (Expo inlines EXPO_PUBLIC_* automatically)
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      // Backend base URL (set in .env as EXPO_PUBLIC_API_BASE=https://your-backend-host)
      EXPO_PUBLIC_API_BASE: process.env.EXPO_PUBLIC_API_BASE
    }
  }
};

export default config;
