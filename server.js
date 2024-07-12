const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 5000;
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
