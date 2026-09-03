// Firebase initialization for PaintShip Phone (OTP) Authentication.
// All values come from Vite environment variables (VITE_FIREBASE_*).
import { initializeApp, getApps } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId
);

// Prevent re-initialization on Vite HMR (Hot Module Replacement)
export const app = firebaseConfigured
  ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0])
  : null;

export const auth = firebaseConfigured ? getAuth(app) : null;

// Firebase Auth persistence
if (auth) {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    if (import.meta.env.DEV) console.warn("Firebase Auth persistence error:", err);
  });
}