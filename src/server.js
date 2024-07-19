const express = require("express");
const path = require("path");
const cors = require("cors");
const passwordValidationHandler = require("./util/passwordValidationHandler");
const { app: firebaseApp } = require("./config/firebaseConfig");
const {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} = require("firebase/auth");
const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json()); // Using JSON parsing middleware
app.use(cors()); // Enable CORS for all routes(not safe but it is what it is)
const auth = getAuth(); // firebase authentication instance

// Example users database (replace with actual user handling logic from database later)
const users = [{ email: "user1@test.com", password: "Password!" }];

// Route to handle login
app.post("/login", express.json(), (req, res) => {
  const { email, password } = req.body;
  console.log("Someone tried to login with the email:" + email);
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
      console.log(user);
      return res.json({ message: "Login successful" });
    })
    .catch(() => {
      return res.status(404).json({
        error: `Error: Incorrect username or password. Please try again.`,
      });
    });
});
// Route to handle registration
app.post("/register", express.json(), (req, res) => {
  const { email, password } = req.body;
  console.log("Someone tried to register with the email:" + email);

  const passwordValid = passwordValidationHandler.passwordValidation(password);
  console.log(passwordValid);
  if (!passwordValid) {
    return res.status(400).json({
      error:
        "Error: The string must be at least 8 characters long, contain at least one uppercase letter, and include at least one symbol",
    });
  }

  createUserWithEmailAndPassword(auth, email, password)
    .then((response) => {
      console.log(`User created ${response.user}`);
      // Redirect or respond with success message
      return res.json({ message: "Registration successful!" });
    })
    .catch((err) => {
      // Respond with error message or status indicating account not found
      return res.status(400).json({ error: `Error: ${err.message}` });
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
