(function() {
    // VS Code API
    const vscode = acquireVsCodeApi();
    let isSearching = false; // Add a flag to track search status
    let isTruncated = false; // Track if results are truncated
    let isCancelled = false; // Track if search is cancelled
    let streamResults = []; // Track streaming results

    // Add HTML escaping function
    function escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Search function
    function performSearch() {
        // Ignore if a search is already in progress
        if (isSearching) {
            return;
        }
        isSearching = true; // Set searching flag
        streamResults = []; // Reset streaming results

        const query = document.getElementById('searchInput').value;
        if (!query) {
            isSearching = false; // Reset flag if query is empty
            return;
        }

        // Clear previous results and show spinner
        const container = document.getElementById('searchResults');
        if (container) {
            container.innerHTML = '<div class="loading-spinner"></div>';
        }

        const options = {
            caseSensitive: document.getElementById('caseSensitiveBtn').classList.contains('active'),
            include: document.getElementById('includeFiles').value,
            exclude: document.getElementById('excludeFiles').value
        };

        vscode.postMessage({
            type: 'search',
            query: query,
            options: options
        });
    }

    function cancelSearch() {
        if (isSearching) {
            vscode.postMessage({
                type: 'cancelSearch'
            });
            // isSearching = false; // Reset flag
            // isCancelled = true; // Set cancelled flag
            // updateSearchSummary(); // Update summary
        }
    }

    // Display a single result from the stream
    function displayStreamResult(result, isFirst, container) {
        if (!result.file) {
            return; // Skip invalid results
        }

        if (isFirst) {
            // For the first result, clear the container (remove spinner)
            container.innerHTML = '';

            // Add the initial search summary that will be updated as more results come in
            const summary = document.createElement('div');
            summary.id = 'search-summary';
            summary.className = 'search-summary';
            summary.textContent = 'Searching...';
            container.appendChild(summary);
        }

        // Find existing file group or create a new one
        let fileGroup = document.querySelector(`.file-group[data-file="${result.file}"]`);

        if (!fileGroup) {
            // Create new file group for this file
            fileGroup = document.createElement('div');
            fileGroup.className = 'file-group';
            fileGroup.dataset.file = result.file;

            const fileHeader = document.createElement('div');
            fileHeader.className = 'file-header';

            // Add collapse/expand toggle icon as the leftmost element
            const toggleIcon = document.createElement('span');
            toggleIcon.className = 'toggle-icon codicon codicon-chevron-down';

            // Create the file path element
            const filePathElement = document.createElement('span');
            filePathElement.className = 'file-path';
            filePathElement.textContent = `${result.file}${result.truncate ? ' (truncated)' : ''}`;

            const matchCount = document.createElement('span');
            matchCount.className = 'match-count';
            matchCount.textContent = result.lines?.length || 0;
            matchCount.dataset.count = result.lines?.length || 0;

            // Add elements in left-to-right order: toggle icon, file path, match count
            fileHeader.appendChild(toggleIcon);
            fileHeader.appendChild(filePathElement);
            fileHeader.appendChild(matchCount);
            fileGroup.appendChild(fileHeader);

            // Create a container for the results to allow for collapsing
            const fileResults = document.createElement('div');
            fileResults.className = 'file-results';
            fileGroup.appendChild(fileResults);

            // Add click handler for collapsing/expanding
            fileHeader.addEventListener('click', (e) => {
                // Prevent click from reaching the child elements
                e.stopPropagation();

                // Toggle collapsed state
                fileHeader.classList.toggle('collapsed');
                fileResults.classList.toggle('collapsed');
            });

            container.appendChild(fileGroup);
        } else {
            // Update match count for existing file group
            const matchCount = fileGroup.querySelector('.match-count');
            const currentCount = parseInt(matchCount.dataset.count || '0', 10);
            const newCount = currentCount + (result.lines?.length || 0);
            matchCount.textContent = newCount;
            matchCount.dataset.count = newCount;
        }

        // Find the file results container
        const fileResults = fileGroup.querySelector('.file-results');

        // Add the search result lines
        if (result.lines) {
            result.lines.forEach(match => {
                const matchDiv = document.createElement('div');
                matchDiv.className = 'result-item';

                const lineNumberSpan = document.createElement('span');
                lineNumberSpan.className = 'line-number';
                lineNumberSpan.textContent = match.line.line_number.toString();

                const lineContentSpan = document.createElement('span');
                lineContentSpan.className = 'line-content';

                let content = match.line.content;
                let highlightedContent = '';

                const matchPositions = match.line.match || [];
                if (matchPositions.length >= 2) {
                    const start = matchPositions[0];
                    const end = matchPositions[1];

                    const beforeMatch = content.substring(0, start);
                    const truncatedBefore = beforeMatch.length > 12
                        ? '...' + beforeMatch.substring(beforeMatch.length - 12)
                        : beforeMatch;

                    highlightedContent += escapeHTML(truncatedBefore);
                    highlightedContent += `<span class="match-highlight">${escapeHTML(content.substring(start, end))}</span>`;

                    const afterMatch = content.substring(end);
                    const truncatedAfter = afterMatch.length > 128
                        ? afterMatch.substring(0, 128) + '...'
                        : afterMatch;
                    highlightedContent += escapeHTML(truncatedAfter);

                    matchDiv.dataset.start = start;
                    matchDiv.dataset.end = end;
                } else {
                    highlightedContent = escapeHTML(content.length > 160
                        ? content.substring(0, 160) + '...'
                        : content);
                }

                lineContentSpan.innerHTML = highlightedContent;

                matchDiv.appendChild(lineNumberSpan);
                matchDiv.appendChild(lineContentSpan);

                matchDiv.addEventListener('click', () => {
                    vscode.postMessage({
                        type: 'openFile',
                        file: result.file,
                        line: match.line.line_number,
                        start: matchDiv.dataset.start ? parseInt(matchDiv.dataset.start) : undefined,
                        end: matchDiv.dataset.end ? parseInt(matchDiv.dataset.end) : undefined
                    });
                });
                fileResults.appendChild(matchDiv);
            });
        }

        // Update the search summary
        updateSearchSummary();
    }

    // Update the search summary with current counts
    function updateSearchSummary() {
        const summary = document.getElementById('search-summary');
        if (!summary) return;

        // Calculate file count and total matches directly from streamResults
        const uniqueFiles = new Set(streamResults.map(result => result.file).filter(Boolean));
        const fileCount = uniqueFiles.size;

        let totalMatches = 0;
        streamResults.forEach(result => {
            totalMatches += result.lines?.length || 0;
        });

        if (isSearching) {
            summary.textContent = `${totalMatches} results in ${fileCount} files (searching...)`;
        } else if (isCancelled) {
            summary.textContent = `${totalMatches} results in ${fileCount} files (cancelled)`;
        } else {
            if (isTruncated) {
                summary.textContent = `${totalMatches} results in ${fileCount} files (Results truncated, showing partial matches)`;
            } else {
                summary.textContent = `${totalMatches} results in ${fileCount} files`;
            }
        }
    }

    var onkeydown = function(e) {
        if (e.key === 'Enter' || e.keyCode === 13) {
            performSearch();
            return false;
        }
        if (e.key === 'Escape' || e.keyCode === 27) {
            cancelSearch();
            return false;
        }
    }

    // Search input Enter key handler
    var searchInput = document.getElementById('searchInput');
    var clearTextBtn = document.getElementById('clearTextBtn');

    if (searchInput) {
        // Handle input changes to show/hide clear button
        searchInput.addEventListener('input', function() {
            if (clearTextBtn) {
                clearTextBtn.style.display = this.value ? 'flex' : 'none';
            }
        });

        searchInput.onkeydown = onkeydown
    }

    // Clear text button handler
    if (clearTextBtn) {
        clearTextBtn.onclick = function() {
            if (searchInput) {
                searchInput.value = '';
                this.style.display = 'none';
                // Focus the search input
                searchInput.focus();
                // Clear the search results
                const resultsContainer = document.getElementById('searchResults');
                if (resultsContainer) {
                    resultsContainer.innerHTML = '';
                }

                cancelSearch(); // Cancel any ongoing search
            }
        };
    }

    // Include files Enter key handler
    var includeFiles = document.getElementById('includeFiles');
    if (includeFiles) {
        includeFiles.onkeydown = onkeydown
    }

    // Exclude files Enter key handler
    var excludeFiles = document.getElementById('excludeFiles');
    if (excludeFiles) {
        excludeFiles.onkeydown = onkeydown
    }

    // Case sensitive button click handler
    var caseSensitiveBtn = document.getElementById('caseSensitiveBtn');
    if (caseSensitiveBtn) {
        caseSensitiveBtn.onclick = function() {
            this.classList.toggle('active');
            if (searchInput && searchInput.value.trim()) {
                performSearch();
            }
        };
    }

    // Options toggle button click handler
    var optionsToggle = document.getElementById('optionsToggle');
    if (optionsToggle) {
        optionsToggle.onclick = function() {
            var options = document.getElementById('searchOptions');
            if (options) {
                options.classList.toggle('visible');
                this.classList.toggle('active');
            }
        };
    }

    var focusSearchInput = () => {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.focus();
            searchInput.select(); // Also select the text for easy replacement
        }
    }

    // DOM Content Loaded event handler
    document.addEventListener('DOMContentLoaded', function() {
        // Notify VS Code that the DOM has been loaded
        vscode.postMessage({
            type: 'domLoaded'
        });

        // Initialize the clear button state
        const searchInput = document.getElementById('searchInput');
        const clearTextBtn = document.getElementById('clearTextBtn');
        if (searchInput && clearTextBtn) {
            clearTextBtn.style.display = searchInput.value ? 'flex' : 'none';
        }

        // Auto focus the search input when the DOM loads
        focusSearchInput();
    });

    // Message handler
    window.addEventListener('message', function(event) {
        var message = event.data;
        if (message.type === 'searchStarted') {
            // Handle search started event
            isSearching = true;
            isCancelled = false;
            isTruncated = false;
            streamResults = [];
            updateSearchSummary();
        } else if (message.type === 'searchResultStream') {
            if (!isSearching) {
                return; // Ignore if not searching
            }

            // Handle streaming search result
            const container = document.getElementById('searchResults');
            if (message.result && message.result.file) {
                if (container) {
                    // Track the result
                    streamResults.push(message.result);

                    // Display each result as it arrives
                    const isFirst = streamResults.length === 1;
                    displayStreamResult(message.result, isFirst, container);
                }
            }

            // If this is the last result, mark search as complete
            if (message.isDone) {
                console.log('Search completed:', message);
                isSearching = false;
                isTruncated = message.truncated || false;

                if (streamResults.length === 0) {
                    container.innerHTML = '';
                    // Add the initial search summary that will be updated as more results come in
                    const summary = document.createElement('div');
                    summary.id = 'search-summary';
                    summary.className = 'search-summary';
                    summary.textContent = 'No results found';
                    container.appendChild(summary);
                }

                updateSearchSummary();
            }
        } else if (message.type === 'setSearchText') {
            // Handle setting search text from editor selection
            const searchInput = document.getElementById('searchInput');
            const clearTextBtn = document.getElementById('clearTextBtn');
            if (searchInput && message.text) {
                searchInput.value = message.text;
                // Show clear button when text is set
                if (clearTextBtn) {
                    clearTextBtn.style.display = message.text ? 'flex' : 'none';
                }
                // Perform search immediately with the new text
                performSearch();
                focusSearchInput();
            }
        } else if (message.type === 'focusSearchInput') {
            // Handle focusing the search input
            focusSearchInput();
        } else if (message.type === 'visibilityChanged') {
            // Handle visibility change events
            console.log(`WebView visibility changed: ${message.isVisible ? 'visible' : 'hidden'}`);
            if (message.isVisible) {
                focusSearchInput();

                const searchInput = document.getElementById('searchInput');
                const resultsContainer = document.getElementById('searchResults');
                if (searchInput && searchInput.value.trim() && resultsContainer && !resultsContainer.hasChildNodes()) {
                    performSearch();
                }
            }
        } else if (message.type === 'searchCancelled') {
            // Handle search cancellation confirmation from backend
            if (isSearching) {
                console.log('Search cancelled');
                // Handle search cancellation
                isSearching = false;
                isCancelled = true;
                updateSearchSummary();
            }
        }
    });
})();
