const express = require("express");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = 8000;

const uploadsDir = path.join(__dirname, "uploads");
const metadataFilePath = path.join(__dirname, "data", "metadata.json");

// Ensure necessary directories exist
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const sessionsDir = path.join(__dirname, "sessions");
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir);
}

// Load metadata from file
function loadMetadata() {
  try {
    if (fs.existsSync(metadataFilePath)) {
      return JSON.parse(fs.readFileSync(metadataFilePath, "utf-8"));
    }
  } catch (error) {
    console.error("Error loading metadata:", error);
  }
  return {};
}

// Save metadata to file
function saveMetadata() {
  try {
    fs.writeFileSync(metadataFilePath, JSON.stringify(fileMetadata, null, 2));
  } catch (error) {
    console.error("Error saving metadata:", error);
  }
}

// Load metadata into memory
const fileMetadata = loadMetadata();

// Load users from JSON file
const users = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8"));

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true })); // For parsing URL-encoded bodies
app.use(express.json()); // For parsing JSON bodies
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(
  session({
    store: new FileStore({ path: sessionsDir }),
    secret: "your-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // Set to true if using HTTPS
  })
);

// Configure multer for file uploads
const upload = multer({
  dest: uploadsDir, // Destination folder for uploaded files
  limits: { fileSize: 10 * 1024 * 1024 }, // Limit file size to 10MB
});

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
  res.render("login"); // Create login.ejs
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  // Check if the user exists in the JSON file
  const user = users.find((u) => u.username === username && u.password === password);

  if (user) {
    req.session.userId = user.id; // Store the user ID in the session
    res.redirect("/dashboard");
  } else {
    res.status(401).send("Invalid username or password");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// Route to render the dashboard with uploaded files
app.get("/dashboard", checkAuth, (req, res) => {
  const user = users.find((u) => u.id === req.session.userId);
  if (!user) {
    return res.status(400).send("Invalid session. Please log in again.");
  }

  const files = Object.entries(fileMetadata)
    .filter(([_, metadata]) => metadata.owner === req.session.userId)
    .map(([id, metadata]) => ({
      id,
      name: id,
      size: metadata.size,
      type: metadata.type,
      owner: metadata.owner,
    }));

  res.render("dashboard", { user, files, users });
});

// Route to upload a file
app.post("/upload", upload.single("file"), (req, res) => {
  const file = req.file;
  const owner = req.session.userId;

  if (!file) {
    return res.status(400).send("No file uploaded.");
  }

  const originalName = file.originalname;
  const newFilePath = path.join(uploadsDir, originalName);

  try {
    fs.renameSync(file.path, newFilePath);
    fileMetadata[originalName] = {
      owner,
      size: file.size,
      type: path.extname(originalName),
    };
    saveMetadata();
    res.redirect("/dashboard");
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).send("Error uploading file.");
  }
});

// Route to transfer ownership
app.post("/transfer/:id", checkAuth, (req, res) => {
  const { newOwner } = req.body; // The ID of the new owner
  const fileId = req.params.id;

  try {
    // Validate the new owner
    if (!newOwner) {
      return res.status(400).json({ error: "New owner ID is required." });
    }

    const userExists = users.find((u) => u.id === newOwner);
    if (!userExists) {
      return res.status(400).json({ error: "Invalid user ID." });
    }

    const metadata = fileMetadata[fileId];
    if (!metadata) {
      return res.status(404).json({ error: "File not found." });
    }

    // Only the current owner can transfer ownership
    if (metadata.owner !== req.session.userId) {
      return res.status(403).json({ error: "You are not authorized to transfer this file." });
    }

    // Transfer ownership
    metadata.owner = newOwner;
    saveMetadata();

    res.status(200).json({ message: "File transferred successfully." });
  } catch (error) {
    console.error("Error transferring file:", error);
    res.status(500).json({ error: "An error occurred while transferring the file." });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unexpected error:", err);
  res.status(500).send("An unexpected error occurred.");
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

