/* =========================================
   YouTube → Article — Main Logic
   ========================================= */

const $ = s => document.querySelector(s);
const show = el => el.style.display = '';
const hide = el => el.style.display = 'none';

/* ─── Sections ────────────────────────────── */
const secInput = $('#section-input');
const secLoading = $('#section-loading');
const secArticle = $('#section-article');
const loadStatus = $('#loading-status');

/* ─── Settings ────────────────────────────── */
const DEFAULTS = {
    supadata: 'sd_10ca9edb69286ab5f84e27598474e6b6',
    openrouter: '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',
};
function getKey(name) { return localStorage.getItem(`yta-${name}`) || DEFAULTS[name] || ''; }
function setKey(name, val) { localStorage.setItem(`yta-${name}`, val); }

$('#btn-settings').addEventListener('click', () => {
    $('#key-supadata').value = getKey('supadata');
    $('#key-openrouter').value = getKey('openrouter');
    show($('#settings-modal'));
});
$('#btn-close-settings').addEventListener('click', () => hide($('#settings-modal')));
$('#settings-modal').addEventListener('click', e => { if (e.target === $('#settings-modal')) hide($('#settings-modal')); });

$('#btn-save-keys').addEventListener('click', () => {
    setKey('supadata', $('#key-supadata').value.trim());
    setKey('openrouter', $('#key-openrouter').value.trim());
    hide($('#settings-modal'));
    toast('Keys saved ✓');
});

/* ─── Convert Flow ────────────────────────── */
$('#btn-convert').addEventListener('click', startConversion);
$('#url-input').addEventListener('keydown', e => { if (e.key === 'Enter') startConversion(); });

async function startConversion() {
    const url = $('#url-input').value.trim();
    const videoId = extractVideoId(url);

    if (!videoId) return toast('⚠️ Please paste a valid YouTube URL');
    if (!getKey('supadata')) return toast('⚠️ Set your Supadata API key first (⚙️)');
    if (!getKey('openrouter')) return toast('⚠️ Set your OpenRouter API key first (⚙️)');

    hide(secInput);
    show(secLoading);

    try {
        // Step 1: Fetch transcript
        loadStatus.textContent = 'Fetching transcript…';
        const transcript = await fetchTranscript(videoId);
        if (!transcript || transcript.length === 0) throw new Error('No transcript found for this video.');

        // Step 2: Structure with AI
        loadStatus.textContent = 'Structuring article with AI…';
        const rawText = transcript.map(s => s.text).join(' ');
        const title = await fetchVideoTitle(videoId);
        const article = await structureWithAI(rawText, title);

        // Step 3: Render
        renderArticle(title, videoId, article);
        hide(secLoading);
        show(secArticle);

    } catch (err) {
        hide(secLoading);
        show(secInput);
        toast(`❌ ${err.message}`);
        console.error(err);
    }
}

/* ─── Extract Video ID ────────────────────── */
function extractVideoId(url) {
    try {
        const u = new URL(url);
        if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
        if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
    } catch { /* ignore */ }
    // Maybe it's just an ID
    if (/^[\w-]{11}$/.test(url)) return url;
    return null;
}

/* ─── Supadata: Fetch Transcript ──────────── */
async function fetchTranscript(videoId) {
    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(`https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(ytUrl)}`, {
        headers: { 'x-api-key': getKey('supadata') }
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Transcript fetch failed: ${res.status} — ${err}`);
    }
    const data = await res.json();
    return data.content || data.transcript || data;
}

/* ─── Fetch Video Title (oEmbed) ──────────── */
async function fetchVideoTitle(videoId) {
    try {
        const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
        const data = await res.json();
        return data.title || 'Untitled Video';
    } catch {
        return 'Untitled Video';
    }
}

/* ─── OpenRouter: AI Structuring ──────────── */
async function structureWithAI(transcript, title) {
    // Truncate transcript if too long (Gemma 3 context is large but let's be safe)
    const maxChars = 25000;
    const text = transcript.length > maxChars ? transcript.slice(0, maxChars) + '\n[transcript truncated]' : transcript;

    const prompt = `You are a skilled editor. Convert this YouTube video transcript into a clean, well-structured article.

Title: "${title}"

Rules:
- Write in clear, concise prose (NOT a transcript)
- Add meaningful H2 section headings (use ##)
- Add H3 subheadings where appropriate (use ###)
- Extract key points as bullet lists where helpful
- Bold important terms and concepts
- Remove filler words, repetition, and verbal tics
- At the end, add a "## Glossary" section with 5-10 key terms defined
- Use clean Markdown formatting
- Do NOT add any introductory meta-commentary like "Here is the article" — just output the article directly

Transcript:
${text}`;

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getKey('openrouter')}`,
            'HTTP-Referer': window.location.origin,
            'X-Title': 'YouTube to Article'
        },
        body: JSON.stringify({
            model: 'google/gemma-3-27b-it:free',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4096,
            temperature: 0.3,
        })
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`AI structuring failed: ${res.status} — ${err}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI returned empty response.');
    return content;
}

/* ─── Render Article ──────────────────────── */
let currentMarkdown = '';
let currentTitle = '';

function renderArticle(title, videoId, markdown) {
    currentMarkdown = markdown;
    currentTitle = title;

    // Video meta
    $('#video-meta').innerHTML = `
    <h1>${esc(title)}</h1>
    <p class="video-meta-sub">
      <a href="https://www.youtube.com/watch?v=${videoId}" target="_blank">Watch original video ↗</a>
    </p>
  `;

    // Parse markdown to HTML
    $('#article-body').innerHTML = markdownToHTML(markdown);
}

/* ─── Simple Markdown → HTML ──────────────── */
function markdownToHTML(md) {
    let html = md
        // Code blocks
        .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre><code>${esc(code.trim())}</code></pre>`)
        // Headings
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        // Bold & italic
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Blockquote
        .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
        // Horizontal rule
        .replace(/^---$/gm, '<hr/>')
        // Unordered list
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        // Ordered list
        .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Wrap consecutive <li> in <ul>
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Merge consecutive blockquotes
    html = html.replace(/<\/blockquote>\n<blockquote>/g, '<br/>');

    // Paragraphs: wrap remaining lines
    html = html.split('\n').map(line => {
        line = line.trim();
        if (!line) return '';
        if (line.startsWith('<h') || line.startsWith('<ul') || line.startsWith('<ol') ||
            line.startsWith('<pre') || line.startsWith('<blockquote') ||
            line.startsWith('<hr') || line.startsWith('<li')) return line;
        return `<p>${line}</p>`;
    }).join('\n');

    return html;
}

/* ─── Export ───────────────────────────────── */
$('#btn-copy-md').addEventListener('click', () => {
    const md = buildObsidianMarkdown();
    navigator.clipboard.writeText(md);
    toast('Copied to clipboard ✓');
});

$('#btn-download-md').addEventListener('click', () => {
    const md = buildObsidianMarkdown();
    const filename = currentTitle.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) + '.md';
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Downloaded ✓');
});

function buildObsidianMarkdown() {
    const frontmatter = `---
source: youtube
title: "${currentTitle.replace(/"/g, '\\"')}"
date: ${new Date().toISOString().slice(0, 10)}
tags: [youtube, article]
---

`;
    return frontmatter + currentMarkdown;
}

/* ─── Back Button ─────────────────────────── */
$('#btn-back').addEventListener('click', () => {
    hide(secArticle);
    show(secInput);
    $('#url-input').value = '';
    $('#url-input').focus();
});

$('#nav-home').addEventListener('click', e => {
    e.preventDefault();
    hide(secArticle);
    hide(secLoading);
    show(secInput);
});

/* ─── Helpers ─────────────────────────────── */
function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    show(el);
    clearTimeout(el._t);
    el._t = setTimeout(() => hide(el), 2800);
}
