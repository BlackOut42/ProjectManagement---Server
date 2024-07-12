const express = require("express");
const path = require("path");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json()); // Using JSON parsing middleware
app.use(cors()); // Enable CORS for all routes(not safe but it is what it is)

// Example users database (replace with actual user handling logic from database later)
const users = [{ username: "user1", password: "Password!" }];

// Route to handle login
app.post("/login", express.json(), (req, res) => {
  const { username, password } = req.body;
  console.log("Someone tried to login with the username:" + username);
  // Simulated login logic (replace with actual user authentication, i.e a request to the database and unhashing password etc..)
  const user = users.find(
    (user) => user.username === username && user.password === password
  );

  if (user) {
    // Redirect or respond with success message
    res.json({ message: "Login successful" });
  } else {
    // Respond with error message or status indicating account not found
    res.status(404).json({ error: "Account not found" });
  }
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
