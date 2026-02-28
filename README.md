# 📖 YouTube → Article

Turn any YouTube video into a clean, structured article. Export to Obsidian.

🔗 **[Try it live →](https://imadjalloul.github.io/youtube-to-article/)**

---

## How It Works

1. **Paste a YouTube URL** — any video with captions
2. **AI structures it** — headings, key points, glossary
3. **Export to Obsidian** — copy Markdown or download `.md` with YAML frontmatter

## What You Need

| Service | Purpose | Cost |
|---|---|---|
| [Supadata](https://dash.supadata.ai) | Fetches YouTube transcripts | Free tier |
| [OpenRouter](https://openrouter.ai/keys) | AI structuring (Gemma 3 27B) | Free model |

API keys are stored in your browser only — never sent anywhere except the respective APIs.

## Features

- 📖 Clean article view with serif typography
- 🧠 AI-powered section headings, key points, and glossary
- 📋 One-click Markdown copy
- ⬇️ Download `.md` with Obsidian-ready YAML frontmatter
- ⚡ No signup, no backend, works instantly
- 🔒 API keys stay in your browser (localStorage)

## Tech Stack

- Vite + Vanilla JS — zero dependencies
- Supadata API — YouTube transcript extraction
- OpenRouter — free AI model (Gemma 3 27B)
- Minimal CSS — clean light theme

## Getting Started

```bash
git clone https://github.com/Imadjalloul/youtube-to-article.git
cd youtube-to-article
npm install
npm run dev
```

## License

[MIT](./LICENSE)

---

*Built by [Imad Jalloul](https://github.com/Imadjalloul)*
