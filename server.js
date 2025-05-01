// filepath: c:\Users\Jolo\Desktop\asg_owner\server.js
const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 8000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(session({
  secret: "your-secret-key",
  resave: false,
  saveUninitialized: true,
}));

// Set EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Simple middleware to check if user is logged in
function checkAuth(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.redirect("/login");
  }
}

// Routes
app.get("/", (req, res) => {
  if (req.session.userId) return res.redirect("/dashboard");
  res.redirect("/login");
});

app.get("/login", (req, res) => {
  res.render("login"); // make login.ejs
});

app.post("/login", (req, res) => {
  const { username } = req.body;
  // Fake login, for prototype
  req.session.userId = username;
  res.redirect("/dashboard");
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

app.get("/dashboard", checkAuth, (req, res) => {
  res.render("dashboard", { userId: req.session.userId }); // make dashboard.ejs
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});