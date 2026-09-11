// firebase-config.js
// Firebase Web SDK project config for "sattva-jnana".
//
// Note on security: this object is NOT a secret credential — Firebase's own
// docs confirm it's safe to ship in client-side code, because it only tells
// the SDK which project to talk to. It does not grant access by itself.
// Actual access control is enforced server-side by:
//   1. Firestore/Storage Security Rules (who can read/write which documents)
//   2. Firebase Authentication (who is signed in, and as what role)
//   3. Optionally, Firebase App Check (blocks traffic from non-approved apps)
// Moving this into its own file keeps the codebase tidy and makes it easy to
// swap configs per environment (dev/staging/prod) — but it does not, by
// itself, make the app more secure. Lock down your Security Rules for that.

export const firebaseConfig = {
  apiKey: "AIzaSyB1CiVhD2DgupU-_9oDeRFb41SXnXt8tl4",
  authDomain: "sattva-jnana.firebaseapp.com",
  projectId: "sattva-jnana",
  storageBucket: "sattva-jnana.firebasestorage.app",
  messagingSenderId: "801759229222",
  appId: "1:801759229222:web:788f92b6f036aae836fde7"
};
