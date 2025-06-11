const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;

console.log("process.cwd():", process.cwd());
console.log("__dirname:", __dirname);

const DATA_FILE = path.join(__dirname, 'data', 'db.json');
const UPLOADS_BASE_DIR = path.join(__dirname, 'public', 'uploads');
const JWT_SECRET = process.env.JWT_SECRET || 'your-very-strong-jwt-secret-key-change-me';

const ensureBaseDirs = async () => {
    try {
        await fs.mkdir(UPLOADS_BASE_DIR, { recursive: true });
        await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
        console.log("Base directories ensured.");
    } catch (err) {
        console.error("Error ensuring base directories:", err);
    }
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function readData() {
    try {
        await fs.access(DATA_FILE);
        const jsonData = await fs.readFile(DATA_FILE, 'utf-8');
        const parsedData = JSON.parse(jsonData);
        if (!parsedData.users) parsedData.users = [];
        if (!parsedData.adminCredentials) {
             parsedData.adminCredentials = { username: "admin", password: "supersecretpassword" };
        }
        return parsedData;
    } catch (error) {
        console.log("Data file not found or invalid, initializing.");
        const initialData = {
            users: [],
            adminCredentials: { username: "admin", password: "supersecretpassword" }
        };
        await writeData(initialData);
        return initialData;
    }
}
async function writeData(data) {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}
async function deleteUserFiles(userId) {
    const userUploadsPath = path.join(UPLOADS_BASE_DIR, userId);
    try {
        await fs.rm(userUploadsPath, { recursive: true, force: true });
        console.log(`Deleted all files for user: ${userId}`);
    } catch (err) {
        console.error(`Error deleting files for user ${userId}:`, err);
    }
}
async function deleteSingleFile(filePathRelativeToUploadsBase) {
    if (!filePathRelativeToUploadsBase) return;
    const fullPath = path.join(UPLOADS_BASE_DIR, filePathRelativeToUploadsBase);
    try {
        await fs.unlink(fullPath);
        console.log(`Deleted file: ${fullPath}`);
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error(`Error deleting file ${fullPath}:`, err);
        }
    }
}

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err, userPayload) => {
        if (err) {
            console.error("JWT Verification Error:", err.message);
            return res.sendStatus(403);
        }
        req.user = userPayload;
        next();
    });
};

const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        if (!req.user || !req.user.id) {
            return cb(new Error("User not authenticated or ID missing for upload"), null);
        }
        const userId = req.user.id;
        const userUploadsPath = path.join(UPLOADS_BASE_DIR, userId);
        const targetDir = file.fieldname === "previewImageFile"
            ? path.join(userUploadsPath, 'previews')
            : path.join(userUploadsPath, 'files');
        try {
            await fs.mkdir(targetDir, { recursive: true });
            cb(null, targetDir);
        } catch (err) {
            cb(err, null);
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        const sanitizedOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '');
        cb(null, uniqueSuffix + '-' + sanitizedOriginalName + extension);
    }
});
const upload = multer({ storage: storage });

app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required." });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters long." });
    }
    const data = await readData();
    if (data.users.find(u => u.username === username)) {
        return res.status(409).json({ message: "Username already exists." });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: `user-${uuidv4()}`,
            username: username,
            password: hashedPassword,
            subpages: []
        };
        data.users.push(newUser);
        await writeData(data);
        await fs.mkdir(path.join(UPLOADS_BASE_DIR, newUser.id, 'files'), { recursive: true });
        await fs.mkdir(path.join(UPLOADS_BASE_DIR, newUser.id, 'previews'), { recursive: true });
        res.status(201).json({ message: "User registered successfully.", userId: newUser.id, username: newUser.username });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ message: "Error registering user." });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required." });
    }
    const data = await readData();
    const user = data.users.find(u => u.username === username);
    if (!user) {
        return res.status(401).json({ message: "Invalid credentials." });
    }
    if (!user.password) { // Check if user has a password (might be admin-created without one)
        console.warn(`User ${username} attempted login but has no password set.`);
        return res.status(401).json({ message: "Account not configured for login. Please contact admin or re-register if necessary." });
    }
    try {
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials." });
        }
        const tokenPayload = { id: user.id, username: user.username };
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, userId: user.id, username: user.username });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Error logging in." });
    }
});

const adminAuth = async (req, res, next) => {
    const { admin_username, admin_password } = req.headers;
    const data = await readData();
    if (admin_username === data.adminCredentials.username && admin_password === data.adminCredentials.password) {
        next();
    } else {
        res.status(401).json({ message: "Admin authorization failed." });
    }
};

app.get('/api/me/data', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const data = await readData();
    const user = data.users.find(u => u.id === userId);
    if (!user) {
        return res.status(404).json({ message: "User data not found for authenticated user." });
    }
    res.json({ subpages: user.subpages || [] });
});

app.post('/api/me/subpages', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ message: "Subpage name is required." });
    }
    const data = await readData();
    const user = data.users.find(u => u.id === userId);
    if (!user) {
        return res.status(404).json({ message: "Authenticated user not found." });
    }
    if (!user.subpages) user.subpages = [];
    const newSubpage = { id: `subpage-${Date.now()}`, name: name, posts: [] };
    user.subpages.push(newSubpage);
    await writeData(data);
    res.status(201).json(newSubpage);
});

app.delete('/api/me/subpages/:subpageId', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { subpageId } = req.params;
    const data = await readData();
    const user = data.users.find(u => u.id === userId);
    if (!user || !user.subpages) {
        return res.status(404).json({ message: "User or subpages not found." });
    }
    const subpageIndex = user.subpages.findIndex(sp => sp.id === subpageId);
    if (subpageIndex === -1) {
        return res.status(404).json({ message: "Subpage not found." });
    }
    const subpageToDelete = user.subpages[subpageIndex];
    for (const post of subpageToDelete.posts) {
        if (post.previewImage) await deleteSingleFile(post.previewImage.substring('/uploads/'.length));
        if (post.filePath) await deleteSingleFile(post.filePath.substring('/uploads/'.length));
    }
    user.subpages.splice(subpageIndex, 1);
    await writeData(data);
    res.status(200).json({ message: "Subpage deleted." });
});

// The updated route handler
app.post('/api/me/subpages/:subpageId/posts', authenticateToken, upload.fields([
    { name: 'previewImageFile', maxCount: 1 },
    { name: 'mainFile', maxCount: 1 }
]), async (req, res) => {
    const userId = req.user.id;
    const { subpageId } = req.params;
    
    // --- CHANGE 1: Get the new 'url' field from the request body ---
    const { title, description, url } = req.body;
    
    // --- CHANGE 2: Safely access the uploaded files ---
    const previewImageFile = req.files && req.files.previewImageFile ? req.files.previewImageFile[0] : null;
    const mainFile = req.files && req.files.mainFile ? req.files.mainFile[0] : null;

    if (!title || !description) {
        return res.status(400).json({ message: "Title and description are required." });
    }

    // --- CHANGE 3: Update the validation logic ---
    // // Now, we require either a file OR a URL, not necessarily a file.
    // if (!mainFile && !url) {
    //     // Cleanup any preview image that might have been uploaded
    //     if (previewImageFile) {
    //         await deleteSingleFile(path.join(userId, 'previews', previewImageFile.filename));
    //     }
    //     return res.status(400).json({ message: "A main file or a URL is required." });
    // }

    const data = await readData();
    const user = data.users.find(u => u.id === userId);

    if (!user || !user.subpages) {
        // Cleanup any uploaded files if the user/subpage structure is broken
        if (mainFile) await deleteSingleFile(path.join(userId, 'files', mainFile.filename));
        if (previewImageFile) await deleteSingleFile(path.join(userId, 'previews', previewImageFile.filename));
        return res.status(404).json({ message: "User or subpage data structure not found." });
    }

    const subpage = user.subpages.find(sp => sp.id === subpageId);
    if (!subpage) {
        // Cleanup any uploaded files if the subpage is not found
        if (mainFile) await deleteSingleFile(path.join(userId, 'files', mainFile.filename));
        if (previewImageFile) await deleteSingleFile(path.join(userId, 'previews', previewImageFile.filename));
        return res.status(404).json({ message: "Subpage not found." });
    }

    // --- CHANGE 4: Create the new post object with optional properties ---
    const newPost = {
        id: `post-${Date.now()}`,
        title,
        description,
        previewImage: previewImageFile ? `/uploads/${userId}/previews/${previewImageFile.filename}` : null,
        filePath: mainFile ? `/uploads/${userId}/files/${mainFile.filename}` : null, // Will be null if no file
        url: url || null // Will be null if no URL was provided
    };

    subpage.posts.push(newPost);
    await writeData(data);

    res.status(201).json(newPost);
});

app.delete('/api/me/subpages/:subpageId/posts/:postId', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { subpageId, postId } = req.params;
    const data = await readData();
    const user = data.users.find(u => u.id === userId);
    if (!user || !user.subpages) return res.status(404).json({ message: "User/subpages not found." });
    const subpage = user.subpages.find(sp => sp.id === subpageId);
    if (!subpage) return res.status(404).json({ message: "Subpage not found." });
    const postIndex = subpage.posts.findIndex(p => p.id === postId);
    if (postIndex === -1) return res.status(404).json({ message: "Post not found." });
    const postToDelete = subpage.posts[postIndex];
    if (postToDelete.previewImage) await deleteSingleFile(postToDelete.previewImage.substring('/uploads/'.length));
    if (postToDelete.filePath) await deleteSingleFile(postToDelete.filePath.substring('/uploads/'.length));
    subpage.posts.splice(postIndex, 1);
    await writeData(data);
    res.status(200).json({ message: "Post deleted." });
});



app.put('/api/me/subpages/:subpageId/posts/:postId', authenticateToken, upload.fields([
    { name: 'previewImageFile', maxCount: 1 },
    { name: 'mainFile', maxCount: 1 }
]), async (req, res) => {
    try {
        const userId = req.user.id;
        const { subpageId, postId } = req.params;
        // Get the new `clearFile` flag from the body
        const { title, description, url, clearFile } = req.body;

        if (!title || !description) {
            return res.status(400).json({ message: "Title and description are required." });
        }

        const data = await readData();
        const user = data.users.find(u => u.id === userId);
        if (!user) return res.status(404).json({ message: "User not found." });

        const subpage = user.subpages.find(sp => sp.id === subpageId);
        if (!subpage) return res.status(404).json({ message: "Subpage not found." });

        const postIndex = subpage.posts.findIndex(p => p.id === postId);
        if (postIndex === -1) return res.status(404).json({ message: "Post not found." });

        const postToUpdate = subpage.posts[postIndex];

        // --- Handle Preview Image Update ---
        if (req.files && req.files.previewImageFile) {
            if (postToUpdate.previewImage) {
                const oldPreviewFilename = path.basename(postToUpdate.previewImage);
                await deleteSingleFile(path.join(userId, 'previews', oldPreviewFilename));
            }
            postToUpdate.previewImage = `/uploads/${userId}/previews/${req.files.previewImageFile[0].filename}`;
        }

        // --- NEW STREAMLINED FILE/URL LOGIC ---
        // Case 1: A new main file is uploaded.
        if (req.files && req.files.mainFile) {
            // Delete the old file if it exists.
            if (postToUpdate.filePath) {
                const oldMainFilename = path.basename(postToUpdate.filePath);
                await deleteSingleFile(path.join(userId, 'files', oldMainFilename));
            }
            // Set the new file path and clear the URL.
            postToUpdate.filePath = `/uploads/${userId}/files/${req.files.mainFile[0].filename}`;
            postToUpdate.url = null;
        } 
        // Case 2: No new file is uploaded, but the user explicitly wants to switch to a URL.
        else if (clearFile === 'true' && postToUpdate.filePath) {
            const oldMainFilename = path.basename(postToUpdate.filePath);
            await deleteSingleFile(path.join(userId, 'files', oldMainFilename));
            postToUpdate.filePath = null;
            postToUpdate.url = url || null;
        }
        // Case 3: No new file, just update the URL.
        else {
            postToUpdate.url = url || null;
        }

        // Update title and description
        postToUpdate.title = title;
        postToUpdate.description = description;

        await writeData(data);
        res.status(200).json(postToUpdate);

    } catch (error) {
        console.error("Error in PUT /posts:", error);
        res.status(500).json({ message: "An internal server error occurred while updating the post." });
    }
});





// === ADMIN API Endpoints ===
app.get('/api/admin/users', adminAuth, async (req, res) => {
    const data = await readData();
    // Admin sees username and ID. Password hash is not sent.
    res.json(data.users.map(u => ({ id: u.id, username: u.username })));
});

/* POST /api/admin/users is removed/commented out as user creation is via self-registration
app.post('/api/admin/users', adminAuth, async (req, res) => {
    // This route is now problematic as it doesn't handle password hashing
    // and users created this way cannot log in with the new system.
    // Directing admins to have users self-register is preferred.
    return res.status(405).json({ message: "User creation via admin panel is disabled. Please use self-registration." });
});
*/

app.delete('/api/admin/users/:userId', adminAuth, async (req, res) => {
    const { userId } = req.params;
    const data = await readData();
    const userIndex = data.users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
        return res.status(404).json({ message: "User not found." });
    }
    await deleteUserFiles(userId);
    data.users.splice(userIndex, 1);
    await writeData(data);
    res.status(200).json({ message: "User and their data deleted successfully by admin." });
});

ensureBaseDirs().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`IMPORTANT: JWT_SECRET is set to a default. Change this for production and use an environment variable.`);
        readData();
    });
}).catch(err => {
    console.error("Failed to start server:", err);
    process.exit(1);
});