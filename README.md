# 🚀 Multi-Course LMS + Creator Studio (CMS) Platform

👉 **Live Hosted Website:** [interactive-learning-platform-ashen.vercel.app](https://interactive-learning-platform-ashen.vercel.app)

A professional, dynamic Learning Management System (LMS) and Content Management System (CMS) designed for programming instruction and recording tutorial videos for YouTube. The platform decouples curriculum data from the presentation UI, loading lesson files dynamically and writing edits directly to disk via local REST APIs.

---

## 📁 Project Directory Structure

```text
/interactive-learning-platform/
│   index.html              # Core platform viewport
│   styles.css              # Custom neon glassmorphic designs & animations
│   app.js                  # LMS/CMS routing switcher, auto-saver, and visualizer modules
│   server.js               # Zero-dependency Node.js dev server & write APIs
│   README.md               # Operations & usage manual
│
├───lib/                    # Offline dependency libraries (GSAP, PrismJS, CSS)
├───webfonts/               # Offline FontAwesome icon fonts
│
└───content/
    │   config.json         # Master Course Registry (phases, days metadata)
    │
    ├───backups/            # Automated backups folder (versions generated on save)
    │
    └───java/
            day_1.json      # Complete "Introduction to Java" lesson JSON payload
```

---

## 🔌 Quick Start: Launching the Local Server

Standard web browsers block dynamic JSON fetches when opening HTML files directly from a directory (due to browser CORS restrictions). You must host it over our local web server:

1. Open your terminal or Command Prompt inside the project directory:
   ```bash
   cd c:\Users\harsh\Desktop\Dairy\interactive-learning-platform
   ```
2. Start the lightweight web server:
   ```bash
   node server.js
   ```
3. Open your browser and navigate to:
   👉 **[http://localhost:5000](http://localhost:5000)**

---

## 👑 Creator Mode (CMS) Studio

Click **Creator Studio** in the top navigation bar to access the Content Management System.

### 1. Lesson Manager Dashboard
* **Dynamic Statistics**: Displays total lessons, drafts, published modules, and recording-ready indicators.
* **Course Creator**: Click **Create Course** to create a new pathway (e.g., Python, SQL, Salesforce, Spring Boot, DSA).
* **Lesson duplication**: Click **Duplicate** on any day card to copy all its slides, code debuggers, and scripts to another day.
* **Archive & Restore**: Deleting a lesson moves it to the **Archive** by default. You can restore archived lessons back to **Draft** status at any time, or permanently delete them.

### 2. Visual Tabbed Lesson Editor
Click **Edit** on any lesson to open the visual workspace editor:
* **Rich Text Toolbar**: Highlight text in the textareas and click **B** (Bold), **I** (Italic), **H3** (Heading), **Code**, or **Callout** to insert Markdown formatting tags. A live preview is rendered dynamically beneath the editor.
* **Interactive Code Tracers**: Configure code visualizer templates (basic, loop, oop, exception) to step through variables inside the Stack & Heap visualizer.
* **Assessment Builders**: Build custom MCQ quizzes (questions, options, correct indices, explanations) and interview QA flashcards.
* **YouTube Scripting**: Save Video Titles, Thumbnail text ideas, SEO descriptions, and prompter scripts (Hook opener, explanation, transition bridge, Call to Action).

### 3. Auto-Save & Version History Backups
* **Auto-Save**: The editor tracks input modifications and automatically triggers a background save every **10 seconds**, displaying a pulsing `● Auto-Saving...` indicator before completing with `✓ Saved`.
* **Manual Save**: Click the **Save Changes** button at any time to commit edits immediately.
* **Automatic Version Backups**: Before writing changes to disk, the server copies your current file to `content/backups/[course]_[day]_v[timestamp].json`.
* **Version History Selector**: You can view previous versions in the dropdown, select one, and click **Restore** to roll back your inputs.

---

## 🎓 Student Mode (LMS) Presentation

Click **Student Preview** inside the editor or click on a lesson card in the **Roadmap Dashboard** to launch the lesson workspace.

### 🎥 Presenter Tools & Video Recording
Press the **Start Recording** button to begin:
1. **Recording Checklist**: A modal pops up to confirm your microphone setup, screen resolution (1080p or 4K), active presenter modes, prompter visibilities, and slide alignment.
2. **Auto Presenter Boot**: Toggles fullscreen browser, hides all CMS menus/sidebars, and opens the draggable, transparent prompter speaker notes card.
3. **Laser Pointer Mode (Shortcut: `L`)**: A neon-red glowing laser dot follows your cursor across the screen to highlight specific code lines or visual nodes for viewers.
4. **Focus Highlight Mode (Shortcut: `H`)**: Dims the background presentation slides, highlighting only the specific cards, analogies, or code rows directly beneath your cursor.

### ⌨️ Keyboard Shortcuts
* **`R`**: Trigger Recording Checklist Modal.
* **`L`**: Toggle Laser Pointer Mode.
* **`H`**: Toggle Focus Highlight Mode.
* **`Space` or `ArrowRight`**: Advance to next slide section.
* **`ArrowLeft`**: Return to previous slide section.
* **`F`**: Toggle Full Screen browser.
* **`N`**: Hide / Show Speaker Notes prompter card.
* **`M`**: Minimize / Maximize speaker notes card.
* **`P`**: Toggle Presenter Mode layout.
