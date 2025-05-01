const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = 8000;

const uploadsDir = path.join(__dirname, "uploads");

// In-memory metadata storage
const fileMetadata = {};

// Helper function to get uploaded files and their metadata
function getUploadedFiles(userId) {
  const files = fs.readdirSync(uploadsDir).map(file => {
    const metadata = fileMetadata[file] || { owner: userId, sharedTo: [] };

    return {
      id: file, // Use the file name as the unique ID
      name: file, // File name stored in the uploads folder
      size: metadata.size, // File size in bytes
      type: metadata.type, // File type (extension)
      owner: metadata.owner, // Owner of the file
      sharedTo: metadata.sharedTo || [], // Users the file is shared with
    };
  });

  // Filter files to show only those owned by or shared with the logged-in user
  return files.filter(file => file.owner === userId || file.sharedTo.includes(userId));
}

// Load users from JSON file
const users = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8"));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(session({
  secret: "your-secret-key",
  resave: false,
  saveUninitialized: true,
}));

// Configure multer for file uploads
const upload = multer({
  dest: path.join(__dirname, "uploads"), // Destination folder for uploaded files
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
  res.render("login"); // make login.ejs
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  // Check if the user exists in the JSON file
  const user = users.find(u => u.username === username && u.password === password);

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
  const user = users.find(u => u.id === req.session.userId); // Get the logged-in user
  const files = getUploadedFiles(req.session.userId); // Get files owned by the user
  res.render("dashboard", { user, files, users }); // Pass the users array to the template
});

// Route to download a file
app.get("/download/:id", checkAuth, (req, res) => {
  const filePath = path.join(uploadsDir, req.params.id);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send("File not found");
  }
});

// Route to delete a file
app.post("/delete/:id", checkAuth, (req, res) => {
  const filePath = path.join(uploadsDir, req.params.id);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    delete fileMetadata[req.params.id]; // Remove metadata from memory
    res.redirect("/dashboard");
  } else {
    res.status(404).send("File not found");
  }
});

// Route to transfer ownership
app.post("/transfer/:id", checkAuth, (req, res) => {
  const { newOwner } = req.body;
  const fileId = req.params.id;

  // Update file metadata (e.g., owner)
  const metadata = fileMetadata[fileId];
  if (metadata) {
    metadata.owner = newOwner; // Update the owner
    res.redirect("/dashboard");
  } else {
    res.status(404).send("File not found");
  }
});

// Route to handle file uploads
app.post("/upload", upload.single("file"), (req, res) => {
  const file = req.file; // File metadata from multer
  const owner = req.session.userId; // Owner is the logged-in user

  if (!file) {
    return res.status(400).send("No file uploaded.");
  }

  // Rename the file to its original name
  const originalName = file.originalname;
  const newFilePath = path.join(uploadsDir, originalName);
  fs.renameSync(file.path, newFilePath);

  // Save metadata in memory
  fileMetadata[originalName] = {
    owner,
    sharedTo: [],
    size: file.size,
    type: path.extname(originalName),
  };

  console.log("File uploaded:");
  console.log(`- Name: ${originalName}`);
  console.log(`- Type: ${file.mimetype}`);
  console.log(`- Size: ${file.size} bytes`);
  console.log(`- Owner: ${owner}`);

  // Redirect back to the dashboard
  res.redirect("/dashboard");
});

// Route to share a file
app.post("/share/:id", checkAuth, (req, res) => {
  const fileId = req.params.id;
  const { sharedTo } = req.body; // Array of user IDs to share with
  const metadata = fileMetadata[fileId];

  if (metadata) {
    // Only the owner can share the file
    if (metadata.owner !== req.session.userId) {
      return res.status(403).send("You are not authorized to share this file.");
    }

    // Update the sharedTo field
    metadata.sharedTo = Array.isArray(sharedTo) ? sharedTo : [sharedTo];
    res.redirect("/dashboard");
  } else {
    res.status(404).send("File not found.");
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});