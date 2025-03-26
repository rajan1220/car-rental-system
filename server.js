require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const bcrypt = require("bcrypt");
const User = require("./models/User");

const app = express();
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");


app.use(
    session({
        secret: "secretkey",
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false },
    })
);

// Connect to MongoDB
mongoose.connect("mongodb://127.0.0.1:27017/car-rental", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Connection Failed:", err));

// Home Route
app.get("/", (req, res) => {
    res.render("index", { user: req.session.user });
});

// Register Route
app.get("/register", (req, res) => {
    res.render("register");
});

app.post("/register", async (req, res) => {
    const { name, email, password } = req.body;
    const userExists = await User.findOne({ email });
    if (userExists) return res.send("User already exists!");

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();
    res.redirect("/login");
});

// Login Route
app.get("/login", (req, res) => {
    res.render("login");
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.send("❌ User Not Found!");
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.send("❌ Incorrect Password!");

    req.session.user = user;
    res.redirect("/dashboard");
});

// Dashboard (Protected Route)
app.get("/dashboard", (req, res) => {
    if (!req.session.user) return res.redirect("/login");
    res.render("dashboard", { user: req.session.user });
});

// Logout
app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/");
});

// Start Server
app.listen(3000, () => console.log("🚀 Server running on http://localhost:3000"));
