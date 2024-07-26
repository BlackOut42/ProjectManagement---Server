const admin = require("firebase-admin");
const path = require("path");

// Path to the Firebase Admin SDK JSON file
const serviceAccountPath = path.join(__dirname, "firebaseAdminSDK.json");

// Initialize Firebase Admin with service account credentials
admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
});

module.exports = admin;
