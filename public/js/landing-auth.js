document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginContainer = document.getElementById('login-container');
    const registerContainer = document.getElementById('register-container');
    const showRegisterLink = document.getElementById('show-register');
    const showLoginLink = document.getElementById('show-login');
    const messageDiv = document.getElementById('message');

    // Check if already logged in, if so, redirect to main app
    if (localStorage.getItem('portfolioToken')) {
        window.location.href = '/index.html'; // Or just '/' if server serves index.html as default
        return; // Stop further execution
    }

    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginContainer.style.display = 'none';
        registerContainer.style.display = 'block';
        messageDiv.style.display = 'none';
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerContainer.style.display = 'none';
        loginContainer.style.display = 'block';
        messageDiv.style.display = 'none';
    });

    const showMessage = (message, type) => {
        messageDiv.textContent = message;
        messageDiv.className = type; // 'success' or 'error'
        messageDiv.style.display = 'block';
    };

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;
        messageDiv.style.display = 'none';

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Registration failed');
            }
            showMessage(data.message + " Please login.", 'success');
            // Switch to login form
            registerContainer.style.display = 'none';
            loginContainer.style.display = 'block';
            document.getElementById('login-username').value = username; // Pre-fill username
            document.getElementById('login-password').focus();
        } catch (error) {
            showMessage(error.message, 'error');
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        messageDiv.style.display = 'none';

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Login failed');
            }
            // Login successful
            localStorage.setItem('portfolioToken', data.token);
            localStorage.setItem('portfolioUser', JSON.stringify({ userId: data.userId, username: data.username }));
            window.location.href = '/index.html'; // Redirect to main app
        } catch (error) {
            showMessage(error.message, 'error');
        }
    });
});