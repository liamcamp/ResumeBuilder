import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, Timestamp, doc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export interface ResumeHistoryItem {
  id?: string;
  targetText: string;
  resumeHtml: string;
  timestamp: Date;
}

export async function saveResumeToHistory(targetText: string, resumeHtml: string): Promise<void> {
  await addDoc(collection(db, 'resumeHistory'), {
    targetText,
    resumeHtml,
    timestamp: Timestamp.now()
  });
}

export async function getResumeHistory(): Promise<ResumeHistoryItem[]> {
  const q = query(collection(db, 'resumeHistory'), orderBy('timestamp', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    targetText: doc.data().targetText,
    resumeHtml: doc.data().resumeHtml,
    timestamp: doc.data().timestamp.toDate()
  }));
}

export async function saveAboutMe(content: string): Promise<void> {
  await setDoc(doc(db, 'settings', 'aboutMe'), {
    content,
    updatedAt: Timestamp.now()
  });
}

export async function getAboutMe(): Promise<string> {
  const docSnap = await getDoc(doc(db, 'settings', 'aboutMe'));
  if (docSnap.exists()) {
    return docSnap.data().content || '';
  }
  return '';
}
