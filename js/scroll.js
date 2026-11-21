// ============ VIRTUAL SCROLL / RENDER ============
function trimChunks() {
    if (isPageMode) return;
    while (chunkSpans.length > MAX_DOM_CHUNKS) {
        const oldChunk = chunkSpans.shift();
        const height = oldChunk.offsetHeight || 0;
        oldChunk.remove();
        const originalText = chunkOriginalTexts.get(oldChunk) || '';
        renderStartOffset += originalText.length;
        editor.scrollTop = Math.max(0, editor.scrollTop - height);
    }
}

function renderNextChunk() {
    if (isLoading || renderedLength >= fullText.length) return;
    isLoading = true;
    const indicator = document.getElementById('loadingIndicator');
    indicator.style.display = 'block';
    indicator.textContent = 'Loading more…';

    requestAnimationFrame(() => {
        const chunk = fullText.slice(renderedLength, renderedLength + CHUNK_SIZE);
        renderedLength += chunk.length;
        const cs = document.createElement('span');
        cs.className = 'chunk';
        cs.textContent = chunk;
        chunkOriginalTexts.set(cs, chunk);
        editor.appendChild(cs);
        chunkSpans.push(cs);

        trimChunks();

        isLoading = false;
        indicator.style.display = 'none';
        syncScrubber();
    });
}

function initScroll() {
    editor.addEventListener('scroll', () => {
        syncScrubber();
        if (!isPageMode && editor.scrollTop + editor.clientHeight >= editor.scrollHeight - 200) renderNextChunk();
    });
}

// ============ MODE TOGGLE ============
const modeToggle = document.getElementById('modeToggle');
const modeHint = document.getElementById('modeHint');

function setPageMode(enable) {
    isPageMode = enable;
    if (enable) {
        editor.classList.add('page-mode');
        modeToggle.textContent = '📜 Scroll Mode';
        modeToggle.classList.add('active');
        modeHint.textContent = 'Swipe left/right to turn pages · long press to select word · tap for scrubber';
        while (renderedLength < fullText.length) {
            const chunk = fullText.slice(renderedLength, renderedLength + CHUNK_SIZE);
            renderedLength += chunk.length;
            const cs = document.createElement('span');
            cs.className = 'chunk';
            cs.textContent = chunk;
            chunkOriginalTexts.set(cs, chunk);
            editor.appendChild(cs);
            chunkSpans.push(cs);
        }
        updatePageIndicator();
    } else {
        editor.classList.remove('page-mode');
        modeToggle.textContent = '📖 Page Mode';
        modeToggle.classList.remove('active');
        modeHint.textContent = 'Long press (600ms) to select a word · tap once to reveal scrubber · drag to jump';
        const p = currentProgress();
        jumpToFraction(p);
    }
    syncScrubber();
}

function updatePageIndicator() {
    if (!isPageMode) return;
    const totalPages = Math.ceil(editor.scrollWidth / editor.clientWidth) || 1;
    const currentPage = Math.floor(editor.scrollLeft / editor.clientWidth) + 1;
    document.getElementById('pageIndicator').textContent = `Page ${currentPage} / ${totalPages}`;
}

function initModeToggle() {
    editor.addEventListener('scroll', () => {
        if (isPageMode) updatePageIndicator();
    });
    modeToggle.addEventListener('click', () => setPageMode(!isPageMode));
}

// ============ BOOTSTRAP ============
function initApp() {
    initScroll();
    initModeToggle();
    initScrubber();
    initPointer();
    initFileLoading();
    loadText(SAMPLE_TEXT);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
