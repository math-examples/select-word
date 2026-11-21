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
function initPointer() {
    const editor = document.getElementById('editor');
    editor.addEventListener('pointermove', (e) => {
        if (pressTimer) { const dx = Math.abs(e.clientX - pressX), dy = Math.abs(e.clientY - pressY); if (dx > 12 || dy > 12) clearPress(); else { currentX = e.clientX; currentY = e.clientY; } }
    });
    editor.addEventListener('pointerdown', (e) => {
        pressX = e.clientX; pressY = e.clientY; currentX = e.clientX; currentY = e.clientY;
        pressTimer = setTimeout(() => { const result = getWordAtPoint(currentX, currentY); if (result) { highlightWord(result.chunkSpan, result.start, result.end); showInLog(result.word); } }, LONG_PRESS_DURATION);
    });
    editor.addEventListener('pointerup', clearPress); editor.addEventListener('pointercancel', clearPress); editor.addEventListener('pointerleave', clearPress); editor.addEventListener('contextmenu', e => e.preventDefault());
}

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

function initScrubber() {
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
}
