require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const session = require("express-session");
const User = require("./models/User");

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Setup
app.use(
    session({
        secret: "mysecretkey",
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false } // Set to true if using HTTPS
    })
);

// Connect to MongoDB
mongoose.connect("mongodb://127.0.0.1:27017/car-rental-system", {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("✅ Connected to MongoDB"))
.catch(err => console.error("❌ MongoDB Connection Error:", err));

// Home Route
app.get("/", (req, res) => {
    res.send("🚗 Welcome to Car Rental System API");
});

// Register API
app.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check if user already exists
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).send("❌ User already exists!");
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Save new user
        user = new User({ name, email, password: hashedPassword });
        await user.save();

        res.status(201).send("✅ User registered successfully!");
    } catch (error) {
        console.error(error);
        res.status(500).send("❌ Error Registering User");
    }
});

// Login API
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).send("❌ User not found!");
        }

        // Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).send("❌ Incorrect password!");
        }

        // Store user session
        req.session.user = user;
        res.send("✅ Login successful!");
    } catch (error) {
        console.error(error);
        res.status(500).send("❌ Error Logging In");
    }
});

// Logout API
app.get("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).send("❌ Error Logging Out");
        }
        res.send("✅ Logout successful!");
    });
});

// Protected Route Example (Only logged-in users can access)
app.get("/dashboard", (req, res) => {
    if (!req.session.user) {
        return res.status(401).send("❌ Unauthorized! Please log in.");
    }
    res.send(`Welcome ${req.session.user.name} to your Dashboard!`);
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
