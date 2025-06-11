document.addEventListener('DOMContentLoaded', () => {
    const appContent = document.getElementById('app-content');
    const usernameDisplay = document.getElementById('username-display');
    const logoutBtn = document.getElementById('logout-btn');
    const API_ME_BASE_URL = 'http://localhost:3000/api/me'; // For logged-in user's data

    let currentData = { subpages: [] }; // Stores { subpages: [...] }
    let authToken = localStorage.getItem('portfolioToken');
    let currentUser = JSON.parse(localStorage.getItem('portfolioUser'));

    // --- Authentication Check & Setup ---
    if (!authToken || !currentUser) {
        window.location.href = '/landing.html'; // Redirect to login if not authenticated
        return; // Stop script execution
    }

    if (usernameDisplay) { // Ensure element exists before trying to set textContent
        usernameDisplay.textContent = `User: ${currentUser.username}`;
    }

    if (logoutBtn) { // Ensure element exists before adding event listener
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('portfolioToken');
            localStorage.removeItem('portfolioUser');
            window.location.href = '/landing.html';
        });
    } else {
        console.error("Logout button not found in the DOM.");
    }


    // Helper to add Auth token to fetch requests
    const fetchWithAuth = async (url, options = {}) => {
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${authToken}`
        };
        // For FormData, 'Content-Type' is set by browser, so don't set it manually
        if (!(options.body instanceof FormData) && !headers['Content-Type']) { // Check if Content-Type is already set
            headers['Content-Type'] = 'application/json';
        }


        const response = await fetch(url, { ...options, headers });

        if (response.status === 401 || response.status === 403) { // Unauthorized or Forbidden
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
        // Ensure currentData.subpages is an array before using find
        const subpages = Array.isArray(currentData.subpages) ? currentData.subpages : [];
        const subpage = subpages.find(sp => sp.id === subpageId);
        if (subpage) {
            renderSubpageDetail(subpage);
            window.location.hash = `#subpage/${subpageId}`;
        } else {
            console.error('Subpage not found:', subpageId, "Available subpages:", subpages);
            navigateToDashboard(); // Fallback to dashboard
        }
    };

    const renderDashboard = () => {
        const template = document.getElementById('dashboard-template').content.cloneNode(true);
        appContent.innerHTML = '';
        appContent.appendChild(template);

        const subpageList = appContent.querySelector('#subpage-list');
        subpageList.innerHTML = ''; // Clear previous items

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

        const postGrid = appContent.querySelector('#post-grid');
        postGrid.innerHTML = ''; // Clear previous posts

        const posts = Array.isArray(subpage.posts) ? subpage.posts : [];

        if (posts.length > 0) {
            posts.forEach(post => {
                const postTemplate = document.getElementById('post-item-template').content.cloneNode(true);
                const postCard = postTemplate.querySelector('.post-card');
                const postLink = postCard.querySelector('.post-link');

                // --- New logic for setting the link ---
                let linkTarget = null;
                let opensInNewTab = false;

                if (post.url && post.url.trim() !== '') {
                    // Priority 1: Use the external URL
                    linkTarget = post.url;
                    opensInNewTab = true;
                } else if (post.filePath) {
                    // Priority 2: Use the uploaded file path
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
                    // If there is no link or file, make the card non-clickable
                    postLink.removeAttribute('href');
                    postLink.style.cursor = 'default';
                }
                // --- End of new logic ---

                const img = postCard.querySelector('.post-preview-img');
                img.src = post.previewImage || 'https://via.placeholder.com/300x180.png?text=No+Preview';
                img.alt = post.title + " preview";

                postCard.querySelector('.post-title').textContent = post.title;
                postCard.querySelector('.post-description').textContent = post.description;

                const deleteBtn = postCard.querySelector('.delete-post-btn');
                deleteBtn.addEventListener('click', () => deletePost(subpage.id, post.id));

                postGrid.appendChild(postTemplate);
            });
        } else {
            postGrid.innerHTML = '<p>No posts yet. Add one using the form above!</p>';
        }
        appContent.querySelector('#create-post-form').addEventListener('submit', (event) => handleCreatePost(event, subpage.id));
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
            currentData = await response.json(); // Expects { subpages: [...] }
            if (!currentData || !Array.isArray(currentData.subpages)) { // Ensure subpages is an array
                console.warn("Received data does not contain a valid subpages array:", currentData);
                currentData = { subpages: [] }; // Default to empty if structure is wrong
            }

            // Handle hash-based routing after data is fetched
            if (window.location.hash.startsWith('#subpage/')) {
                const subpageId = window.location.hash.split('/')[1];
                navigateToSubpage(subpageId);
            } else {
                navigateToDashboard(); // Default to dashboard
            }
        } catch (error) {
            console.error("Failed to fetch user data:", error);
            appContent.innerHTML = `<p class="error">Error loading your data. If the problem persists, please try logging out and back in. <br>Details: ${error.message}</p>`;
            // Optionally clear currentData or handle the UI to prevent actions on stale/no data
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
                body: JSON.stringify({ name }) // fetchWithAuth adds Content-Type if not FormData
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({message: "Error creating subpage."}));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            await response.json(); // newSubpage data
            nameInput.value = '';
            fetchDataAndNavigate(); // Refresh dashboard
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
                const errorData = await response.json().catch(() => ({message: "Error deleting subpage."}));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            await response.json();
            fetchDataAndNavigate(); // Refresh dashboard
        } catch (error) {
            console.error("Error deleting subpage:", error);
            alert(`Error deleting subpage: ${error.message}`);
        }
    };

    const handleCreatePost = async (event, subpageId) => {
    event.preventDefault();
    const form = event.target;

    const formData = new FormData();
    formData.append('title', form.querySelector('#new-post-title').value);
    formData.append('description', form.querySelector('#new-post-description').value);

    // --- NEW: Process the URL to add https:// if needed ---
    let urlValue = form.querySelector('#new-post-url').value.trim();
    
    formData.append('url', urlValue);
    // --- END: URL processing ---

    // Append preview image if one is selected
    const previewInput = form.querySelector('#new-post-preview');
    if (previewInput.files.length > 0) {
        formData.append('previewImageFile', previewInput.files[0]);
    }

    // Append main file if one is selected
    const mainFileInput = form.querySelector('#new-post-file');
    if (mainFileInput.files.length > 0) {
        formData.append('mainFile', mainFileInput.files[0]);
    }

    // --- REMOVED: The validation for requiring a file or URL has been deleted ---
    // The only remaining validation is for title and description.
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
        await response.json();
        form.reset();
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
                const errorData = await response.json().catch(() => ({message: "Error deleting post."}));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            await response.json();
            fetchDataAndNavigate(); // Refresh current subpage view
        } catch (error) {
            console.error("Error deleting post:", error);
            alert(`Error deleting post: ${error.message}`);
        }
    };

    // --- Initial Load for Authenticated User ---
    // This is called only if the user is authenticated (checked at the top)
    fetchDataAndNavigate();

    // --- Handle Hash Changes for Navigation ---
    window.addEventListener('hashchange', () => {
        // This logic will run when the hash part of the URL changes
        // (e.g., user clicks back/forward or a link changes the hash)
        // Ensure data has been fetched or is being fetched before trying to navigate based on hash.
        // The fetchDataAndNavigate function itself handles initial hash routing.
        // This listener is primarily for subsequent hash changes.

        if (!authToken || !currentUser) { // Double check auth, though initial check should prevent this.
            window.location.href = '/landing.html';
            return;
        }

        if (window.location.hash.startsWith('#subpage/')) {
            const subpageId = window.location.hash.split('/')[1];
            // Ensure currentData is populated before trying to find subpage
            if (currentData && Array.isArray(currentData.subpages)) {
                navigateToSubpage(subpageId);
            } else {
                // Data might not be loaded yet, or an error occurred.
                // fetchDataAndNavigate handles initial routing. If hash changes before data is ready,
                // it might lead to dashboard. Or, could re-fetch.
                // For simplicity, if data isn't ready, the primary fetchDataAndNavigate will handle routing once done.
                console.warn("Hash changed, but data not ready. Defaulting to dashboard or waiting for fetch.");
                // navigateToDashboard(); // Or let fetchDataAndNavigate handle it
            }
        } else if (window.location.hash === "" || window.location.hash === "#" || window.location.hash === "#dashboard") {
            navigateToDashboard();
        }
    });
});