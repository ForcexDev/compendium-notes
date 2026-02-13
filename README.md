# Smart Class Notes - AI Study Companion

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Powered by Astro](https://img.shields.io/badge/Astro-4.0-orange?logo=astro&logoColor=white)](https://astro.build/)
[![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react&logoColor=white)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

A professional-grade, privacy-first web application that transforms audio recordings into structured academic notes using advanced AI models. Built with **Astro**, **React**, and **TypeScript** for a blazing fast, zero-latency experience.

**BYOK Edition**: Bring Your Own Key. No subscriptions, no backend data storage, and 100% client-side processing for maximum privacy.

![Project Preview](public/preview.png)

---

## 🌐 Live Demo

Try the application immediately: **[smart-class-notes.vercel.app](https://smart-class-notes.vercel.app/)**

The web application runs entirely in your browser. Simply enter your free **Groq** or **Google Gemini** API key to start processing lectures, meetings, and voice notes instantly.

---

## ✨ Features

### Core Capabilities
- **Dual AI Engine** - Choose between **Groq** (Speed) and **Gemini** (Context/Multimodal).
- **Privacy-First Architecture** - Keys and data stored exclusively in `localStorage`. Direct Browser-to-API communication.
- **Smart Transcription** - Uses **Whisper v3 Turbo** (via Groq) or **Gemini Flash 2.0** for near-perfect audio-to-text accuracy.
- **Structured Notes** - Automatically organizes content into Summaries, Key Concepts, Definitions, and Chronological Notes.
- **Multiple Formats** - Export notes in **Minimalist**, **Academic**, or **Cornell** styles (HTML/PDF).
- **Multi-Language** - Native support for **English** and **Spanish** interfaces and processing.

### Technology Stack
- **Frontend**: Astro (Static Shell) + React (Interactive App)
- **Styling**: Tailwind CSS + Framer Motion
- **State Management**: Zustand (Persisted)
- **AI Integration**: Direct REST API calls to Groq Cloud & Google AI Studio

---

## ⚡ Model Benchmarks

Real-world processing performance for a 1-hour lecture (~50MB audio):

| Provider | Model | Speed | Cost (Free Tier) | Best For |
|----------|-------|-------|------------------|----------|
| **Groq** | Whisper v3 + Llama 3.3 70B | ~30 seconds | Free (High Rate Limits) | Speed & Privacy |
| **Gemini** | Flash 2.0 | ~45 seconds | Free (Generous Quota) | Long Context & Nuance |

**Key Insights:**
- **Groq** is incredibly fast for transcription and text organization.
- **Gemini** has a massive context window (1M+ tokens), making it ideal for extremely long recordings.
- Both providers offer generous free tiers that cover essentially unlimited personal use.

---

## 🏗️ Architecture

```mermaid
graph TD
    User[User Browser]
    subgraph "Client Side (Your Device)"
        Upload[Audio File]
        Store[LocalStorage (Keys)]
        App[Smart Class Notes App]
    end
    
    subgraph "External AI APIs"
        Groq[Groq API (Whisper/Llama)]
        Gemini[Google API (Gemini Flash)]
    end

    User --> Upload
    Upload --> App
    Store --> App
    
    App -- "Direct HTTPS (No Backend)" --> Groq
    App -- "Direct HTTPS (No Backend)" --> Gemini
    
    Groq -- "Transcription & Notes" --> App
    Gemini -- "Transcription & Notes" --> App
    
    App --> Result[Formatted PDF/Notes]
```

---

## 🚀 Installation

### Prerequisites
- Node.js 18+
- NPM or PNPM

### Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/ForcexDev/SmartClassNotes.git
   cd SmartClassNotes
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch the development server:
   ```bash
   npm run dev
   ```

4. Access the app at `http://localhost:4321`

---

## ⚙️ Configuration

No complex setup required. The application works out-of-the-box.

### API Keys
To use the application, you will need a free API Key from:
- **Groq**: [console.groq.com](https://console.groq.com)
- **Google Gemini**: [aistudio.google.com](https://aistudio.google.com)

Enter them in the application settings (gear icon).

---

## 📸 Use Cases

- **University Students** - Record lectures and instantly get Cornell-style study notes.
- **Professionals** - Transcribe meetings and generate executive summaries and action items.
- **Researchers** - Process interviews and oral histories into searchable text.
- **Content Creators** - Convert voice memos into blog posts or structured scripts.

---

## 🔧 Troubleshooting

### "API Key Invalid"
- Ensure your key has no extra spaces.
- Verify you have selected the correct provider matching your key.

### "Rate Limit Exceeded"
- Groq has strict per-minute limits on the free tier. If you hit strict limits, switch to Gemini or wait a minute.
- The app handles backoff automatically, but heavy usage may trigger temporary blocks.

---

## 🤝 Contributing

Contributions are welcome! Please open an issue to discuss major changes before submitting a pull request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

**Developed by [ForcexDev](https://github.com/ForcexDev)**
