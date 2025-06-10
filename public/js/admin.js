document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://localhost:3000/api/admin';
    const userList = document.getElementById('user-list');
    // const createUserForm = document.getElementById('create-user-form'); // Removed
    // const newUsernameInput = document.getElementById('new-username'); // Removed

    const adminAuthSection = document.querySelector('.admin-auth-section');
    const adminDashboard = document.querySelector('.admin-dashboard');
    const adminLoginBtn = document.getElementById('admin-login-btn');
    const adminUsernameInput = document.getElementById('admin-username');
    const adminPasswordInput = document.getElementById('admin-password');
    const adminAuthStatus = document.getElementById('admin-auth-status');

    let adminCredentials = null;

    const showMessage = (element, message, isError = false) => {
        element.textContent = message;
        element.style.color = isError ? 'red' : 'green';
        element.style.display = 'block';
        setTimeout(() => {
            element.style.display = 'none';
            element.textContent = ''; // Clear message after timeout
        }, 3000);
    };

    if (adminLoginBtn) {
        adminLoginBtn.addEventListener('click', () => {
            const username = adminUsernameInput.value.trim();
            const password = adminPasswordInput.value.trim();
            if (!username || !password) {
                showMessage(adminAuthStatus, 'Admin username and password are required.', true);
                return;
            }
            adminCredentials = { username, password };
            fetchUsers().then(() => {
                 showMessage(adminAuthStatus, 'Authenticated successfully!', false);
                 adminAuthSection.style.display = 'none';
                 adminDashboard.style.display = 'block';
            }).catch(err => {
                showMessage(adminAuthStatus, `Authentication failed. ${err.message || 'Please check credentials and server.'}`, true);
                adminCredentials = null; // Clear on failure
            });
        });
    }


    const fetchUsers = async () => {
        if (!adminCredentials) {
            // This case should ideally be handled by UI (login first)
            throw new Error("Admin not authenticated. Please login.");
        }
        try {
            const response = await fetch(`${API_BASE_URL}/users`, {
                headers: {
                    'admin_username': adminCredentials.username,
                    'admin_password': adminCredentials.password
                }
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({message: `HTTP error! Status: ${response.status}`}));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            const users = await response.json();
            renderUsers(users);
        } catch (error) {
            console.error('Failed to fetch users:', error);
            // Don't alert here as it's called during login attempt, use showMessage on adminAuthStatus
            // alert(`Error fetching users: ${error.message}. Ensure admin credentials are correct.`);
            throw error; // Re-throw for login check to display message
        }
    };

    const renderUsers = (users) => {
        userList.innerHTML = '';
        if (users.length === 0) {
            userList.innerHTML = '<li>No users found in the system.</li>';
            return;
        }
        users.forEach(user => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${user.username} (ID: ${user.id})</span>
                <button class="delete-user-btn" data-userid="${user.id}">Delete</button>
            `;
            userList.appendChild(li);
        });
    };

    // Create User Form functionality removed

    if (userList) {
        userList.addEventListener('click', async (e) => {
            if (e.target.classList.contains('delete-user-btn')) {
                if (!adminCredentials) {
                    alert("Admin not authenticated. Please login first.");
                    return;
                }
                const userId = e.target.dataset.userid;
                if (!confirm(`Are you sure you want to delete user ID: ${userId} and all their data? This cannot be undone.`)) return;

                try {
                    const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
                        method: 'DELETE',
                        headers: {
                            'admin_username': adminCredentials.username,
                            'admin_password': adminCredentials.password
                        }
                    });
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({message: "Error deleting user."}));
                        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
                    }
                    await response.json(); // Consume response body
                    fetchUsers(); // Refresh list
                    alert('User deleted successfully.');
                } catch (error) {
                    console.error('Failed to delete user:', error);
                    alert(`Error deleting user: ${error.message}`);
                }
            }
        });
    }
});