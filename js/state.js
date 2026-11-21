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

// ============ LOAD TEXT (shared entry point) ============
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
function initFileLoading() {
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
}
