const User = require('../models/user.model');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

module.exports.registerUser = asyncHandler(async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        res.status(400);
        throw new Error('Please add all fields');
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
        res.status(400);
        throw new Error('User already exists');
    }

    const user = await User.create({ username, email, password });

    if (user) {
        const token = generateToken(user._id);
        res.cookie('usertoken', token, { httpOnly: true });
        res.status(201).json({ _id: user.id, username: user.username, email: user.email });
    } else {
        res.status(400);
        throw new Error('Invalid user data');
    }
});

module.exports.loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && (await bcrypt.compare(password, user.password))) {
        const token = generateToken(user._id);
        res.cookie('usertoken', token, { httpOnly: true });
        res.status(200).json({ _id: user.id, username: user.username, email: user.email });
    } else {
        res.status(401);
        throw new Error('Invalid credentials');
    }
});

module.exports.logoutUser = asyncHandler(async (req, res) => {
    res.clearCookie('usertoken');
    res.status(200).json({ message: 'Logged out successfully' });
});