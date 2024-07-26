const { initializeApp } = require("firebase/app");
const { getFirestore } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyA016220tkSJrewCbwQVRYlD2d1fNaJ4Zc",
  authDomain: "foodiefriends-658ab.firebaseapp.com",
  databaseURL:
    "https://foodiefriends-658ab-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "foodiefriends-658ab",
  storageBucket: "foodiefriends-658ab.appspot.com",
  messagingSenderId: "210232921141",
  appId: "1:210232921141:web:ef3b41c66c357fc194757c",
  measurementId: "G-SZC9TWLVT8",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
//Initialize Database
const database = getFirestore(app);

module.exports = { app, database };
