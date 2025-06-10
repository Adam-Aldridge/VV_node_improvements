require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const app = express();

const port = process.env.PORT || 8000;

// --- Middleware ---
app.use(helmet());
app.use(cors({ credentials: true, origin: 'http://localhost:3000' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static files from the 'public' directory
app.use(express.static('public'));

// --- Database Connection ---
require('./server/config/mongoose.config');

// --- Routes ---
app.use('/api/users', require('./server/routes/user.routes'));
app.use('/api/vibes', require('./server/routes/vibe.routes'));

// --- Server Listening ---
app.listen(port, () => console.log(`Listening on port: ${port}`));