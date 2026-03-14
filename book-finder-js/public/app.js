// API Configuration
const API_BASE_URL = window.location.origin;
const API_ENDPOINT = `${API_BASE_URL}/api/books/search`;
const STATS_ENDPOINT = `${API_BASE_URL}/api/books/stats/embeddings`;

// DOM Elements
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const buttonText = document.getElementById('buttonText');
const buttonLoader = document.getElementById('buttonLoader');
const resultsSection = document.getElementById('resultsSection');
const resultsTitle = document.getElementById('resultsTitle');
const resultsCount = document.getElementById('resultsCount');
const resultsContainer = document.getElementById('resultsContainer');
const noResults = document.getElementById('noResults');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');
const exampleChips = document.querySelectorAll('.chip');

// Stats Elements
const totalBooks = document.getElementById('totalBooks');
const embeddingsCount = document.getElementById('embeddingsCount');
const coveragePercent = document.getElementById('coveragePercent');

// Event Listeners
searchButton.addEventListener('click', handleSearch);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleSearch();
    }
});

exampleChips.forEach(chip => {
    chip.addEventListener('click', () => {
        searchInput.value = chip.dataset.query;
        handleSearch();
    });
});

// Fetch and display stats on page load
fetchStats();

// Search Handler
async function handleSearch() {
    const query = searchInput.value.trim();

    if (!query) {
        showError('Please enter a search query');
        return;
    }

    if (query.length < 3) {
        showError('Search query must be at least 3 characters');
        return;
    }

    hideError();
    setLoading(true);

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: query,
                limit: 10
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Search failed');
        }

        const data = await response.json();
        displayResults(data);
    } catch (error) {
        console.error('Search error:', error);
        showError(error.message || 'Failed to perform search. Please try again.');
    } finally {
        setLoading(false);
    }
}

// Display Results
function displayResults(data) {
    const { query, results } = data;

    resultsTitle.textContent = `Results for "${query}"`;
    resultsCount.textContent = `Found ${results.length} similar books`;

    if (results.length === 0) {
        resultsSection.style.display = 'none';
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';
    resultsSection.style.display = 'block';

    resultsContainer.innerHTML = results.map((book, index) => {
        const scorePercent = (book.similarityScore * 100).toFixed(1);

        return `
            <div class="book-card" style="animation-delay: ${index * 0.05}s">
                <div class="book-header">
                    <div class="book-info">
                        <h3 class="book-title">${escapeHtml(book.title)}</h3>
                        <p class="book-author">by ${escapeHtml(book.author)}</p>
                    </div>
                    <div class="similarity-badge">${scorePercent}% match</div>
                </div>
                <p class="book-description">${escapeHtml(book.description)}</p>
                ${book.genre || book.publishYear ? `
                    <div class="book-meta">
                        ${book.genre ? `
                            <div class="meta-item">
                                <span class="meta-label">Genre:</span>
                                <span>${escapeHtml(book.genre)}</span>
                            </div>
                        ` : ''}
                        ${book.publishYear ? `
                            <div class="meta-item">
                                <span class="meta-label">Published:</span>
                                <span>${book.publishYear}</span>
                            </div>
                        ` : ''}
                        ${book.isbn ? `
                            <div class="meta-item">
                                <span class="meta-label">ISBN:</span>
                                <span>${escapeHtml(book.isbn)}</span>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// Fetch Stats
async function fetchStats() {
    try {
        const response = await fetch(STATS_ENDPOINT);
        if (!response.ok) {
            throw new Error('Failed to fetch stats');
        }

        const stats = await response.json();
        updateStats(stats);
    } catch (error) {
        console.error('Failed to fetch stats:', error);
        // Set default values
        totalBooks.textContent = '-';
        embeddingsCount.textContent = '-';
        coveragePercent.textContent = '-';
    }
}

// Update Stats
function updateStats(stats) {
    totalBooks.textContent = stats.totalBooks.toLocaleString();
    embeddingsCount.textContent = stats.booksWithEmbeddings.toLocaleString();
    coveragePercent.textContent = `${stats.coveragePercentage}%`;
}

// Set Loading State
function setLoading(isLoading) {
    searchButton.disabled = isLoading;

    if (isLoading) {
        buttonText.style.display = 'none';
        buttonLoader.style.display = 'inline-block';
    } else {
        buttonText.style.display = 'inline';
        buttonLoader.style.display = 'none';
    }
}

// Show Error
function showError(message) {
    errorText.textContent = message;
    errorMessage.style.display = 'flex';
    setTimeout(() => {
        hideError();
    }, 5000);
}

// Hide Error
function hideError() {
    errorMessage.style.display = 'none';
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Add focus to search input on page load
searchInput.focus();
