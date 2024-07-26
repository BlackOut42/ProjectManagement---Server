const admin = require("firebase-admin");
const serviceAccount = require("/etc/secrets/firebaseAdminSDK.json"); //this is for render, for local development change to local path.

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
