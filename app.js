// ============ CONFIG ============
const LONG_PRESS_DURATION = 600;
const CHUNK_SIZE = 8000;
const MAX_DOM_CHUNKS = 5;
const SAMPLE_TEXT = `English: café résumé naïve Zürich don't e-mail COVID-19
Chinese: 你好世界，今天天气很好。
Japanese: こんにちは世界
Korean: 안녕하세요 세계
Thai: สวัสดีชาวโลก
Arabic: مرحبا بالعالم
Hindi: नमस्ते दुनिया
Russian: Привет мир
Emoji: 👨‍👩‍👧‍👦 🎉 🏳️‍🌈
Combining: café résumé

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

${'Lorem ipsum dolor sit amet\n'.repeat(50)}`;

// ============ STATE ============
let pressTimer = null;
let pressX = 0, pressY = 0, currentX = 0, currentY = 0;
let currentHighlightSpan = null, currentHighlightChunk = null;
let fullText = '', renderedLength = 0, renderStartOffset = 0;
let isLoading = false, chunkSpans = [];
let isPageMode = false;
let pageModeRenderAll = false;
const chunkOriginalTexts = new WeakMap();
const wordSegmenter = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;
const supportsCSSHighlight = typeof CSS !== 'undefined' && CSS.highlights;

// ============ LOG BAR ============
function showInLog(text) {
    const logBar = document.getElementById('logBar'), logText = document.getElementById('logText'), dictLink = document.getElementById('dictLink');
    logText.textContent = text;
    dictLink.href = 'https://dict.youdao.com/result?word=' + encodeURIComponent(text) + '&lang=en';
    dictLink.hidden = false;
    logBar.classList.add('flash');
    setTimeout(() => logBar.classList.remove('flash'), 400);
    if (navigator.vibrate) navigator.vibrate(30);
}
function clearPress() { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }

// ============ OFFSET HELPER ============
function getOffsetInChunk(chunkSpan, targetNode, offsetInNode) {
    let total = 0;
    function walk(node) {
        if (node === targetNode) return true;
        if (node.nodeType === Node.TEXT_NODE) total += node.textContent.length;
        else if (node.nodeType === Node.ELEMENT_NODE) for (const child of node.childNodes) if (walk(child)) return true;
        return false;
    }
    walk(chunkSpan); return total + offsetInNode;
}

// ============ WORD DETECTION ============
function getWordAtPoint(x, y) {
    let range = document.caretRangeFromPoint(x, y);
    if (!range) { const pos = document.caretPositionFromPoint(x, y); if (!pos) return null; range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); }
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const chunkSpan = node.parentElement.closest('.chunk');
    if (!chunkSpan) return null;
    const chunkText = chunkOriginalTexts.get(chunkSpan) || chunkSpan.textContent;
    const actualOffset = getOffsetInChunk(chunkSpan, node, range.startOffset);
    if (wordSegmenter) {
        const segments = [...wordSegmenter.segment(chunkText)];
        let start = 0;
        for (const seg of segments) { const end = start + seg.segment.length; if (seg.isWordLike && actualOffset >= start && actualOffset < end) return { word: seg.segment, start, end, chunkSpan }; start = end; }
    }
    const idx = actualOffset >= chunkText.length ? Math.max(0, chunkText.length - 1) : actualOffset;
    const char = chunkText[idx];
    if (char) return { word: char, start: idx, end: idx + 1, chunkSpan };
    return null;
}

// ============ HIGHLIGHT ============
function highlightWord(chunkSpan, start, end) {
    if (supportsCSSHighlight) {
        CSS.highlights.delete('word-highlight');
        const textNode = chunkSpan.firstChild;
        if (textNode && textNode.nodeType === Node.TEXT_NODE) { const r = document.createRange(); r.setStart(textNode, start); r.setEnd(textNode, end); CSS.highlights.set('word-highlight', new Highlight(r)); }
    } else {
        if (currentHighlightSpan && currentHighlightChunk) currentHighlightChunk.textContent = chunkOriginalTexts.get(currentHighlightChunk) || '';
        const text = chunkOriginalTexts.get(chunkSpan) || chunkSpan.textContent;
        const before = text.slice(0, start), wordText = text.slice(start, end), after = text.slice(end);
        const hl = document.createElement('span'); hl.className = 'highlight'; hl.textContent = wordText;
        chunkSpan.textContent = '';
        if (before) chunkSpan.appendChild(document.createTextNode(before));
        chunkSpan.appendChild(hl); if (after) chunkSpan.appendChild(document.createTextNode(after));
        currentHighlightSpan = hl; currentHighlightChunk = chunkSpan;
    }
}

// ============ POINTER ============
const editor = document.getElementById('editor');
editor.addEventListener('pointermove', (e) => {
    if (pressTimer) { const dx = Math.abs(e.clientX - pressX), dy = Math.abs(e.clientY - pressY); if (dx > 12 || dy > 12) clearPress(); else { currentX = e.clientX; currentY = e.clientY; } }
});
editor.addEventListener('pointerdown', (e) => {
    pressX = e.clientX; pressY = e.clientY; currentX = e.clientX; currentY = e.clientY;
    pressTimer = setTimeout(() => { const result = getWordAtPoint(currentX, currentY); if (result) { highlightWord(result.chunkSpan, result.start, result.end); showInLog(result.word); } }, LONG_PRESS_DURATION);
});
editor.addEventListener('pointerup', clearPress); editor.addEventListener('pointercancel', clearPress); editor.addEventListener('pointerleave', clearPress); editor.addEventListener('contextmenu', e => e.preventDefault());

// ============ APPLE SCRUBBER ============
const scrubber = document.getElementById('scrubber'), scrubTrack = document.getElementById('scrubTrack'), scrubFill = document.getElementById('scrubFill'), scrubKnob = document.getElementById('scrubKnob'), scrubLabel = document.getElementById('scrubLabel');
let scrubHideTimer = null, dragging = false;

function showScrubber() {
    scrubber.classList.add('visible');
    clearTimeout(scrubHideTimer);
    scrubHideTimer = setTimeout(() => { if (!dragging) scrubber.classList.remove('visible'); }, 1600);
}
function currentProgress() {
    if (!fullText) return 0;
    if (isPageMode) {
        const scrollW = editor.scrollWidth - editor.clientWidth;
        return scrollW > 0 ? editor.scrollLeft / scrollW : 0;
    }
    const span = renderedLength - renderStartOffset;
    const frac = editor.scrollHeight > editor.clientHeight ? editor.scrollTop / (editor.scrollHeight - editor.clientHeight) : 0;
    return Math.max(0, Math.min(1, (renderStartOffset + Math.floor(frac * span)) / fullText.length));
}
function syncScrubber() { const p = currentProgress(); scrubFill.style.width = scrubKnob.style.left = (p * 100) + '%'; if (!dragging) scrubLabel.textContent = Math.round(p * 100) + '%'; }
function jumpToFraction(p) {
    p = Math.max(0, Math.min(1, p));
    if (isPageMode) {
        const scrollW = editor.scrollWidth - editor.clientWidth;
        editor.scrollLeft = p * scrollW;
    } else {
        renderStartOffset = Math.floor(Math.floor(p * fullText.length) / CHUNK_SIZE) * CHUNK_SIZE;
        renderedLength = renderStartOffset;
        editor.innerHTML = ''; chunkSpans = []; currentHighlightSpan = null; currentHighlightChunk = null;
        if (supportsCSSHighlight) CSS.highlights.delete('word-highlight');
        renderNextChunk(); editor.scrollTop = 0;
    }
    syncScrubber();
}
function scrubToClientX(clientX) {
    const rect = scrubTrack.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    scrubFill.style.width = scrubKnob.style.left = (p * 100) + '%';
    scrubLabel.textContent = Math.round(p * 100) + '%';
    return p;
}

scrubTrack.addEventListener('pointerdown', (e) => {
    dragging = true; scrubTrack.classList.add('dragging'); scrubTrack.setPointerCapture(e.pointerId); showScrubber(); scrubToClientX(e.clientX);
});
scrubTrack.addEventListener('pointermove', (e) => { if (dragging) scrubToClientX(e.clientX); });
scrubTrack.addEventListener('pointerup', (e) => {
    if (!dragging) return; dragging = false; scrubTrack.classList.remove('dragging');
    const rect = scrubTrack.getBoundingClientRect(); jumpToFraction((e.clientX - rect.left) / rect.width); showScrubber();
});
scrubTrack.addEventListener('pointercancel', () => { dragging = false; scrubTrack.classList.remove('dragging'); showScrubber(); });
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#scrubber') && !e.target.closest('.controls')) showScrubber(); });

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

editor.addEventListener('scroll', () => {
    syncScrubber();
    if (!isPageMode && editor.scrollTop + editor.clientHeight >= editor.scrollHeight - 200) renderNextChunk();
});

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

editor.addEventListener('scroll', () => {
    if (isPageMode) updatePageIndicator();
});

modeToggle.addEventListener('click', () => setPageMode(!isPageMode));

// ============ LOAD TEXT ============
function loadText(text) {
    fullText = text;
    renderStartOffset = 0;
    renderedLength = 0;
    editor.innerHTML = '';
    chunkSpans = [];
    currentHighlightSpan = null;
    currentHighlightChunk = null;
    if (supportsCSSHighlight) CSS.highlights.delete('word-highlight');
    if (isPageMode) {
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
        renderNextChunk();
    }
    syncScrubber();
}

// ============ FILE LOADING ============
document.getElementById('fileInput').addEventListener('change', async function(e) {
    const file = e.target.files[0]; if (!file) return;
    const indicator = document.getElementById('loadingIndicator');
    indicator.style.display = 'block';
    indicator.textContent = 'Reading file…';
    
    try {
        if (file.stream) {
            const stream = file.stream();
            const reader = stream.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            fullText = '';
            let bytesRead = 0;
            
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                bytesRead += value.length;
                buffer += decoder.decode(value, { stream: true });
                indicator.textContent = `Reading… ${Math.round(bytesRead / file.size * 100)}%`;
            }
            buffer += decoder.decode();
            fullText = buffer;
        } else {
            await new Promise((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = ev => { fullText = ev.target.result; resolve(); };
                fr.onerror = reject;
                fr.readAsText(file);
            });
        }
        
        indicator.textContent = 'Rendering…';
        setTimeout(() => loadText(fullText), 50);
    } catch (err) {
        indicator.textContent = 'Error loading file';
        console.error(err);
    }
});

document.getElementById('loadSample').addEventListener('click', () => loadText(SAMPLE_TEXT));
loadText(SAMPLE_TEXT);