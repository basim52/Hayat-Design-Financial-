import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import firebaseConfig from '@/firebase-applet-config.json';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

export async function initFirebase() {
  if (app) return { app, db, auth };
  
  try {
    console.log("Initializing Firebase with config:", firebaseConfig.projectId);
    if (firebaseConfig && firebaseConfig.apiKey) {
      app = initializeApp(firebaseConfig);
      db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
      auth = getAuth(app);
      console.log("Firebase initialized successfully");
    } else {
      console.warn("Firebase config is missing apiKey");
    }
    return { app, db, auth };
  } catch (e) {
    console.error("Firebase initialization failed:", e);
    return { app: null, db: null, auth: null };
  }
}

// Exported for components that can handle nulls initially
export { db, auth };
