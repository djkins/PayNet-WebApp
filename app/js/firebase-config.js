// Paste your Firebase web app config here (Firebase console > Project settings > Your apps > Web app).
// `npm run setup` fills this in for you. While apiKey is the placeholder, the app runs in Demo mode,
// keeping data in this browser so you can try every feature without a backend.
export const firebaseConfig = {
  "apiKey": "AIzaSyBBMGAkY-jNxvVIoWedjKwAFfK24Fpsh4c",
  "authDomain": "umconnect-e455a.firebaseapp.com",
  "projectId": "umconnect-e455a",
  "storageBucket": "umconnect-e455a.firebasestorage.app",
  "messagingSenderId": "692789716239",
  "appId": "1:692789716239:web:386980b6d1f3ab5c4c0a7a"
};

// Emails that get MPP admin access on day one. Keep this in sync with bootstrapAdmins() in firestore.rules
// (`npm run setup` updates both). More MPP reviewers can be added later in the app under Settings.
export const mppBootstrapEmails = ['admin@umconnect-e455a.web.app'];
