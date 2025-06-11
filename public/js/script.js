document.addEventListener('DOMContentLoaded', () => {
    const appContent = document.getElementById('app-content');
    const usernameDisplay = document.getElementById('username-display');
    const logoutBtn = document.getElementById('logout-btn');
    const API_ME_BASE_URL = 'http://localhost:3000/api/me';

    let currentData = { subpages: [] };
    let authToken = localStorage.getItem('portfolioToken');
    let currentUser = JSON.parse(localStorage.getItem('portfolioUser'));

    // Helper to safely get the basename of a path (e.g., /uploads/file.jpg -> file.jpg)
    const path = {
        basename: (p) => p.split(/[\\/]/).pop()
    };

    // --- Authentication Check & Setup ---
    if (!authToken || !currentUser) {
        window.location.href = '/landing.html';
        return;
    }

    if (usernameDisplay) {
        usernameDisplay.textContent = currentUser.username;
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('portfolioToken');
            localStorage.removeItem('portfolioUser');
            window.location.href = '/landing.html';
        });
    } else {
        console.error("Logout button not found in the DOM.");
    }

    // --- Helper to add Auth token to fetch requests ---
    const fetchWithAuth = async (url, options = {}) => {
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${authToken}`
        };
        if (!(options.body instanceof FormData) && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(url, { ...options, headers });

        if (response.status === 401 || response.status === 403) {
            console.warn('Authentication failed or token expired. Redirecting to login.');
            localStorage.removeItem('portfolioToken');
            localStorage.removeItem('portfolioUser');
            window.location.href = '/landing.html';
            throw new Error('Authentication failed. Redirecting to login.');
        }
        return response;
    };

    // --- Navigation and Rendering ---
    const navigateToDashboard = () => {
        renderDashboard();
        window.location.hash = '#dashboard';
    };

    const navigateToSubpage = (subpageId) => {
        const subpages = Array.isArray(currentData.subpages) ? currentData.subpages : [];
        const subpage = subpages.find(sp => sp.id === subpageId);
        if (subpage) {
            renderSubpageDetail(subpage);
            window.location.hash = `#subpage/${subpageId}`;
        } else {
            console.error('Subpage not found:', subpageId, "Available subpages:", subpages);
            navigateToDashboard();
        }
    };

    const renderDashboard = () => {
        const template = document.getElementById('dashboard-template').content.cloneNode(true);
        appContent.innerHTML = '';
        appContent.appendChild(template);

        const subpageList = appContent.querySelector('#subpage-list');
        subpageList.innerHTML = '';

        const subpages = Array.isArray(currentData.subpages) ? currentData.subpages : [];

        if (subpages.length > 0) {
            subpages.forEach(subpage => {
                const itemTemplate = document.getElementById('subpage-item-template').content.cloneNode(true);
                itemTemplate.querySelector('.subpage-name').textContent = subpage.name;

                const viewBtn = itemTemplate.querySelector('.view-subpage-btn');
                viewBtn.addEventListener('click', () => navigateToSubpage(subpage.id));

                const deleteBtn = itemTemplate.querySelector('.delete-subpage-btn');
                deleteBtn.addEventListener('click', () => deleteSubpage(subpage.id));

                subpageList.appendChild(itemTemplate);
            });
        } else {
            subpageList.innerHTML = '<li>No subpages yet. Create one using the form above!</li>';
        }
        appContent.querySelector('#create-subpage-form').addEventListener('submit', handleCreateSubpage);
    };

    const renderSubpageDetail = (subpage) => {
        const template = document.getElementById('subpage-detail-template').content.cloneNode(true);
        appContent.innerHTML = '';
        appContent.appendChild(template);

        appContent.querySelector('#subpage-title').textContent = subpage.name;
        appContent.querySelector('#back-to-dashboard-btn').addEventListener('click', navigateToDashboard);

        // Add event listener for the new modal button
        const addPostBtn = appContent.querySelector('#open-add-post-modal-btn');
        addPostBtn.addEventListener('click', () => openAddPostModal(subpage.id));

        const postGrid = appContent.querySelector('#post-grid');
        postGrid.innerHTML = '';

        const posts = Array.isArray(subpage.posts) ? subpage.posts : [];

        if (posts.length > 0) {
            posts.forEach(post => {
                const postTemplate = document.getElementById('post-item-template').content.cloneNode(true);
                const postCard = postTemplate.querySelector('.post-card');
                const postLink = postCard.querySelector('.post-link');

                let linkTarget = null;
                let opensInNewTab = false;

                if (post.url && post.url.trim() !== '') {
                    linkTarget = post.url;
                    opensInNewTab = true;
                } else if (post.filePath) {
                    linkTarget = post.filePath;
                    opensInNewTab = true;
                }

                if (linkTarget) {
                    postLink.href = linkTarget;
                    if (opensInNewTab) {
                        postLink.target = '_blank';
                        postLink.rel = 'noopener noreferrer';
                    }
                } else {
                    postLink.removeAttribute('href');
                    postLink.style.cursor = 'default';
                }

                const img = postCard.querySelector('.post-preview-img');
                if (img) {
                    img.src = post.previewImage || 'https://via.placeholder.com/300x180.png?text=No+Preview';
                    img.alt = post.title + " preview";
                }

                const titleEl = postCard.querySelector('.post-title');
                if (titleEl) titleEl.textContent = post.title;

                const descEl = postCard.querySelector('.post-description');
                if (descEl) descEl.textContent = post.description;

                const editBtn = postCard.querySelector('.edit-post-btn');
                if (editBtn) {
                    editBtn.addEventListener('click', () => openEditModal(post, subpage.id));
                }

                const deleteBtn = postCard.querySelector('.delete-post-btn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', () => deletePost(subpage.id, post.id));
                }

                postGrid.appendChild(postTemplate);
            });
        } else {
            postGrid.innerHTML = '<p>No posts yet. Click "+ Add Post" to create one!</p>';
        }
    };

    // --- API Interaction Functions ---
    const fetchDataAndNavigate = async () => {
        appContent.innerHTML = '<div class="loading">Loading your portfolio...</div>';
        try {
            const response = await fetchWithAuth(`${API_ME_BASE_URL}/data`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: "Failed to parse error response from server." }));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            currentData = await response.json();
            if (!currentData || !Array.isArray(currentData.subpages)) {
                console.warn("Received data does not contain a valid subpages array:", currentData);
                currentData = { subpages: [] };
            }

            if (window.location.hash.startsWith('#subpage/')) {
                const subpageId = window.location.hash.split('/')[1];
                navigateToSubpage(subpageId);
            } else {
                navigateToDashboard();
            }
        } catch (error) {
            console.error("Failed to fetch user data:", error);
            appContent.innerHTML = `<p class="error">Error loading your data. If the problem persists, please try logging out and back in. <br>Details: ${error.message}</p>`;
            currentData = { subpages: [] };
        }
    };

    const handleCreateSubpage = async (event) => {
        event.preventDefault();
        const nameInput = document.getElementById('new-subpage-name');
        const name = nameInput.value.trim();
        if (!name) {
            alert('Subpage name cannot be empty.');
            return;
        }
        try {
            const response = await fetchWithAuth(`${API_ME_BASE_URL}/subpages`, {
                method: 'POST',
                body: JSON.stringify({ name })
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: "Error creating subpage." }));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            await response.json();
            nameInput.value = '';
            fetchDataAndNavigate();
        } catch (error) {
            console.error("Error creating subpage:", error);
            alert(`Error creating subpage: ${error.message}`);
        }
    };

    const deleteSubpage = async (subpageId) => {
        if (!confirm('Are you sure you want to delete this subpage and all its posts? This cannot be undone.')) return;
        try {
            const response = await fetchWithAuth(`${API_ME_BASE_URL}/subpages/${subpageId}`, { method: 'DELETE' });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: "Error deleting subpage." }));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            await response.json();
            fetchDataAndNavigate();
        } catch (error) {
            console.error("Error deleting subpage:", error);
            alert(`Error deleting subpage: ${error.message}`);
        }
    };
    
    const handleCreatePost = async (event) => {
        event.preventDefault();
        const form = event.target;
        const { subpageId } = form.dataset;

        const formData = new FormData(form);

        if (!formData.get('title') || !formData.get('description')) {
            alert('Title and description are required.');
            return;
        }

        try {
            const response = await fetchWithAuth(`${API_ME_BASE_URL}/subpages/${subpageId}/posts`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: "Error creating post." }));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            document.body.removeChild(form.closest('.modal-overlay'));
            fetchDataAndNavigate();
        } catch (error) {
            console.error("Error creating post:", error);
            alert(`Error creating post: ${error.message}`);
        }
    };

    const deletePost = async (subpageId, postId) => {
        if (!confirm('Are you sure you want to delete this post? This cannot be undone.')) return;
        try {
            const response = await fetchWithAuth(`${API_ME_BASE_URL}/subpages/${subpageId}/posts/${postId}`, { method: 'DELETE' });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: "Error deleting post." }));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            await response.json();
            fetchDataAndNavigate();
        } catch (error) {
            console.error("Error deleting post:", error);
            alert(`Error deleting post: ${error.message}`);
        }
    };

    const openAddPostModal = (subpageId) => {
        if (document.querySelector('.modal-overlay')) return;

        const modalTemplate = document.getElementById('add-post-modal-template').content.cloneNode(true);
        const modalOverlay = modalTemplate.querySelector('.modal-overlay');
        const form = modalTemplate.querySelector('#create-post-form');

        form.dataset.subpageId = subpageId;
        form.addEventListener('submit', handleCreatePost);

        const closeModal = () => document.body.removeChild(modalOverlay);
        modalOverlay.addEventListener('click', (event) => {
            if (event.target === modalOverlay) closeModal();
        });
        modalTemplate.querySelector('.modal-close-btn').addEventListener('click', closeModal);

        document.body.appendChild(modalOverlay);
    };

    const openEditModal = (post, subpageId) => {
        if (document.querySelector('.modal-overlay')) return;

        const modalTemplate = document.getElementById('edit-post-modal-template').content.cloneNode(true);
        const modalOverlay = modalTemplate.querySelector('.modal-overlay');
        const form = modalTemplate.querySelector('#edit-post-form');

        form.querySelector('#edit-post-title').value = post.title;
        form.querySelector('#edit-post-description').value = post.description;

        const urlInput = form.querySelector('#edit-post-url');
        const fileInput = form.querySelector('#edit-post-file');

        urlInput.value = post.url || '';

        urlInput.addEventListener('input', () => {
            if (urlInput.value.trim() !== '') {
                fileInput.value = '';
                fileInput.classList.add('input-deemphasized');
                urlInput.classList.remove('input-deemphasized');
            } else {
                fileInput.classList.remove('input-deemphasized');
            }
        });

        fileInput.addEventListener('click', () => {
            urlInput.classList.add('input-deemphasized');
            fileInput.classList.remove('input-deemphasized');
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                urlInput.value = '';
            }
        });

        if (post.url) {
            fileInput.classList.add('input-deemphasized');
        } else if (post.filePath) {
            urlInput.classList.add('input-deemphasized');
        }

        form.querySelector('#current-file-info').textContent = post.filePath ? `Current: ${path.basename(post.filePath)}` : 'Current: None';
        form.querySelector('#current-preview-info').textContent = post.previewImage ? `Current: ${path.basename(post.previewImage)}` : 'Current: None';

        form.dataset.initialFilePath = post.filePath || '';
        form.dataset.subpageId = subpageId;
        form.dataset.postId = post.id;
        form.addEventListener('submit', handleUpdatePost);

        const closeModal = () => document.body.removeChild(modalOverlay);
        modalOverlay.addEventListener('click', (event) => { if (event.target === modalOverlay) closeModal(); });
        modalTemplate.querySelector('.modal-close-btn').addEventListener('click', closeModal);

        document.body.appendChild(modalOverlay);
    };

    const handleUpdatePost = async (event) => {
        event.preventDefault();
        const form = event.target;
        const { subpageId, postId, initialFilePath } = form.dataset;

        const formData = new FormData();
        formData.append('title', form.querySelector('#edit-post-title').value);
        formData.append('description', form.querySelector('#edit-post-description').value);
        
        const urlValue = form.querySelector('#edit-post-url').value.trim();
        formData.append('url', urlValue);

        if (initialFilePath && urlValue) {
            formData.append('clearFile', 'true');
        }

        const previewInput = form.querySelector('#edit-post-preview');
        if (previewInput.files.length > 0) {
            formData.append('previewImageFile', previewInput.files[0]);
        }
        const mainFileInput = form.querySelector('#edit-post-file');
        if (mainFileInput.files.length > 0) {
            formData.append('mainFile', mainFileInput.files[0]);
        }
        
        let response;
        try {
            response = await fetchWithAuth(`${API_ME_BASE_URL}/subpages/${subpageId}/posts/${postId}`, {
                method: 'PUT',
                body: formData
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: "Could not parse server error response." }));
                throw new Error(errorData.message);
            }
            
            document.body.removeChild(form.closest('.modal-overlay'));
            fetchDataAndNavigate();
        } catch (error) {
            console.error("Error updating post:", error);
            const serverStatus = response ? ` (Server responded with ${response.status})` : '';
            alert(`Failed to update post: ${error.message}${serverStatus}`);
        }
    };

    // --- Initial Load & Routing ---
    fetchDataAndNavigate();

    window.addEventListener('hashchange', () => {
        if (!authToken || !currentUser) {
            window.location.href = '/landing.html';
            return;
        }

        if (window.location.hash.startsWith('#subpage/')) {
            const subpageId = window.location.hash.split('/')[1];
            if (currentData && Array.isArray(currentData.subpages)) {
                navigateToSubpage(subpageId);
            }
        } else if (window.location.hash === "" || window.location.hash === "#" || window.location.hash === "#dashboard") {
            navigateToDashboard();
        }
    });
});