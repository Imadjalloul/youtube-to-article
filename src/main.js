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
    gemini: 'AIzaSyDnbC1dFfOuguPcFXD96j5JlaZLxS0bcOE',
    openrouter: '',
    provider: 'gemini',
};
function getKey(name) { return localStorage.getItem(`yta-${name}`) || DEFAULTS[name] || ''; }
function setKey(name, val) { localStorage.setItem(`yta-${name}`, val); }

$('#btn-settings').addEventListener('click', () => {
    $('#key-supadata').value = getKey('supadata');
    $('#key-gemini').value = getKey('gemini');
    $('#key-openrouter').value = getKey('openrouter');
    $('#provider-select').value = getKey('provider');
    show($('#settings-modal'));
});
$('#btn-close-settings').addEventListener('click', () => hide($('#settings-modal')));
$('#settings-modal').addEventListener('click', e => { if (e.target === $('#settings-modal')) hide($('#settings-modal')); });

$('#btn-save-keys').addEventListener('click', () => {
    setKey('supadata', $('#key-supadata').value.trim());
    setKey('gemini', $('#key-gemini').value.trim());
    setKey('openrouter', $('#key-openrouter').value.trim());
    setKey('provider', $('#provider-select').value);
    hide($('#settings-modal'));
    toast('Settings saved ✓');
});

/* ─── Convert Flow ────────────────────────── */
$('#btn-convert').addEventListener('click', startConversion);
$('#url-input').addEventListener('keydown', e => { if (e.key === 'Enter') startConversion(); });

async function startConversion() {
    const url = $('#url-input').value.trim();
    const videoId = extractVideoId(url);
    const provider = getKey('provider');

    if (!videoId) return toast('⚠️ Please paste a valid YouTube URL');
    if (!getKey('supadata')) return toast('⚠️ Set your Supadata API key first (⚙️)');
    if (provider === 'gemini' && !getKey('gemini')) return toast('⚠️ Set your Google AI Studio key first (⚙️)');
    if (provider === 'openrouter' && !getKey('openrouter')) return toast('⚠️ Set your OpenRouter key first (⚙️)');

    hide(secInput);
    show(secLoading);

    try {
        // Step 1: Fetch transcript
        loadStatus.textContent = 'Fetching transcript…';
        const transcript = await fetchTranscript(videoId);
        if (!transcript || transcript.length === 0) throw new Error('No transcript found for this video.');

        // Step 2: Extract structure (Pass 1)
        loadStatus.textContent = 'Analyzing content…';
        const rawText = transcript.map(s => s.text).join(' ');
        const title = await fetchVideoTitle(videoId);
        const outline = await extractOutline(rawText, title);

        // Step 3: Write full article (Pass 2)
        loadStatus.textContent = 'Writing article…';
        const article = await writeArticle(outline, title);

        // Step 4: Render
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

/* ─── AI: Two-Pass Processing ─────────────── */

// Pass 1: Extract outline & structure
async function extractOutline(transcript, title) {
    const maxChars = 60000;
    const text = transcript.length > maxChars ? transcript.slice(0, maxChars) + '\n[transcript truncated]' : transcript;

    const prompt = `You are an expert content analyst. Analyze this YouTube video transcript and extract a detailed outline.

Video Title: "${title}"

Return a structured outline in this EXACT format:

## Main Topic
[One sentence describing the core subject]

## Key Sections
1. [Section title] — [2-3 sentence summary of what's covered]
2. [Section title] — [2-3 sentence summary]
3. [Continue for all major sections...]

## Key Quotes
- "[Exact notable quote from transcript]"
- "[Another key quote]"
- [List 3-5 most impactful quotes]

## Key Concepts & Terms
- **[Term]**: [Brief definition or context]
- [List 5-10 important concepts mentioned]

## Main Takeaways
1. [Key takeaway 1]
2. [Key takeaway 2]
3. [List 3-7 takeaways]

IMPORTANT: Be thorough. Capture ALL major topics discussed. Do not add commentary — just extract and organize.

Transcript:
${text}`;

    return await callAI(prompt);
}

// Pass 2: Write the full article
async function writeArticle(outline, title) {
    const prompt = `You are a professional journalist and editor. Using the outline below, write a polished, publication-ready article.

Article Title: "${title}"

WRITING GUIDELINES:
- Write in clear, engaging, professional prose
- Use a compelling opening paragraph that hooks the reader
- Organize with H2 (##) section headings and H3 (###) subheadings where appropriate
- Write smooth transitions between sections — the article should flow naturally
- Integrate key quotes using blockquotes (> format)
- Use bullet points and numbered lists where they improve clarity
- Bold important terms and concepts on first mention
- Add context and background where the speaker assumed prior knowledge
- End with a strong concluding section that ties everything together
- After the conclusion, add a "## Key Takeaways" section with the most important points as a bullet list
- Finally, add a "## Glossary" section defining 5-10 key terms from the content

FORMATTING:
- Use clean Markdown
- Do NOT include any meta-commentary like "Here is the article" — output ONLY the article
- Do NOT repeat the title as an H1 — start directly with the opening paragraph

OUTLINE TO EXPAND:
${outline}`;

    return await callAI(prompt);
}

/* ─── AI Provider Abstraction ─────────────── */
async function callAI(prompt) {
    const provider = getKey('provider');
    if (provider === 'gemini') return callGemini(prompt);
    return callOpenRouter(prompt);
}

// Google AI Studio (Gemini 2.5 Flash)
async function callGemini(prompt) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${getKey('gemini')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 8192 }
        })
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini API failed: ${res.status} — ${err}`);
    }

    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('Gemini returned empty response.');
    return content;
}

// OpenRouter (any model)
async function callOpenRouter(prompt) {
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
            max_tokens: 8192,
            temperature: 0.4,
        })
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenRouter failed: ${res.status} — ${err}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenRouter returned empty response.');
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
