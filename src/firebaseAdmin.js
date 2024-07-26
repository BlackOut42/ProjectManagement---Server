const admin = require("firebase-admin");
const serviceAccount = require("./config/firebaseAdminSDK.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
