const express = require("express");
const path = require("path");
const cors = require("cors");
const passwordValidationHandler = require("./util/passwordValidationHandler");
const { app: firebaseApp, database: db } = require("./config/firebaseConfig");
const {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  deleteUser,
} = require("firebase/auth");
const {
  collection,
  doc,
  addDoc,
  setDoc,
  where,
  query,
  getDocs,
} = require("firebase/firestore");
const usersCollection = collection(db, "users");
const postsCollection = collection(db, "posts");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json()); // Using JSON parsing middleware
app.use(cors()); // Enable CORS for all routes(not safe but it is what it is)
const auth = getAuth(); // firebase authentication instance

// Route to handle login
app.post("/login", express.json(), (req, res) => {
  const { email, password } = req.body;
  console.log("Someone tried to login with the email: " + email);

  const passwordValid = passwordValidationHandler.passwordValidation(password);
  if (!passwordValid) {
    return res.status(400).json({
      error:
        "Error: The string must be at least 8 characters long, contain at least one uppercase letter, and include at least one symbol",
    });
  }

  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      const user = userCredential.user;
      console.log(`User UID: ${user.uid}`);

      // Get the ID token
      return user.getIdToken().then((idToken) => {
        // Create a query to find the user by UID
        const userQuery = query(usersCollection, where("uid", "==", user.uid));

        // Execute the query
        return getDocs(userQuery).then((snapshot) => {
          if (!snapshot.empty) {
            const userData = snapshot.docs[0].data();
            return res.json({
              message: "Login successful",
              user: userData,
              idToken: idToken,
            });
          } else {
            // No matching document found
            return res.status(404).json({
              error: "Error: User details not found in the database.",
            });
          }
        });
      });
    })
    .catch((err) => {
      console.error(`Error: ${err.message}`);
      // Handle errors during Firestore query and sign-in
      return res.status(500).json({
        error: `Unexpected error: ${err.message}`,
      });
    });
});

// Route to handle registration
app.post("/register", express.json(), (req, res) => {
  const { email, password, firstName } = req.body;
  console.log("Someone tried to register with the email: " + email);

  const passwordValid = passwordValidationHandler.passwordValidation(password);
  if (!passwordValid) {
    return res.status(400).json({
      error:
        "Error: The string must be at least 8 characters long, contain at least one uppercase letter, and include at least one symbol",
    });
  }
  // Ensure firstName is present and not undefined
  if (!firstName) {
    return res.status(400).json({
      error: "Error: First name is required.",
    });
  }

  let createdUser;

  createUserWithEmailAndPassword(auth, email, password)
    .then((response) => {
      createdUser = response.user; // Save the user object for later use
      console.log(`User created with UID: ${createdUser.uid}`);

      // Use setDoc to set the document ID to UID
      const userDoc = doc(db, "users", createdUser.uid);
      return setDoc(userDoc, {
        uid: createdUser.uid,
        email: email,
        firstName: firstName,
      });
    })
    .then(() => {
      // Get the ID token after creating the user
      return createdUser.getIdToken().then((idToken) => {
        // Respond with success message and ID token
        return res.json({
          message: "Registration successful!",
          user: {
            uid: createdUser.uid,
            email: email,
            firstName: firstName,
          },
          idToken: idToken,
        });
      });
    })
    .catch((err) => {
      console.error(`Error: ${err.message}`);
      if (createdUser) {
        // If user creation succeeded but document creation failed, delete the user
        deleteUser(createdUser)
          .then(() => {
            console.log("Error: Unexpected error creating database document.");
            return res.status(400).json({ error: `Error: ${err.message}` });
          })
          .catch((deleteErr) => {
            console.error(`Error deleting user: ${deleteErr.message}`);
            return res
              .status(500)
              .json({ error: `Error deleting user: ${deleteErr.message}` });
          });
      } else {
        // Handle errors where user creation itself failed
        return res.status(400).json({ error: `Error: ${err.message}` });
      }
    });
});

app.get("/about", (req, res) => {
  res.json({
    Team: [
      "Gal Rabinovich",
      "Lina Petrovsky",
      "Ilya Karazhya",
      "Sergei Yakima",
      "Mohamed Alfker",
      "David Aronov",
    ],
  });
});
app.get("/ping", (req, res) => {
  res.json("Pong:Team 4");
});

app.listen(PORT, () => {
  console.log(`Server started listening on port: ${PORT}`);
});
