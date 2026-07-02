/**
 * Java Academy - Core LMS Engine
 * Dynamically fetches lesson JSON files, builds presenter slides, links stack-heap tracing,
 * manages LocalStorage progress state, and powers the Lesson Generator & Validator modals.
 */

// Global LMS Configurations
let lmsConfig = null;
let activeCourse = 'java';
let completedDays = {}; // Stores { day_1: true, day_2: true }
let currentDayId = 'day_1';
let currentSectionIndex = 0;
let currentDryRunStep = 0;
let activeQuizQuestionIndex = 0;
let quizScore = 0;
let isReducedAnimation = false;

// Active Filters for Dashboard
let activeFilters = {
  difficulty: 'all',
  category: 'all',
  interview: false
};

// Speaker Notes UI Settings
let notesProps = {
  locked: false,
  collapsed: false,
  opacity: 95,
  fontSize: 1.15 // in rem
};

// Cached DOM Elements
let DOM = {};

// CMS Creator Mode Global State
let activeView = 'dashboard';
let currentEditingDayId = '';
let autoSaveIntervalId = null;
let editorHasChanges = false;
let isLaserPointerActive = false;
let isFocusHighlightActive = false;

document.addEventListener('DOMContentLoaded', () => {
  cacheDOMElements();
  loadProgress();
  setupDraggableSpeakerNotes();
  setupKeyboardShortcuts();
  setupInterviewDeck();
  restoreNotesSettings();
  
  // Inject the laser pointer dot element dynamically
  const dot = document.createElement('div');
  dot.id = 'laser-pointer-dot';
  document.body.appendChild(dot);
  
  // Load config.json dynamically
  fetchLMSConfig();
});

function cacheDOMElements() {
  DOM = {
    body: document.body,
    search: document.getElementById('search-input'),
    roadmapGrid: document.getElementById('roadmap-grid-container'),
    workspaceDaySelect: document.getElementById('workspace-day-select'),
    courseSelect: document.getElementById('course-select'),
    sidebarNav: document.getElementById('sidebar-nav'),
    mainContent: document.querySelector('main'),
    slideNumIndicator: document.getElementById('slide-num-indicator'),
    speakerNotesPanel: document.getElementById('speaker-notes-panel'),
    speakerNotesBody: document.getElementById('speaker-notes-body'),
    notesOpacitySlider: document.getElementById('notes-opacity-slider'),
    btnNotesLock: document.getElementById('btn-notes-lock'),
    presenterControls: document.getElementById('presenter-controls'),
    fullscreenIcon: document.getElementById('fullscreen-icon'),
    dashboardProgressTxt: document.getElementById('dashboard-progress-txt'),
    dashboardProgressBar: document.getElementById('dashboard-progress-bar'),
    dashboardProgressNumeric: document.getElementById('dashboard-progress-numeric'),
    markCompleteBtn: document.getElementById('mark-complete-btn'),
    
    // CMS DOM Elements
    cmsCourseSelect: document.getElementById('cms-course-select'),
    cmsStatLessons: document.getElementById('cms-stat-lessons'),
    cmsStatReady: document.getElementById('cms-stat-ready'),
    cmsStatDrafts: document.getElementById('cms-stat-drafts'),
    cmsStatPublished: document.getElementById('cms-stat-published'),
    cmsLessonsTbody: document.getElementById('cms-lessons-tbody'),
    creatorDashboardView: document.getElementById('creator-dashboard-view'),
    creatorEditorView: document.getElementById('creator-editor-view'),
    editorHeading: document.getElementById('editor-heading'),
    cmsSaveStatus: document.getElementById('cms-save-status'),
    genVersionsSelect: document.getElementById('gen-versions-select'),
    recordingChecklistModal: document.getElementById('recording-checklist-modal'),
    laserPointerBtn: document.getElementById('laser-pointer-btn'),
    focusHighlightBtn: document.getElementById('focus-highlight-btn')
  };
}

/* ==========================================================================
   VIEW ROUTING SWITCHER
   ========================================================================== */
function switchView(viewName) {
  activeView = viewName;
  
  // Manage CSS Classes
  document.querySelectorAll('.view-pane').forEach(pane => {
    pane.classList.remove('active-view');
  });
  document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  const activePane = document.getElementById(`view-${viewName}`);
  const activeBtn = document.getElementById(`btn-view-${viewName}`);
  
  if (activePane) activePane.classList.add('active-view');
  if (activeBtn) activeBtn.classList.add('active');
  
  // Custom View specific adjustments
  if (viewName === 'dashboard') {
    renderRoadmapDashboard(); // Re-render to show updated progress checks
    DOM.speakerNotesPanel.style.display = 'none';
  } else if (viewName === 'lesson') {
    DOM.speakerNotesPanel.style.display = DOM.body.classList.contains('presenter-mode') ? 'block' : 'none';
    loadActiveDay(currentDayId);
  } else if (viewName === 'interview') {
    DOM.speakerNotesPanel.style.display = 'none';
    renderInterviewDeck('mcqs');
  } else if (viewName === 'creator') {
    DOM.speakerNotesPanel.style.display = 'none';
    renderCMSDashboard();
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function loadDayFromWorkspaceSelect(dayId) {
  loadActiveDay(dayId);
}

/* ==========================================================================
   CONFIG & DATA FETCH ENGINE
   ========================================================================== */
function fetchLMSConfig() {
  fetch('content/config.json')
    .then(response => {
      if (!response.ok) {
        throw new Error("Failed to load content/config.json");
      }
      return response.json();
    })
    .then(data => {
      lmsConfig = data;
      activeCourse = data.activeCourse || 'java';
      
      // Populate course selects
      populateCourseSelectors();
      
      // Render dashboard grid mapping
      renderRoadmapDashboard();
      
      // Load workspace selector items
      loadWorkspaceDaySelector();
      
      // Load active day
      loadActiveDay(currentDayId);
    })
    .catch(err => {
      console.error("Config Loading Error: ", err);
      // Fallback in case server isn't run, load default layout values
      DOM.roadmapGrid.innerHTML = `
        <div class="glass-card" style="padding: 3rem; text-align: center; border-color: #ef4444;">
          <i class="fa-solid fa-triangle-exclamation icon-orange" style="font-size: 4rem; margin-bottom: 1.5rem;"></i>
          <h3>Local Fetch CORS Block Detected</h3>
          <p class="large-text" style="margin-top: 1rem;">To fetch JSON lessons dynamically, the files must be served over HTTP.</p>
          <div style="margin-top: 2rem;">
            <code>node server.js</code>
          </div>
          <p style="font-size: 1rem; color: var(--text-secondary); margin-top: 1.5rem;">Run the server script in your terminal and open <strong>http://localhost:5000</strong></p>
        </div>
      `;
    });
}

function populateCourseSelectors() {
  const select = DOM.courseSelect;
  if (!select || !lmsConfig) return;
  
  select.innerHTML = '';
  Object.keys(lmsConfig.courses).forEach(key => {
    const course = lmsConfig.courses[key];
    const option = document.createElement('option');
    option.value = key;
    option.textContent = course.title;
    if (key === activeCourse) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

function switchActiveCourse(courseId) {
  if (!lmsConfig.courses[courseId]) return;
  activeCourse = courseId;
  lmsConfig.activeCourse = courseId;
  
  // Re-sync dashboard info
  const course = lmsConfig.courses[courseId];
  document.getElementById('dashboard-title').textContent = `${course.title} Roadmap`;
  document.getElementById('dashboard-desc').textContent = `Learn ${course.category} concepts from beginner to advanced placement tiers.`;
  
  // Refresh views
  renderRoadmapDashboard();
  loadWorkspaceDaySelector();
  
  // Reset day pointer to day 1
  currentDayId = 'day_1';
  loadActiveDay('day_1');
}

/* ==========================================================================
   ROADMAP DASHBOARD MANAGER
   ========================================================================== */
function renderRoadmapDashboard() {
  const container = DOM.roadmapGrid;
  if (!container || !lmsConfig) return;
  
  container.innerHTML = '';
  const course = lmsConfig.courses[activeCourse];
  const allDays = Object.keys(course.days).map(k => {
    return { id: k, ...course.days[k] };
  });
  
  const query = DOM.search.value.toLowerCase().trim();
  
  // Apply Search Filters
  const filtered = allDays.filter(day => {
    const matchQuery = day.title.toLowerCase().includes(query) || day.category.toLowerCase().includes(query);
    if (!matchQuery) return false;
    
    if (activeFilters.difficulty !== 'all' && day.difficulty !== activeFilters.difficulty) return false;
    if (activeFilters.category !== 'all' && day.category !== activeFilters.category) return false;
    if (activeFilters.interview && !day.isInterviewImportant) return false;
    
    return true;
  });

  // Render Phases Grid
  course.phases.forEach(phase => {
    const phaseDays = filtered.filter(d => d.phase === phase.id);
    if (phaseDays.length === 0) return;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'phase-card-wrapper';
    
    let daysHtml = '';
    phaseDays.forEach(day => {
      const activeClass = completedDays[`${activeCourse}_${day.id}`] ? 'completed' : '';
      const diffClass = day.difficulty === 'Beginner' ? 'beg' : (day.difficulty === 'Intermediate' ? 'int' : 'adv');
      const starIcon = day.isInterviewImportant ? '<i class="fa-solid fa-star mini-important-star" title="Interview Important"></i>' : '';
      
      // Determine Status Badge
      const statusText = day.status || 'Empty';
      const statusClass = statusText.toLowerCase();
      const statusBadge = `<span class="mini-status-tag ${statusClass}">${statusText}</span>`;
      
      // Recording Ready Tag
      const recBadge = day.isRecordingReady ? `<div class="badge-rec-ready"><i class="fa-solid fa-video"></i> Rec Ready</div>` : '';
      
      daysHtml += `
        <div class="day-roadmap-badge ${activeClass}" onclick="openLessonFromDashboard('${day.id}')">
          <div class="badge-day-label" style="display:flex; justify-content:space-between; align-items:center;">
            <span>Day ${day.dayNum}</span>
            ${statusBadge}
          </div>
          <div class="badge-day-title">${day.title}</div>
          <div class="badge-tags-row" style="flex-wrap: wrap; margin-top: auto;">
            <span class="mini-difficulty-tag ${diffClass}">${day.difficulty}</span>
            ${starIcon}
            ${recBadge}
          </div>
        </div>
      `;
    });
    
    wrapper.innerHTML = `
      <div class="phase-header-info">
        <h3>${phase.title}</h3>
        <p>${phase.description}</p>
      </div>
      <div class="phase-days-grid">
        ${daysHtml}
      </div>
    `;
    
    container.appendChild(wrapper);
  });
  
  updateProgressUI();
}

function filterRoadmap() {
  renderRoadmapDashboard();
}

function toggleFilter(btn, filterType) {
  const value = btn.getAttribute('data-filter');
  
  if (filterType === 'all') {
    activeFilters.difficulty = 'all';
    activeFilters.category = 'all';
    activeFilters.interview = false;
    document.querySelectorAll('.filter-tag-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  } else if (filterType === 'difficulty') {
    btn.classList.toggle('active');
    activeFilters.difficulty = btn.classList.contains('active') ? value : 'all';
  } else if (filterType === 'category') {
    btn.classList.toggle('active');
    activeFilters.category = btn.classList.contains('active') ? value : 'all';
  } else if (filterType === 'interview') {
    btn.classList.toggle('active');
    activeFilters.interview = btn.classList.contains('active');
  }
  
  if (activeFilters.difficulty !== 'all' || activeFilters.category !== 'all' || activeFilters.interview) {
    document.querySelector('.filter-tag-btn[data-filter="all"]').classList.remove('active');
  } else {
    document.querySelector('.filter-tag-btn[data-filter="all"]').classList.add('active');
  }
  
  renderRoadmapDashboard();
}

function openLessonFromDashboard(dayId) {
  currentDayId = dayId;
  DOM.workspaceDaySelect.value = dayId;
  switchView('lesson');
}

/* ==========================================================================
   DYNAMIC LESSON LOADER & SLIDE COMPILER
   ========================================================================== */
function loadWorkspaceDaySelector() {
  const select = DOM.workspaceDaySelect;
  if (!select || !lmsConfig) return;
  
  select.innerHTML = '';
  const course = lmsConfig.courses[activeCourse];
  
  Object.keys(course.days).forEach(key => {
    const day = course.days[key];
    const option = document.createElement('option');
    option.value = key;
    option.textContent = `Day ${day.dayNum}: ${day.title}`;
    select.appendChild(option);
  });
}

function loadActiveDay(dayId) {
  currentDayId = dayId;
  const filePath = `content/${activeCourse}/${dayId}.json`;
  
  fetch(filePath)
    .then(response => {
      if (!response.ok) {
        throw new Error("File not found");
      }
      return response.json();
    })
    .then(lessonData => {
      // Load detailed lesson structure from fetched JSON
      compileFetchedLesson(lessonData);
      updateProgressUI();
    })
    .catch(err => {
      // Fallback: render placeholder if the JSON file has not been created yet
      loadPlaceholderLesson(dayId);
    });
}

function compileFetchedLesson(day) {
  currentSectionIndex = 0;
  
  // Renders Main Presentation slides
  const container = DOM.mainContent;
  if (!container) return;
  
  let html = '';
  
  // 1. Objectives slide
  html += `
    <section id="slide-0" class="content-section active">
      ${day.contentSlides[0].html}
    </section>
  `;
  
  // 2. Analogy slide
  html += `
    <section id="slide-1" class="content-section">
      ${day.contentSlides[1].html}
    </section>
  `;
  
  // 3. Custom Diagrams if present
  let widgetOffset = 2;
  if (day.contentSlides.length > 2) {
    for (let i = 2; i < day.contentSlides.length; i++) {
      html += `
        <section id="slide-${i}" class="content-section">
          ${day.contentSlides[i].html}
        </section>
      `;
      widgetOffset++;
    }
  }

  // 4. Debugger & Heap Stack Memory Slide
  const debugScript = debuggerScripts[day.codeType] || debuggerScripts.basic;
  html += `
    <section id="slide-${widgetOffset}" class="content-section">
      <h3>Practical Coding & Syntax</h3>
      <p class="large-text">Trace variable frames and references inside the Stack & Heap visualizer.</p>
      ${compileDebuggerHtml(debugScript)}
    </section>
  `;
  
  // 5. Quiz Slide
  html += `
    <section id="slide-${widgetOffset + 1}" class="content-section">
      <h3>Lesson Assessment Quiz</h3>
      <p class="large-text">Select your answer option to reveal the validation parameters.</p>
      <div class="quiz-wrapper">
        <div class="quiz-card" id="lesson-quiz-card"></div>
      </div>
    </section>
  `;
  
  // 6. Interview QA Slide
  html += `
    <section id="slide-${widgetOffset + 2}" class="content-section">
      <h3>Technical Placement QA Cards</h3>
      <p class="large-text">Click on any card to flip and verify answers.</p>
      <div class="flashcards-grid">
        ${compileInterviewCardsHtml(day.interviewCards)}
      </div>
    </section>
  `;
  
  // 7. Assignment Slide
  html += `
    <section id="slide-${widgetOffset + 3}" class="content-section">
      ${day.assignmentContent}
    </section>
  `;

  // 8. YouTube Meta Assets Slide
  html += `
    <section id="slide-${widgetOffset + 4}" class="content-section">
      <h3>YouTube Creator Scripts & Video Metadata</h3>
      <p class="large-text">Directly copyable text components for your YouTube playlist setup.</p>
      <div class="youtube-assets-grid">
        <div class="meta-box-card">
          <h5>Video Description Upload Metadata</h5>
          <div class="copy-input-row">
            <span style="font-weight:700; width:120px;">Video Title:</span>
            <input type="text" id="yt-title" value="${day.youtubeTitle}" readonly />
            <button class="copy-btn" onclick="copyValue('yt-title')"><i class="fa-solid fa-copy"></i> Copy</button>
          </div>
          <div class="copy-input-row" style="margin-top: 1rem;">
            <span style="font-weight:700; width:120px;">Description:</span>
            <textarea id="yt-desc" readonly>${day.youtubeDesc}</textarea>
            <button class="copy-btn" onclick="copyValue('yt-desc')"><i class="fa-solid fa-copy"></i> Copy</button>
          </div>
        </div>
        
        <div class="meta-box-card">
          <h5>Thumbnail Layout Ideas</h5>
          ${day.thumbnails.map(t => `<div class="thumbnail-idea-item"><i class="fa-solid fa-image icon-cyan"></i> ${t}</div>`).join('')}
        </div>

        <div class="meta-box-card">
          <h5>Recording Script Prompter</h5>
          <div class="script-tabs-row">
            <button class="script-tab-btn active" onclick="switchScriptTab(this, 'opening', '${day.id}')">Hook Opener</button>
            <button class="script-tab-btn" onclick="switchScriptTab(this, 'explanation', '${day.id}')">Explanation</button>
            <button class="script-tab-btn" onclick="switchScriptTab(this, 'transition', '${day.id}')">Bridge Link</button>
            <button class="script-tab-btn" onclick="switchScriptTab(this, 'closing', '${day.id}')">Closing Recap</button>
            <button class="script-tab-btn" onclick="switchScriptTab(this, 'cta', '${day.id}')">Call to Action</button>
          </div>
          <div class="script-content-pane" id="prompter-script-box">
            ${day.scripts.opening}
          </div>
        </div>
      </div>
    </section>
  `;
  
  html += `
    <footer class="glass-card" style="margin-top: 4rem; padding: 2rem; text-align: center;">
      <p>© 2026 Interactive Programming Academy. Served Locally.</p>
    </footer>
  `;
  
  container.innerHTML = html;

  // Render sidebar indexes
  renderLessonSidebarIndex(day.contentSlides.length);
  
  // Attach listeners
  attachWorkspaceListeners(day);
  
  // Update speaker prompt notes
  loadPresenterNotes(day);
  
  updateProgress();
  resetCurrentSlideAnimations();
}

function loadPlaceholderLesson(dayId) {
  currentSectionIndex = 0;
  const course = lmsConfig.courses[activeCourse];
  const meta = course.days[dayId];
  if (!meta) return;

  const container = DOM.mainContent;
  container.innerHTML = `
    <section id="slide-0" class="content-section active">
      <div class="visual-badge"><i class="fa-solid fa-triangle-exclamation icon-orange"></i> Template Placeholder</div>
      <h2>Day ${meta.dayNum}: ${meta.title}</h2>
      <p class="large-text" style="margin-top: 1rem;">This lesson content file (<code>content/${activeCourse}/${dayId}.json</code>) is empty or has not been created yet.</p>
      
      <div class="analogy-box" style="border-left-color: var(--neon-cyan); background: rgba(0, 240, 255, 0.02); margin-top: 2rem;">
        <div class="analogy-header" style="color: var(--neon-cyan);"><i class="fa-solid fa-circle-info"></i> How to add this lesson?</div>
        <div class="analogy-content">
          <p>You can create this lesson in two simple ways:</p>
          <ol style="margin-top: 1rem; padding-left: 1.5rem; line-height: 1.8;">
            <li>Click the <strong>Lesson Generator & Validator</strong> button on the Roadmap Dashboard.</li>
            <li>Fill out the form fields for <strong>Day ${meta.dayNum}</strong> and download the compiled JSON file.</li>
            <li>Move the downloaded file to your local directory: <br><strong style="font-family:var(--font-mono); color: var(--neon-purple);">/content/${activeCourse}/${dayId}.json</strong></li>
          </ol>
        </div>
      </div>

      <div style="margin-top: 3rem; display: flex; gap: 1rem;">
        <button class="primary-btn" onclick="openGeneratorWithMeta(${meta.dayNum}, '${meta.title}', '${meta.category}', '${meta.difficulty}', '${meta.codeType}')"><i class="fa-solid fa-hammer"></i> Open Lesson Generator</button>
        <button class="secondary-btn" onclick="switchView('dashboard')"><i class="fa-solid fa-map"></i> Return to Roadmap</button>
      </div>
    </section>
  `;

  // Render blank sidebar index
  DOM.sidebarNav.innerHTML = `
    <li class="sidebar-nav-item active">
      <a class="sidebar-nav-link">
        <span class="nav-index">1.</span>
        <span class="nav-title">Lesson Placeholder</span>
      </a>
    </li>
  `;

  DOM.slideNumIndicator.textContent = "1 / 1";
  DOM.speakerNotesPanel.style.display = 'none';
  
  updateProgressUI();
}

function renderLessonSidebarIndex(slideCount) {
  const nav = DOM.sidebarNav;
  if (!nav) return;
  
  nav.innerHTML = '';
  const labels = ["Learning Objectives", "Real-World Analogy"];
  
  // Custom diagrams offset
  if (slideCount > 2) {
    for (let i = 2; i < slideCount; i++) {
      labels.push(`Diagram Section ${i - 1}`);
    }
  }
  
  labels.push("Debugger & Memory", "MCQ Practice Quiz", "Interview Q&As", "Homework Assignments", "YouTube Script Creator");
  
  labels.forEach((title, idx) => {
    const li = document.createElement('li');
    li.className = 'sidebar-nav-item' + (idx === 0 ? ' active' : '');
    li.innerHTML = `
      <a class="sidebar-nav-link" onclick="goToSection(${idx})">
        <span class="nav-index">${idx + 1}.</span>
        <span class="nav-title">${title}</span>
      </a>
    `;
    nav.appendChild(li);
  });
}

function loadPresenterNotes(day) {
  const body = DOM.speakerNotesBody;
  if (!body) return;
  
  body.innerHTML = `
    <h5><i class="fa-solid fa-comments icon-cyan"></i> Video Hook Opening</h5>
    <p>${day.scripts.opening}</p>
    <h5><i class="fa-solid fa-book-open icon-purple"></i> Key Analogy</h5>
    <p>${day.scripts.explanation}</p>
    <h5><i class="fa-solid fa-chevron-right icon-emerald"></i> Transition Bridge</h5>
    <p>${day.scripts.transition}</p>
    <h5><i class="fa-solid fa-flag-checkered icon-orange"></i> Closing Call to Action</h5>
    <p>${day.scripts.cta}</p>
  `;
}

function switchScriptTab(btn, tab, dayId) {
  document.querySelectorAll('.script-tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  
  const scriptBox = document.getElementById('prompter-script-box');
  if (scriptBox) {
    // We parse the value directly from global state or loaded DOM properties
    // But since lessons are AJAX loaded, we can read it from app state
    // For simplicity, we can fetch active day script element
    const dayData = javaRoadmapLessons[dayId];
    // In our dynamic model, it reads the active DOM textarea or JSON cache
    // Let's query file cache (to fetch active loaded JSON scripts)
    const filePath = `content/${activeCourse}/${dayId}.json`;
    fetch(filePath)
      .then(res => res.json())
      .then(data => {
        scriptBox.textContent = data.scripts[tab];
      });
  }
}

/* ==========================================================================
   LESSON GENERATOR & VALIDATOR MODAL
   ========================================================================== */
function openGeneratorModal() {
  document.getElementById('generator-modal').style.display = 'flex';
  document.getElementById('validation-report-panel').innerHTML = '';
}

function openGeneratorWithMeta(dayNum, title, category, difficulty, codeType) {
  openGeneratorModal();
  document.getElementById('gen-day-num').value = dayNum;
  document.getElementById('gen-lesson-title').value = title;
  document.getElementById('gen-category').value = category;
  document.getElementById('gen-difficulty').value = difficulty;
  document.getElementById('gen-code-type').value = codeType || 'basic';
}

function closeGeneratorModal() {
  document.getElementById('generator-modal').style.display = 'none';
}

function generateLessonJsonString() {
  const dayNum = parseInt(document.getElementById('gen-day-num').value) || 2;
  const title = document.getElementById('gen-lesson-title').value || "Variables & Types";
  const category = document.getElementById('gen-category').value || "Fundamentals";
  const difficulty = document.getElementById('gen-difficulty').value || "Beginner";
  const codeType = document.getElementById('gen-code-type').value || "basic";
  
  const templateObj = {
    id: `day_${dayNum}`,
    dayNum: dayNum,
    title: title,
    category: category,
    difficulty: difficulty,
    status: "Complete",
    isRecordingReady: true,
    codeType: codeType,
    youtubeTitle: `${lmsConfig.courses[activeCourse].title} - Day ${dayNum}: Master ${title}!`,
    youtubeDesc: `Welcome to Day ${dayNum} of the course! Today, we deep dive into ${title}.\n\n📌 Download lesson study notes inside the web portal.`,
    thumbnails: [
      `Day ${dayNum}: ${title} (Visual Guide)`,
      `Don't fail interviews - Day ${dayNum}`
    ],
    scripts: {
      opening: `"Hey everyone, welcome back to Day ${dayNum}! Today we are tackling ${title}."`,
      explanation: `"Let's look at how ${title} works inside the virtual execution environments..."`,
      transition: `"Now let's trace variables inside the interactive stack/heap visualizer!"`,
      closing: `"That wraps up Day ${dayNum}. Review the assignments."`,
      cta: `"If this lesson helped, hit that Subscribe button!"`
    },
    downloadMarkdown: `# Day ${dayNum}: ${title} - Study Notes\n## 1. Learning Objectives\n* Comprehend the main architecture of ${title}.`,
    contentSlides: [
      {
        title: "1. Learning Objectives",
        html: `\n      <div class="visual-badge"><i class="fa-solid fa-graduation-cap"></i> Lesson ${dayNum}</div>\n      <h2>${title}</h2>\n      <p class="large-text">Objectives: Learn variables, declarations and compiler controls.</p>\n    `
      },
      {
        title: "2. Why It Exists & Analogy",
        html: `\n      <h3>Why does ${title} exist?</h3>\n      <p class="large-text">Every topic solves a specific programming problem...</p>\n    `
      }
    ],
    quizQuestions: [
      {
        q: `What is the core target of learning ${title}?`,
        options: ["Option A", "Option B", "Option C", "All of the above"],
        answer: 3,
        explanation: "Detail explanation goes here."
      }
    ],
    interviewCards: [
      {
        q: `Explain the main concept of ${title}.`,
        a: "Your compiled answer notes go here."
      }
    ],
    assignmentContent: `\n    <h3>Day ${dayNum} Challenges</h3>\n    <div class="mistake-comparison">\n      <div class="mistake-card good">\n        <h5>Exercise</h5>\n        <p>Write a class executing ${title}.</p>\n      </div>\n    </div>\n  `
  };

  return JSON.stringify(templateObj, null, 2);
}

function generateAndDownloadLesson() {
  const jsonStr = generateLessonJsonString();
  const dayNum = parseInt(document.getElementById('gen-day-num').value) || 2;
  
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `day_${dayNum}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function copyLessonTemplateToClipboard() {
  const jsonStr = generateLessonJsonString();
  navigator.clipboard.writeText(jsonStr)
    .then(() => {
      alert("Lesson JSON Template copied to clipboard!");
    })
    .catch(err => {
      console.error("Copy Error: ", err);
    });
}

function loadValidatorFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('validator-textarea').value = e.target.result;
  };
  reader.readAsText(file);
}

function validateLessonJSON() {
  const text = document.getElementById('validator-textarea').value.trim();
  const reportPanel = document.getElementById('validation-report-panel');
  
  if (!text) {
    reportPanel.innerHTML = '<div class="val-fail"><i class="fa-solid fa-circle-xmark"></i> Empty JSON string. Paste content first.</div>';
    return;
  }
  
  try {
    const data = JSON.parse(text);
    let checks = [];
    let isAllValid = true;
    
    // Required fields schema checks
    const requiredKeys = [
      { key: 'id', name: 'Lesson ID' },
      { key: 'dayNum', name: 'Day Number' },
      { key: 'title', name: 'Lesson Title' },
      { key: 'category', name: 'Category Tag' },
      { key: 'difficulty', name: 'Difficulty Level' },
      { key: 'codeType', name: 'Debugger Code Type' },
      { key: 'downloadMarkdown', name: 'Markdown Study Notes' },
      { key: 'contentSlides', name: 'Slides Array' },
      { key: 'quizQuestions', name: 'Quiz MCQ Array' },
      { key: 'interviewCards', name: 'Interview Flashcards' },
      { key: 'assignmentContent', name: 'Assignments HTML' },
      { key: 'youtubeTitle', name: 'YouTube Title' },
      { key: 'youtubeDesc', name: 'YouTube Description' },
      { key: 'thumbnails', name: 'Thumbnails Ideas' },
      { key: 'scripts', name: 'YouTube Prompter Scripts' }
    ];
    
    requiredKeys.forEach(req => {
      if (data[req.key] !== undefined) {
        // Sub element validations
        if (req.key === 'scripts') {
          const scriptsKeys = ['opening', 'explanation', 'transition', 'closing', 'cta'];
          let scriptMissing = [];
          scriptsKeys.forEach(s => {
            if (!data.scripts[s]) {
              scriptMissing.push(s);
            }
          });
          
          if (scriptMissing.length > 0) {
            checks.push(`<div class="validation-report-item val-warning"><i class="fa-solid fa-triangle-exclamation"></i> scripts: Missing subkeys (${scriptMissing.join(', ')})</div>`);
          } else {
            checks.push(`<div class="validation-report-item val-success"><i class="fa-solid fa-circle-check"></i> scripts: Fully defined</div>`);
          }
        } else {
          checks.push(`<div class="validation-report-item val-success"><i class="fa-solid fa-circle-check"></i> ${req.name}: OK</div>`);
        }
      } else {
        checks.push(`<div class="validation-report-item val-fail"><i class="fa-solid fa-circle-xmark"></i> ${req.name}: Missing key!</div>`);
        isAllValid = false;
      }
    });
    
    if (isAllValid) {
      checks.unshift('<div class="val-success" style="font-weight:700; margin-bottom:0.5rem;"><i class="fa-solid fa-circle-check"></i> 🎥 Recording Ready: Validated!</div>');
    } else {
      checks.unshift('<div class="val-fail" style="font-weight:700; margin-bottom:0.5rem;"><i class="fa-solid fa-circle-xmark"></i> Validation Failed: Fix missing keys.</div>');
    }
    
    reportPanel.innerHTML = checks.join('');
    
  } catch (err) {
    reportPanel.innerHTML = `<div class="val-fail"><i class="fa-solid fa-circle-xmark"></i> Invalid JSON Syntax: <br><span style="font-size:0.8rem; color:var(--text-secondary);">${err.message}</span></div>`;
  }
}

/* ==========================================================================
   PROGRESS STORAGE SYNC FUNCTIONS
   ========================================================================== */
function loadProgress() {
  try {
    const saved = localStorage.getItem('java_academy_completed_days');
    if (saved) {
      completedDays = JSON.parse(saved);
    }
  } catch (err) {
    console.error("Error loading progress: ", err);
  }
}

function saveProgress() {
  localStorage.setItem('java_academy_completed_days', JSON.stringify(completedDays));
  updateProgressUI();
}

function toggleCurrentDayCompletion() {
  const compositeKey = `${activeCourse}_${currentDayId}`;
  if (completedDays[compositeKey]) {
    delete completedDays[compositeKey];
    DOM.markCompleteBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Mark Complete';
    DOM.markCompleteBtn.style.border = 'none';
    DOM.markCompleteBtn.style.background = 'linear-gradient(135deg, var(--neon-cyan), #3b82f6)';
    DOM.markCompleteBtn.style.color = '#000';
  } else {
    completedDays[compositeKey] = true;
    DOM.markCompleteBtn.innerHTML = '<i class="fa-solid fa-circle-check" style="color: var(--neon-emerald);"></i> Completed';
    DOM.markCompleteBtn.style.border = '1px solid var(--neon-emerald)';
    DOM.markCompleteBtn.style.background = 'rgba(0, 255, 102, 0.08)';
    DOM.markCompleteBtn.style.color = 'var(--neon-emerald)';
  }
  saveProgress();
}

function updateProgressUI() {
  if (!lmsConfig) return;
  const course = lmsConfig.courses[activeCourse];
  
  // Count only current course progress
  let completedCount = 0;
  Object.keys(course.days).forEach(dayId => {
    if (completedDays[`${activeCourse}_${dayId}`]) {
      completedCount++;
    }
  });
  
  const total = course.totalDays || 140;
  const pct = Math.round((completedCount / total) * 100);
  
  if (DOM.dashboardProgressTxt) DOM.dashboardProgressTxt.textContent = `${pct}% Complete`;
  if (DOM.dashboardProgressBar) DOM.dashboardProgressBar.style.width = `${pct}%`;
  if (DOM.dashboardProgressNumeric) DOM.dashboardProgressNumeric.textContent = `${completedCount} / ${total} Days Completed`;
  
  // Sidebar status highlight
  const compositeKey = `${activeCourse}_${currentDayId}`;
  if (completedDays[compositeKey]) {
    DOM.markCompleteBtn.innerHTML = '<i class="fa-solid fa-circle-check" style="color: var(--neon-emerald);"></i> Completed';
    DOM.markCompleteBtn.style.border = '1px solid var(--neon-emerald)';
    DOM.markCompleteBtn.style.background = 'rgba(0, 255, 102, 0.08)';
    DOM.markCompleteBtn.style.color = 'var(--neon-emerald)';
  } else {
    DOM.markCompleteBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Mark Complete';
    DOM.markCompleteBtn.style.border = 'none';
    DOM.markCompleteBtn.style.background = 'linear-gradient(135deg, var(--neon-cyan), #3b82f6)';
    DOM.markCompleteBtn.style.color = '#000';
  }
}

function resetProgress() {
  if (confirm("Are you sure you want to reset all progress? This action cannot be undone.")) {
    completedDays = {};
    saveProgress();
    renderRoadmapDashboard();
    updateProgressUI();
  }
}

function exportProgress() {
  const dataStr = JSON.stringify(completedDays, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'java_academy_progress.json');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function triggerImport() {
  document.getElementById('import-file-input').click();
}

function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      completedDays = parsed;
      saveProgress();
      renderRoadmapDashboard();
      updateProgressUI();
      alert("Progress imported successfully!");
    } catch (err) {
      alert("Invalid JSON file format.");
    }
  };
  reader.readAsText(file);
}

/* ==========================================================================
   DRY RUN AND SVG DIAGRAM CONTROLS (WORKSPACE WIDGETS)
   ========================================================================== */
function attachWorkspaceListeners(day) {
  // Bind diagrams if day 1
  if (day.dayNum === 1) {
    const compilationNodes = document.querySelectorAll('.diag-node');
    compilationNodes.forEach(node => {
      node.addEventListener('click', () => {
        const target = node.getAttribute('data-target');
        highlightCompilationStep(target);
      });
    });
    
    const archBoxes = document.querySelectorAll('.arch-box, .arch-sub-box');
    archBoxes.forEach(box => {
      box.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = box.getAttribute('data-target');
        highlightArchitectureZone(target);
      });
    });
  }

  // Load lesson quiz MCQ
  quizScore = 0;
  activeQuizQuestionIndex = 0;
  loadLessonQuizQuestion();

  // Binds debugger state
  currentDryRunStep = 0;
  const debugScript = debuggerScripts[day.codeType] || debuggerScripts.basic;
  updateDryRunDebuggerUI();

  // Flashcards binds
  document.querySelectorAll('.flashcard').forEach(card => {
    card.addEventListener('click', () => card.classList.toggle('flipped'));
  });

  // Highlight blocks
  Prism.highlightAll();
}

function highlightCompilationStep(step) {
  const panel = document.getElementById('diagram-detail-panel');
  const title = document.getElementById('detail-title');
  const desc = document.getElementById('detail-desc');
  
  const stepData = {
    'step-source': {
      title: '<i class="fa-solid fa-file-code icon-cyan"></i> Source Code (.java)',
      desc: 'The human-readable source code wrote by developers. Follows strict object structure. Filename must exactly match class identifier, compiled using <code>javac</code>.',
      color: '#06b6d4'
    },
    'step-compiler': {
      title: '<i class="fa-solid fa-gears icon-cyan"></i> Compiler (javac)',
      desc: 'The compiler translates standard text files to bytecode representations, running check steps for variable bounds and invalid type operations before export.',
      color: '#06b6d4'
    },
    'step-bytecode': {
      title: '<i class="fa-solid fa-microchip icon-purple"></i> Bytecode (.class)',
      desc: 'An intermediate binary language compiled for virtual interpreters. It is universal and platform-independent, enabling compiled files to fly and execute everywhere.',
      color: '#a855f7'
    },
    'step-jvm': {
      title: '<i class="fa-solid fa-server icon-emerald"></i> JVM (Java Virtual Machine)',
      desc: 'The platform-specific engine. Translates bytecode to hardware CPU instructions on-the-fly. Leverages the JIT Compiler for performance upgrades.',
      color: '#10b981'
    }
  };

  const data = stepData[step];
  if (data) {
    title.innerHTML = data.title;
    desc.innerHTML = data.desc;
    panel.style.borderLeftColor = data.color;
    gsap.fromTo(panel, { x: 10, opacity: 0.8 }, { x: 0, opacity: 1, duration: 0.3 });
  }
}

function highlightArchitectureZone(zone) {
  const panel = document.getElementById('arch-detail-panel');
  const title = document.getElementById('arch-title');
  const desc = document.getElementById('arch-desc');
  
  const dataMap = {
    'arch-jdk': {
      title: '<i class="fa-solid fa-toolbox icon-purple"></i> JDK (Java Development Kit)',
      desc: 'A complete developer software kit containing JRE layers alongside compilers (<code>javac</code>), debuggers (<code>jdb</code>), documentation exporters, and packaging utilities.',
      color: '#a855f7'
    },
    'arch-jre': {
      title: '<i class="fa-solid fa-circle-play icon-cyan"></i> JRE (Java Runtime Environment)',
      desc: 'Required runtime setup for users to run compiled apps. Bundles core libraries (collections, utilities) with the JVM interpreter layer.',
      color: '#06b6d4'
    },
    'arch-jvm': {
      title: '<i class="fa-solid fa-server icon-emerald"></i> JVM (Java Virtual Machine)',
      desc: 'The code execution engine. Loads bytecode, validates safety scopes, manages variable stacks, heap allocations, and schedules active Garbage Collection sweeps.',
      color: '#10b981'
    },
    'arch-tools': {
      title: '<i class="fa-solid fa-hammer icon-orange"></i> Development Tools',
      desc: 'Developer utilities such as compiler executables, tracers, memory profilers, and archivers packaged exclusively inside the JDK.',
      color: '#ff7a00'
    }
  };

  const data = dataMap[zone];
  if (data) {
    title.innerHTML = data.title;
    desc.innerHTML = data.desc;
    panel.style.borderLeftColor = data.color;
    gsap.fromTo(panel, { x: 10, opacity: 0.8 }, { x: 0, opacity: 1, duration: 0.3 });
  }
}

/* ==========================================================================
   DRY RUN INTERACTION SYNC ENGINE
   ========================================================================== */
function compileDebuggerHtml(script) {
  const codeLines = script.code.trim().split('\n');
  let codeHtml = '';
  codeLines.forEach((line, index) => {
    const num = index + 1;
    const indentMatch = line.match(/^\s*/);
    const indent = indentMatch ? indentMatch[0].length : 0;
    codeHtml += `
      <span class="code-line" id="line-${num}" style="padding-left: ${indent * 12 + 10}px">
        <span style="color: var(--text-muted); width: 25px; display: inline-block;">${num}</span>${escapeHtml(line.trim())}
      </span>
    `;
  });

  return `
    <div class="dry-run-grid">
      <div class="debugger-pane">
        <div class="debugger-header">
          <div class="window-dots">
            <span class="dot dot-red"></span>
            <span class="dot dot-yellow"></span>
            <span class="dot dot-green"></span>
          </div>
          <span class="file-name">DebuggerTerminal.java</span>
        </div>
        <div class="code-scroller">
          ${codeHtml}
        </div>
        <div class="debugger-controls">
          <div class="step-desc" id="dry-run-step-desc">Initialize stepper debugger...</div>
          <div class="debugger-buttons">
            <button class="control-btn" onclick="prevDryRunStep()"><i class="fa-solid fa-chevron-left"></i> Back</button>
            <button class="control-btn" onclick="nextDryRunStep()">Next <i class="fa-solid fa-chevron-right"></i></button>
          </div>
        </div>
      </div>
      
      <div class="memory-visualizer-container">
        <div class="memory-header"><i class="fa-solid fa-memory"></i> JVM Memory visualizer</div>
        <div class="memory-grid">
          <div class="memory-column">
            <h5>Variables Stack Frame</h5>
            <div class="stack-memory-slots" id="stack-memory-slots"></div>
          </div>
          <div class="memory-column">
            <h5>Object Heap Memory</h5>
            <div class="heap-memory-blocks" id="heap-memory-blocks"></div>
          </div>
        </div>
        
        <div class="terminal-box" style="margin-top: 1.5rem; min-height: 80px;">
          <div class="terminal-header">Terminal Console Output</div>
          <div class="terminal-output" id="terminal-output-pane"></div>
        </div>
      </div>
    </div>

    <div class="complexity-box">
      <div class="complexity-card">
        <h5>Time Complexity</h5>
        <div class="complexity-val">${script.complexity.time}</div>
      </div>
      <div class="complexity-card">
        <h5>Space Complexity</h5>
        <div class="complexity-val">${script.complexity.space}</div>
      </div>
      <div class="complexity-tip">
        <strong>💡 Optimization Note:</strong> ${script.complexity.tip}
      </div>
    </div>
  `;
}

function updateDryRunDebuggerUI() {
  const course = lmsConfig.courses[activeCourse];
  const meta = course.days[currentDayId];
  const script = debuggerScripts[meta.codeType] || debuggerScripts.basic;
  const step = script.steps[currentDryRunStep];
  if (!step) return;

  const oldHigh = document.querySelector('.code-line.highlighted-line');
  if (oldHigh) oldHigh.classList.remove('highlighted-line');
  
  const lineEl = document.getElementById(`line-${step.line}`);
  if (lineEl) {
    lineEl.classList.add('highlighted-line');
    lineEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  
  const descEl = document.getElementById('dry-run-step-desc');
  if (descEl) descEl.innerHTML = step.desc;

  const stackContainer = document.getElementById('stack-memory-slots');
  const heapContainer = document.getElementById('heap-memory-blocks');
  
  if (stackContainer && heapContainer) {
    stackContainer.innerHTML = '';
    heapContainer.innerHTML = '';
    
    Object.keys(step.vars).forEach(vname => {
      const val = step.vars[vname];
      const isRef = typeof val === 'string' && val.startsWith('Reference');
      
      if (isRef) {
        const addressMatch = val.match(/\((.*?)\)/);
        const address = addressMatch ? addressMatch[1] : '0xFA3';
        
        stackContainer.innerHTML += `
          <div class="stack-frame-slot" style="border-color: rgba(189, 0, 255, 0.4)">
            <span>${vname}</span>
            <span style="color: var(--neon-purple);">${address}</span>
          </div>
        `;
        
        let properties = '';
        Object.keys(step.vars).forEach(prop => {
          if (prop.startsWith(`${vname}.`)) {
            const propName = prop.split('.')[1];
            properties += `<div>${propName}: <span style="color: var(--neon-cyan)">${step.vars[prop]}</span></div>`;
          }
        });
        
        heapContainer.innerHTML += `
          <div class="heap-object-block">
            <span class="heap-object-address">${address}</span>
            <div class="heap-object-details">
              <strong>${vname}</strong> (Object)
              <div style="margin-top: 0.35rem; font-size: 0.85rem; border-top: 1px dashed var(--border-glow); padding-top: 0.25rem;">
                ${properties || 'Allocated'}
              </div>
            </div>
          </div>
        `;
      } else {
        if (!vname.includes('.')) {
          stackContainer.innerHTML += `
            <div class="stack-frame-slot">
              <span>${vname}</span>
              <span style="color: var(--neon-cyan);">${val}</span>
            </div>
          `;
        }
      }
    });
  }

  const consoleEl = document.getElementById('terminal-output-pane');
  if (consoleEl) {
    consoleEl.innerHTML = step.output ? `&gt; ${step.output}` : '<span style="color: var(--text-muted); font-style: italic;">Ready</span>';
  }
}

function nextDryRunStep() {
  const course = lmsConfig.courses[activeCourse];
  const meta = course.days[currentDayId];
  const script = debuggerScripts[meta.codeType] || debuggerScripts.basic;
  
  if (currentDryRunStep < script.steps.length - 1) {
    currentDryRunStep++;
    updateDryRunDebuggerUI();
  }
}

function prevDryRunStep() {
  if (currentDryRunStep > 0) {
    currentDryRunStep--;
    updateDryRunDebuggerUI();
  }
}

function compileInterviewCardsHtml(cards) {
  let html = '';
  cards.forEach(card => {
    html += `
      <div class="flashcard">
        <div class="flashcard-inner">
          <div class="flashcard-front">
            <h4>Q: ${card.q}</h4>
            <div class="click-hint"><i class="fa-solid fa-arrow-pointer"></i> Click to Reveal</div>
          </div>
          <div class="flashcard-back">
            <p>${card.a}</p>
            <div class="click-hint" style="color: var(--neon-cyan);"><i class="fa-solid fa-rotate-left"></i> Click to Flip</div>
          </div>
        </div>
      </div>
    `;
  });
  return html;
}

/* ==========================================================================
   INTERACTIVE MCQ LOADER
   ========================================================================== */
function loadLessonQuizQuestion() {
  const container = document.getElementById('lesson-quiz-card');
  if (!container) return;

  // Since active day is loaded dynamically via fetch, we query the file cache or load directly
  // We can write a dynamic fetch check
  const filePath = `content/${activeCourse}/${currentDayId}.json`;
  fetch(filePath)
    .then(res => res.json())
    .then(day => {
      const q = day.quizQuestions[activeQuizQuestionIndex];
      if (!q) return;

      let optionsHtml = '';
      q.options.forEach((opt, idx) => {
        optionsHtml += `
          <button class="quiz-option" onclick="selectLessonQuizOption(${idx}, ${q.answer}, ${day.quizQuestions.length})">${opt}</button>
        `;
      });

      container.innerHTML = `
        <div class="quiz-question">
          <strong>Q${activeQuizQuestionIndex + 1}:</strong> ${q.q}
        </div>
        <div class="quiz-options">
          ${optionsHtml}
        </div>
        <div class="quiz-explanation" id="lesson-quiz-explain-box">
          <h5><i class="fa-solid fa-circle-info"></i> Explanation</h5>
          <p id="lesson-quiz-explain-text">${q.explanation}</p>
        </div>
        <div class="quiz-footer">
          <span class="quiz-score-tracker">Score: ${quizScore} / ${day.quizQuestions.length}</span>
          <button class="control-btn" id="lesson-quiz-next-btn" style="display: none;" onclick="advanceLessonQuiz('${day.id}', ${day.quizQuestions.length})">Next Question <i class="fa-solid fa-chevron-right"></i></button>
        </div>
      `;
    });
}

function selectLessonQuizOption(index, correct, total) {
  const options = document.querySelectorAll('#lesson-quiz-card .quiz-option');
  options.forEach(opt => opt.classList.add('disabled'));

  if (index === correct) {
    options[index].classList.add('correct');
    quizScore++;
  } else {
    options[index].classList.add('wrong');
    options[correct].classList.add('correct');
  }

  document.getElementById('lesson-quiz-explain-box').style.display = 'block';
  document.querySelector('#lesson-quiz-card .quiz-score-tracker').textContent = `Score: ${quizScore} / ${total}`;

  const nextBtn = document.getElementById('lesson-quiz-next-btn');
  if (nextBtn) {
    if (activeQuizQuestionIndex < total - 1) {
      nextBtn.style.display = 'inline-flex';
    } else {
      nextBtn.innerHTML = 'Complete Quiz <i class="fa-solid fa-flag-checkered"></i>';
      nextBtn.style.display = 'inline-flex';
    }
  }
}

function advanceLessonQuiz(dayId, total) {
  if (activeQuizQuestionIndex < total - 1) {
    activeQuizQuestionIndex++;
    loadLessonQuizQuestion();
  } else {
    const card = document.getElementById('lesson-quiz-card');
    card.innerHTML = `
      <div style="text-align: center; padding: 2rem 0;">
        <i class="fa-solid fa-award icon-cyan" style="font-size: 4.5rem; margin-bottom: 1.5rem;"></i>
        <h2>Quiz Completed!</h2>
        <p class="large-text">Score: <strong>${quizScore}</strong> / <strong>${total}</strong>.</p>
        <button class="primary-btn" style="margin-top: 1.5rem;" onclick="resetLessonQuiz()">Try Again</button>
      </div>
    `;
  }
}

function resetLessonQuiz() {
  quizScore = 0;
  activeQuizQuestionIndex = 0;
  loadLessonQuizQuestion();
}

/* ==========================================================================
   INTERVIEW DECK MODULE
   ========================================================================== */
function setupInterviewDeck() {
  // Configured statically in index.html to render tabs
}

function switchInterviewTab(btn, tab) {
  document.querySelectorAll('.interview-tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderInterviewDeck(tab);
}

function renderInterviewDeck(tab) {
  const container = document.getElementById('interview-deck-body');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (tab === 'mcqs') {
    let mcqHtml = '';
    interviewDeckDatabase.mcqs.forEach((q, idx) => {
      let options = q.options.map((opt, oIdx) => `
        <button class="quiz-option" onclick="verifyInterviewMCQ(this, ${oIdx}, ${q.answer}, ${idx})">${opt}</button>
      `).join('');
      
      mcqHtml += `
        <div class="quiz-card" style="margin-bottom: 2rem;" id="int-mcq-${idx}">
          <div class="quiz-question"><strong>Q${idx + 1}:</strong> ${q.q}</div>
          <div class="quiz-options">${options}</div>
          <div class="quiz-explanation" id="int-explain-${idx}">
            <h5><i class="fa-solid fa-circle-info"></i> Explanation</h5>
            <p>${q.explanation}</p>
          </div>
        </div>
      `;
    });
    container.innerHTML = `<div class="quiz-wrapper" style="max-width: 100%;">${mcqHtml}</div>`;
  } 
  
  else if (tab === 'outputs') {
    let cardsHtml = '';
    interviewDeckDatabase.outputs.forEach((item, idx) => {
      cardsHtml += `
        <div class="interview-qa-item">
          <div class="interview-question-title">Output Trace Q${idx + 1}</div>
          <pre style="background: rgba(0,0,0,0.4); padding: 1.5rem; border-radius: 8px; font-family: var(--font-mono); font-size:1.15rem; margin-bottom: 1.5rem;">${item.q}</pre>
          <button class="reveal-answer-btn" onclick="revealInterviewAnswer(this)">Show Output Value</button>
          <div class="revealable-answer-pane">
            <h5 style="color: var(--neon-emerald); margin-bottom: 0.5rem;">Expected Console Output:</h5>
            <pre style="font-family: var(--font-mono); font-size: 1.2rem; color: #fff; margin-bottom: 1rem;">${item.answer}</pre>
            <p>${item.explanation}</p>
          </div>
        </div>
      `;
    });
    container.innerHTML = `<div class="interview-qa-stack">${cardsHtml}</div>`;
  }
  
  else {
    const data = interviewDeckDatabase[tab];
    let cardsHtml = '';
    
    data.forEach((item, idx) => {
      cardsHtml += `
        <div class="interview-qa-item">
          <div class="interview-question-title">Q${idx + 1}: ${item.q}</div>
          <button class="reveal-answer-btn" onclick="revealInterviewAnswer(this)">Reveal Answer Notes</button>
          <div class="revealable-answer-pane">
            <h5 style="color: var(--neon-cyan); margin-bottom: 0.5rem;">Recommended Answer:</h5>
            <p style="white-space: pre-line; line-height:1.7;">${item.answer}</p>
          </div>
        </div>
      `;
    });
    container.innerHTML = `<div class="interview-qa-stack">${cardsHtml}</div>`;
  }
}

function verifyInterviewMCQ(btn, index, correct, qIdx) {
  const parent = btn.closest('.quiz-options');
  const options = parent.querySelectorAll('.quiz-option');
  options.forEach(opt => opt.classList.add('disabled'));
  
  if (index === correct) {
    btn.classList.add('correct');
  } else {
    btn.classList.add('wrong');
    options[correct].classList.add('correct');
  }
  
  document.getElementById(`int-explain-${qIdx}`).style.display = 'block';
}

function revealInterviewAnswer(btn) {
  const panel = btn.nextElementSibling;
  if (panel.style.display === 'block') {
    panel.style.display = 'none';
    btn.textContent = btn.textContent.replace('Hide', 'Reveal').replace('Show', 'Reveal');
  } else {
    panel.style.display = 'block';
    btn.textContent = btn.textContent.replace('Reveal', 'Hide').replace('Show', 'Hide');
  }
}

/* ==========================================================================
   NAVIGATION ENGINE
   ========================================================================== */
function goToSection(index) {
  const slides = document.querySelectorAll('.content-section');
  if (index < 0 || index >= slides.length) return;
  
  document.querySelector('.content-section.active').classList.remove('active');
  document.querySelector('.sidebar-nav-item.active').classList.remove('active');
  
  currentSectionIndex = index;
  slides[index].classList.add('active');
  DOM.sidebarNav.children[index].classList.add('active');
  
  if (!DOM.body.classList.contains('presenter-mode')) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  updateProgress();
  resetCurrentSlideAnimations();
}

function nextSection() {
  const slides = document.querySelectorAll('.content-section');
  if (currentSectionIndex < slides.length - 1) {
    goToSection(currentSectionIndex + 1);
  }
}

function prevSection() {
  if (currentSectionIndex > 0) {
    goToSection(currentSectionIndex - 1);
  }
}

function updateProgress() {
  const slides = document.querySelectorAll('.content-section');
  const total = slides.length;
  if (DOM.slideNumIndicator) DOM.slideNumIndicator.textContent = `${currentSectionIndex + 1} / ${total}`;
}

/* ==========================================================================
   GLOBAL UTILITIES AND SHORTCUT OVERRIDES
   ========================================================================== */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
      return;
    }
    
    // N key = Show / Hide notes prompter
    if (e.code === 'KeyN') {
      e.preventDefault();
      if (DOM.speakerNotesPanel.style.display === 'block') {
        DOM.speakerNotesPanel.style.display = 'none';
      } else {
        DOM.speakerNotesPanel.style.display = 'block';
      }
    }
    
    // M key = Minimize / Maximize speaker notes
    if (e.code === 'KeyM') {
      e.preventDefault();
      toggleSpeakerNotes();
    }

    // Space or ArrowRight = Next slide
    if (e.code === 'ArrowRight' || e.code === 'Space') {
      e.preventDefault();
      nextSection();
    }

    // ArrowLeft = Previous slide
    if (e.code === 'ArrowLeft') {
      e.preventDefault();
      prevSection();
    }

    // P key = Presenter mode
    if (e.code === 'KeyP') {
      e.preventDefault();
      togglePresenterMode();
    }

    // F key = Full Screen
    if (e.code === 'KeyF') {
      e.preventDefault();
      toggleFullScreen();
    }

    // R key = Trigger Recording Checklist Modal
    if (e.code === 'KeyR') {
      e.preventDefault();
      triggerRecordingChecklist();
    }

    // L key = Toggle Laser Pointer Mode
    if (e.code === 'KeyL') {
      e.preventDefault();
      toggleLaserPointer();
    }

    // H key = Toggle Focus Highlight Mode
    if (e.code === 'KeyH') {
      e.preventDefault();
      toggleFocusHighlight();
    }
  });
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const main = DOM.mainContent;
  sidebar.classList.toggle('hidden');
  main.classList.toggle('wide');
}

function downloadLessonNotes() {
  // Fetches current Markdown notes
  const filePath = `content/${activeCourse}/${currentDayId}.json`;
  fetch(filePath)
    .then(res => res.json())
    .then(day => {
      const blob = new Blob([day.downloadMarkdown], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Day_${day.dayNum}_study_notes.md`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    })
    .catch(() => alert("No custom notes file found for this day."));
}

function togglePresenterMode() {
  const isActive = DOM.body.classList.toggle('presenter-mode');
  const sidebar = document.querySelector('.sidebar');
  const mainNode = DOM.mainContent;
  
  if (isActive) {
    sidebar.classList.add('hidden');
    mainNode.classList.add('wide');
    DOM.presenterControls.classList.remove('autohide');
    DOM.speakerNotesPanel.style.display = 'block';
  } else {
    sidebar.classList.remove('hidden');
    mainNode.classList.remove('wide');
    DOM.presenterControls.classList.add('autohide');
    DOM.speakerNotesPanel.style.display = 'none';
  }
  
  resetCurrentSlideAnimations();
}

function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
      .then(() => {
        if (DOM.fullscreenIcon) DOM.fullscreenIcon.className = 'fa-solid fa-compress';
      })
      .catch(err => {
        console.error(`Error attempting to enable full-screen: ${err.message}`);
      });
  } else {
    document.exitFullscreen()
      .then(() => {
        if (DOM.fullscreenIcon) DOM.fullscreenIcon.className = 'fa-solid fa-expand';
      });
  }
}

function toggleReduceAnimations() {
  isReducedAnimation = !isReducedAnimation;
  DOM.body.classList.toggle('reduce-animations', isReducedAnimation);
  
  const toggleBtn = document.getElementById('reduce-animation-btn');
  if (toggleBtn) {
    toggleBtn.innerHTML = isReducedAnimation 
      ? '<i class="fa-solid fa-bolt"></i> Enable Animations' 
      : '<i class="fa-solid fa-bolt-slash"></i> Reduce Animations';
  }
}

function resetCurrentSlideAnimations() {
  if (isReducedAnimation) return;
  
  const currentSection = document.getElementById(`slide-${currentSectionIndex}`);
  if (!currentSection) return;
  
  const animTargets = currentSection.querySelectorAll('h2, h3, p, .feature-card, .analogy-box, .interactive-diagram-container, .nested-diagram-container, .dry-run-grid, .mistake-card, .flashcard, .quiz-card, .youtube-assets-grid');
  
  gsap.killTweensOf(animTargets);
  gsap.fromTo(animTargets, 
    { opacity: 0, y: 20 }, 
    { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: 0.06 }
  );
  
  if (currentSection.querySelector('#compilation-flow-svg')) {
    const nodes = currentSection.querySelectorAll('.diag-node');
    gsap.fromTo(nodes, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, stagger: 0.08, ease: "back.out(1.5)" });
  }
}

function startRecordingMode() {
  switchView('lesson');
  
  if (!DOM.body.classList.contains('presenter-mode')) {
    DOM.body.classList.add('presenter-mode');
    const sidebar = document.querySelector('.sidebar');
    const mainNode = DOM.mainContent;
    sidebar.classList.add('hidden');
    mainNode.classList.add('wide');
    DOM.presenterControls.classList.remove('autohide');
  }
  
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
      .then(() => {
        if (DOM.fullscreenIcon) DOM.fullscreenIcon.className = 'fa-solid fa-compress';
      })
      .catch(err => console.error(err));
  }
  
  DOM.speakerNotesPanel.style.display = 'block';
  resetCurrentSlideAnimations();
}

function backupLessonsData() {
  // Pulls configuration backups
  const dataStr = JSON.stringify(lmsConfig, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'academy_curriculum_backup.json');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ==========================================================================
   SPEAKER NOTES UI CONTROLLERS
   ========================================================================== */
function toggleSpeakerNotes() {
  notesProps.collapsed = !notesProps.collapsed;
  DOM.speakerNotesPanel.classList.toggle('collapsed', notesProps.collapsed);
  saveNotesSettings();
}

function adjustNotesOpacity(val) {
  notesProps.opacity = val;
  DOM.speakerNotesPanel.style.opacity = val / 100;
  saveNotesSettings();
}

function adjustNotesFontSize(dir) {
  notesProps.fontSize += dir * 0.05;
  DOM.speakerNotesPanel.style.fontSize = `${notesProps.fontSize}rem`;
  saveNotesSettings();
}

function toggleNotesLock() {
  notesProps.locked = !notesProps.locked;
  DOM.btnNotesLock.innerHTML = notesProps.locked ? '<i class="fa-solid fa-lock"></i>' : '<i class="fa-solid fa-lock-open"></i>';
  DOM.speakerNotesPanel.classList.toggle('locked', notesProps.locked);
  saveNotesSettings();
}

function saveNotesSettings() {
  const rect = DOM.speakerNotesPanel.getBoundingClientRect();
  const settings = {
    x: rect.left,
    y: rect.top,
    props: notesProps
  };
  localStorage.setItem('speaker_notes_ui_settings', JSON.stringify(settings));
}

function restoreNotesSettings() {
  try {
    const saved = localStorage.getItem('speaker_notes_ui_settings');
    if (saved) {
      const settings = JSON.parse(saved);
      if (settings.x !== undefined && settings.y !== undefined) {
        DOM.speakerNotesPanel.style.left = `${settings.x}px`;
        DOM.speakerNotesPanel.style.top = `${settings.y}px`;
        DOM.speakerNotesPanel.style.bottom = 'auto';
        DOM.speakerNotesPanel.style.right = 'auto';
      }
      
      if (settings.props) {
        notesProps = settings.props;
        DOM.speakerNotesPanel.classList.toggle('collapsed', notesProps.collapsed);
        DOM.speakerNotesPanel.classList.toggle('locked', notesProps.locked);
        DOM.speakerNotesPanel.style.opacity = notesProps.opacity / 100;
        DOM.speakerNotesPanel.style.fontSize = `${notesProps.fontSize}rem`;
        DOM.notesOpacitySlider.value = notesProps.opacity;
        DOM.btnNotesLock.innerHTML = notesProps.locked ? '<i class="fa-solid fa-lock"></i>' : '<i class="fa-solid fa-lock-open"></i>';
      }
    }
  } catch (err) {
    console.error("Notes UI settings load error: ", err);
  }
}

function setupDraggableSpeakerNotes() {
  const panel = DOM.speakerNotesPanel;
  const header = panel.querySelector('.notes-header');
  
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  header.onmousedown = dragMouseDown;
  
  function dragMouseDown(e) {
    if (notesProps.locked) return;
    e = e || window.event;
    if (e.target.closest('.notes-toggle-btn')) return;
    
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }
  
  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    panel.style.top = (panel.offsetTop - pos2) + "px";
    panel.style.left = (panel.offsetLeft - pos1) + "px";
    panel.style.bottom = 'auto';
    panel.style.right = 'auto';
  }
  
  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
    saveNotesSettings();
  }
}

/* ==========================================================================
   HELPERS & UTILITIES
   ========================================================================== */
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function copyValue(id) {
  const element = document.getElementById(id);
  if (!element) return;
  element.select();
  document.execCommand('copy');
  const btn = element.nextElementSibling;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
  setTimeout(() => btn.innerHTML = originalHtml, 2000);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Global Static Databases for Interactive Stepper & Interview Deck
const debuggerScripts = {
  basic: {
    code: `public class Main {\n    public static void main(String[] args) {\n        int x = 5;\n        int y = 10;\n        int result = x + y;\n        System.out.println("Result: " + result);\n    }\n}`,
    steps: [
      { line: 3, vars: { x: 5, y: "undefined", result: "undefined" }, desc: "Allocate variable <code>x</code> on stack with value 5.", output: "" },
      { line: 4, vars: { x: 5, y: 10, result: "undefined" }, desc: "Allocate variable <code>y</code> on stack with value 10.", output: "" },
      { line: 5, vars: { x: 5, y: 10, result: 15 }, desc: "Calculate sum <code>x + y</code> and assign to <code>result</code>.", output: "" },
      { line: 6, vars: { x: 5, y: 10, result: 15 }, desc: "Print sum directly to output console.", output: "Result: 15" }
    ],
    complexity: { time: "O(1)", space: "O(1)", tip: "Constants and direct mathematical assignments execute in constant O(1) space and time complexity." }
  },
  loop: {
    code: `public class Loop {\n    public static void main(String[] args) {\n        int sum = 0;\n        for (int i = 1; i <= 3; i++) {\n            sum += i;\n        }\n        System.out.println("Sum: " + sum);\n    }\n}`,
    steps: [
      { line: 3, vars: { sum: 0, i: "undefined" }, desc: "Initialize <code>sum</code> to 0.", output: "" },
      { line: 4, vars: { sum: 0, i: 1 }, desc: "Initialize loop control <code>i = 1</code>. Condition <code>1 <= 3</code> is true.", output: "" },
      { line: 5, vars: { sum: 1, i: 1 }, desc: "Iteration 1: Add <code>i</code> (1) to <code>sum</code>.", output: "" },
      { line: 4, vars: { sum: 1, i: 2 }, desc: "Increment <code>i</code> to 2. Condition <code>2 <= 3</code> is true.", output: "" },
      { line: 5, vars: { sum: 3, i: 2 }, desc: "Iteration 2: Add <code>i</code> (2) to <code>sum</code> (1 + 2 = 3).", output: "" },
      { line: 4, vars: { sum: 3, i: 3 }, desc: "Increment <code>i</code> to 3. Condition <code>3 <= 3</code> is true.", output: "" },
      { line: 5, vars: { sum: 6, i: 3 }, desc: "Iteration 3: Add <code>i</code> (3) to <code>sum</code> (3 + 3 = 6).", output: "" },
      { line: 4, vars: { sum: 6, i: 4 }, desc: "Increment <code>i</code> to 4. Condition <code>4 <= 3</code> is false. Exit loop.", output: "" },
      { line: 7, vars: { sum: 6, i: 4 }, desc: "Print calculated sum to console.", output: "Sum: 6" }
    ],
    complexity: { time: "O(N)", space: "O(1)", tip: "Standard linear loops occupy constant space unless an auxiliary collection is dynamically populated inside the scope." }
  },
  oop: {
    code: `public class OOPDemo {\n    public static void main(String[] args) {\n        Car myCar = new Car("Model S");\n        myCar.speed = 80;\n        System.out.println(myCar.model + " moving");\n    }\n}`,
    steps: [
      { line: 3, vars: { myCar: "Reference (0xFA3)", "myCar.model": "Model S", "myCar.speed": 0 }, desc: "Instantiate <code>Car</code> object on **Heap** (address 0xFA3). Reference variable stored on **Stack**.", output: "" },
      { line: 4, vars: { myCar: "Reference (0xFA3)", "myCar.model": "Model S", "myCar.speed": 80 }, desc: "Update <code>speed</code> field of object inside **Heap** to 80.", output: "" },
      { line: 5, vars: { myCar: "Reference (0xFA3)", "myCar.model": "Model S", "myCar.speed": 80 }, desc: "Retrieve field values from Heap reference and output message.", output: "Model S moving" }
    ],
    complexity: { time: "O(1)", space: "O(1)", tip: "Creating a single object occupies space on the Heap. Storing references on stack takes 32/64 bits depending on JVM architecture." }
  },
  exception: {
    code: `public class ExceptionDemo {\n    public static void main(String[] args) {\n        try {\n            int num = 10 / 0;\n        } catch (ArithmeticException e) {\n            System.out.println("Caught DivByZero");\n        }\n    }\n}`,
    steps: [
      { line: 3, vars: { num: "undefined" }, desc: "Enter try block scope.", output: "" },
      { line: 4, vars: { num: "undefined" }, desc: "Division by zero attempted. JVM throws <code>ArithmeticException</code>. Skip remaining try lines.", output: "" },
      { line: 5, vars: { e: "Reference (0xEE9)" }, desc: "Catch block matches exception type. Retrieve exception details.", output: "" },
      { line: 6, vars: { e: "Reference (0xEE9)" }, desc: "Print safe error message. Program continues executing without crashing.", output: "Caught DivByZero" }
    ],
    complexity: { time: "O(1)", space: "O(1)", tip: "Exceptions add overhead because the JVM builds stack traces. Use them for exceptional flows, not normal control logic." }
  }
};

const interviewDeckDatabase = {
  mcqs: [
    {
      q: "Which of the following is NOT a valid access modifier in Java?",
      options: ["public", "protected", "internal", "private"],
      answer: 2,
      explanation: "'internal' is used in languages like Kotlin or C#; Java uses 'public', 'private', 'protected', and the default package-private scope."
    },
    {
      q: "What is the size of an 'int' primitive data type in Java?",
      options: ["16-bit", "32-bit", "64-bit", "Platform dependent"],
      answer: 1,
      explanation: "In Java, primitives have fixed sizes across all platforms. An 'int' is always 32-bit signed (2's complement)."
    },
    {
      q: "Which class loader executes first when booting a Java program?",
      options: ["Extension ClassLoader", "Application ClassLoader", "Bootstrap ClassLoader", "Platform ClassLoader"],
      answer: 2,
      explanation: "The Bootstrap ClassLoader loads the core JDK runtime libraries first."
    }
  ],
  outputs: [
    {
      q: "What is the output of this code snippet?\n<code>System.out.println(10 + 20 + \"Java\");</code>\n<code>System.out.println(\"Java\" + 10 + 20);</code>",
      answer: "30Java\nJava1020",
      explanation: "Java evaluates statements left-to-right. In the first line, <code>10 + 20</code> is addition (30), which is then concatenated with string 'Java'. In the second, 'Java' + 10 becomes string 'Java10', and adding 20 results in string 'Java1020'."
    },
    {
      q: "What is the output?\n<code>int x = 5;</code>\n<code>System.out.println(x++ + ++x);</code>",
      answer: "12",
      explanation: "Evaluating left-to-right: <code>x++</code> uses 5 and increments x to 6. Next, <code>++x</code> increments x to 7 and returns 7. Summing them yields <code>5 + 7 = 12</code>."
    }
  ],
  tricky: [
    {
      q: "Can you override a private or static method in Java?",
      answer: "No. Private methods are not inherited, so they cannot be overridden. Static methods are bound to classes rather than object instances. Re-declaring a static method in a subclass compiles but represents **method hiding**, not overriding."
    },
    {
      q: "Why does <code>double val = 0.1 + 0.2;</code> not exactly equal <code>0.3</code> in Java?",
      answer: "Java uses IEEE 754 floating-point standards. Primitives float/double represent decimals in binary base-2 fractionals, creating slight binary precision errors (0.30000000000000004)."
    }
  ],
  scenarios: [
    {
      q: "Scenario: Your backend app repeatedly runs out of heap memory (OutOfMemoryError: Java heap space) under load. How do you diagnose it?",
      answer: "1. Trigger heap dumps using <code>-XX:+HeapDumpOnOutOfMemoryError</code> flag.\n2. Analyze memory leaks in profiling tools like MAT or VisualVM.\n3. Verify if objects (like HTTP session records) are piling up without dereferencing, blocking Garbage Collection sweeps."
    },
    {
      q: "Scenario: A client complains that user records are dynamically vanishing during concurrent updates. You trace it to multiple threads editing a single HashMap.",
      answer: "HashMap is not thread-safe. Concurrent modifications can cause race conditions or infinite bucket loops. Fix it by switching to <code>ConcurrentHashMap</code> or wrap updating routines in synchronized blocks."
    }
  ],
  hr: [
    {
      q: "Why do you want to work with Java in our enterprise system rather than writing Node.js/Go code?",
      answer: "Java provides structural type safety, standard multithreading optimizations, massive garbage collection frameworks, and enterprise scaling architectures. Its ecosystem (Spring Boot, Hibernate) is highly mature and reliable."
    }
  ]
};

/* ==========================================================================
   CREATOR MODE (CMS) ENGINE & PRESENTATION OVERLAYS
   ========================================================================== */

function renderCMSDashboard() {
  if (!lmsConfig) return;
  
  DOM.creatorDashboardView.style.display = 'block';
  DOM.creatorEditorView.style.display = 'none';
  
  // Populate course dropdown
  const select = DOM.cmsCourseSelect;
  select.innerHTML = '';
  Object.keys(lmsConfig.courses).forEach(key => {
    const course = lmsConfig.courses[key];
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = course.title;
    opt.selected = (key === activeCourse);
    select.appendChild(opt);
  });

  const course = lmsConfig.courses[activeCourse];
  const daysKeys = Object.keys(course.days).sort((a, b) => {
    return (course.days[a].dayNum || 0) - (course.days[b].dayNum || 0);
  });

  // Calculate high-level stats
  let totalLessons = daysKeys.length;
  let readyCount = 0;
  let draftCount = 0;
  let publishedCount = 0;

  daysKeys.forEach(k => {
    const d = course.days[k];
    if (d.isRecordingReady) readyCount++;
    if (d.status === 'Published') publishedCount++;
    else if (d.status === 'Draft' || d.status === 'Empty' || !d.status) draftCount++;
  });

  DOM.cmsStatLessons.textContent = totalLessons;
  DOM.cmsStatReady.textContent = readyCount;
  DOM.cmsStatDrafts.textContent = draftCount;
  DOM.cmsStatPublished.textContent = publishedCount;

  // Build lessons table rows
  const tbody = DOM.cmsLessonsTbody;
  tbody.innerHTML = '';

  if (daysKeys.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding: 2rem;">No lessons created in this course yet. Click 'New Lesson' to start!</td></tr>`;
    return;
  }

  daysKeys.forEach(k => {
    const d = course.days[k];
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-glow)';

    // Status pill
    let statusClass = 'val-warning';
    let statusTxt = d.status || 'Draft';
    if (statusTxt === 'Published') statusClass = 'val-success';
    if (statusTxt === 'Archive') statusClass = 'val-fail';

    // Rec Ready tag
    const readyTag = d.isRecordingReady 
      ? `<span style="color:var(--neon-orange); font-weight:700;"><i class="fa-solid fa-video"></i> Ready</span>` 
      : `<span style="color:var(--text-muted);">--</span>`;

    // Action buttons
    let actionButtons = '';
    if (d.status === 'Archive') {
      actionButtons = `
        <button class="control-btn" style="padding: 0.35rem 0.75rem; border-color: var(--neon-emerald); color: var(--neon-emerald);" onclick="restoreCMSLesson('${k}')" title="Restore Lesson"><i class="fa-solid fa-rotate-left"></i> Restore</button>
        <button class="control-btn" style="padding: 0.35rem 0.75rem; border-color: #ef4444; color: #ef4444;" onclick="permanentDeleteCMSLesson('${k}')" title="Delete Permanently"><i class="fa-solid fa-trash-can"></i> Delete</button>
      `;
    } else {
      actionButtons = `
        <button class="control-btn" style="padding: 0.35rem 0.75rem; border-color: var(--neon-cyan); color: var(--neon-cyan);" onclick="openCMSEditor('${k}')" title="Edit Lesson"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
        <button class="control-btn" style="padding: 0.35rem 0.75rem; border-color: var(--neon-purple); color: var(--neon-purple);" onclick="duplicateCMSLesson('${k}')" title="Duplicate Lesson"><i class="fa-solid fa-copy"></i> Duplicate</button>
        <button class="control-btn" style="padding: 0.35rem 0.75rem; border-color: #eab308; color: #eab308;" onclick="archiveCMSLesson('${k}')" title="Archive Lesson"><i class="fa-solid fa-box-archive"></i> Archive</button>
      `;
    }

    tr.innerHTML = `
      <td style="padding: 1rem; font-weight: 700;">Day ${d.dayNum || '--'}</td>
      <td style="padding: 1rem; font-weight: 600; color:#fff;">${d.title || 'Untitled'}</td>
      <td style="padding: 1rem; color:var(--text-secondary);">${d.category || 'General'}</td>
      <td style="padding: 1rem;"><span class="difficulty-badge ${d.difficulty ? d.difficulty.toLowerCase() : 'beginner'}">${d.difficulty || 'Beginner'}</span></td>
      <td style="padding: 1rem;"><span class="${statusClass}" style="font-weight:700;">${statusTxt}</span></td>
      <td style="padding: 1rem;">${readyTag}</td>
      <td style="padding: 1rem; text-align: right; display:flex; gap: 0.5rem; justify-content: flex-end;">
        ${actionButtons}
        <button class="control-btn" style="padding: 0.35rem 0.75rem;" onclick="exportSingleLessonJson('${k}')" title="Export JSON"><i class="fa-solid fa-download"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function switchCMSCourse(courseName) {
  activeCourse = courseName;
  // Sync the dashboard dropdown selects
  if (DOM.courseSelect) DOM.courseSelect.value = courseName;
  if (DOM.cmsCourseSelect) DOM.cmsCourseSelect.value = courseName;
  renderCMSDashboard();
}

function openCMSEditor(dayId) {
  currentEditingDayId = dayId;
  editorHasChanges = false;
  DOM.cmsSaveStatus.textContent = '✓ Synchronized';
  DOM.cmsSaveStatus.className = 'saved-green';

  const filePath = `content/${activeCourse}/${dayId}.json`;
  
  DOM.creatorDashboardView.style.display = 'none';
  DOM.creatorEditorView.style.display = 'block';
  
  DOM.editorHeading.textContent = `Editing Lesson: ${dayId.toUpperCase()}`;

  fetch(filePath)
    .then(res => {
      if (!res.ok) throw new Error('File not found');
      return res.json();
    })
    .then(data => {
      populateCMSEditorFields(data);
    })
    .catch(err => {
      console.warn('Empty or missing file, loading template defaults for editor.');
      const dNum = parseInt(dayId.split('_')[1]) || 1;
      const defaultData = {
        id: dayId,
        dayNum: dNum,
        title: `Lesson Day ${dNum}`,
        category: 'Fundamentals',
        difficulty: 'Beginner',
        isInterview: false,
        isRecordingReady: false,
        notesMarkdown: '',
        contentSlides: [
          { slideIndex: 0, html: '<h3>Objectives</h3>\n<p>Add slide objectives here...</p>' },
          { slideIndex: 1, html: '<h3>Analogy</h3>\n<p>Add analogy content here...</p>' }
        ],
        codeType: 'basic',
        quizQuestions: [],
        interviewCards: [],
        youtubeMeta: {
          videoTitle: '',
          thumbnailIdeas: [],
          videoDescription: '',
          script: { opening: '', explanation: '', transition: '', closing: '', cta: '' }
        }
      };
      populateCMSEditorFields(defaultData);
    });

  // Setup Auto-save interval loop (every 10s checks if changed)
  if (autoSaveIntervalId) clearInterval(autoSaveIntervalId);
  autoSaveIntervalId = setInterval(() => {
    if (editorHasChanges) {
      saveCMSEditorData(true);
    }
  }, 10000);
}

function closeCMSEditor() {
  if (editorHasChanges) {
    if (!confirm('You have unsaved changes. Are you sure you want to close the editor?')) {
      return;
    }
  }
  if (autoSaveIntervalId) {
    clearInterval(autoSaveIntervalId);
    autoSaveIntervalId = null;
  }
  renderCMSDashboard();
}

function populateCMSEditorFields(day) {
  document.getElementById('edit-day-num').value = day.dayNum || 1;
  document.getElementById('edit-title').value = day.title || '';
  document.getElementById('edit-category').value = day.category || 'Fundamentals';
  document.getElementById('edit-difficulty').value = day.difficulty || 'Beginner';
  document.getElementById('edit-is-interview').checked = !!day.isInterview;
  document.getElementById('edit-is-ready').checked = !!day.isRecordingReady;
  
  document.getElementById('edit-notes-markdown').value = day.notesMarkdown || '';
  
  document.getElementById('edit-slide-0-html').value = day.contentSlides && day.contentSlides[0] ? day.contentSlides[0].html : '';
  document.getElementById('edit-slide-1-html').value = day.contentSlides && day.contentSlides[1] ? day.contentSlides[1].html : '';

  // Trigger preview compilations
  updateEditorLivePreview('edit-slide-0-html', 'preview-slide-0');
  updateEditorLivePreview('edit-slide-1-html', 'preview-slide-1');

  document.getElementById('edit-code-type').value = day.codeType || 'basic';
  switchEditorCodeType(day.codeType || 'basic');

  // Render Assessments lists
  renderEditorQuizQuestions(day.quizQuestions);
  renderEditorInterviewCards(day.interviewCards);

  // Render YouTube Meta
  const yt = day.youtubeMeta || {};
  document.getElementById('edit-yt-title').value = yt.videoTitle || '';
  document.getElementById('edit-yt-thumbnails').value = yt.thumbnailIdeas ? yt.thumbnailIdeas.join('\n') : '';
  document.getElementById('edit-yt-desc').value = yt.videoDescription || '';

  const sc = yt.script || {};
  document.getElementById('edit-script-opening').value = sc.opening || '';
  document.getElementById('edit-script-explanation').value = sc.explanation || '';
  document.getElementById('edit-script-transition').value = sc.transition || '';
  document.getElementById('edit-script-closing').value = sc.closing || '';
  document.getElementById('edit-script-cta').value = sc.cta || '';

  // Load versions history list
  populateVersionsSelect();
}

function switchCMSEditorTab(btn, tabId) {
  document.querySelectorAll('.cms-editor-pane').forEach(pane => {
    pane.classList.remove('active-pane');
  });
  document.querySelectorAll('.cms-tab-btn').forEach(t => {
    t.classList.remove('active');
  });

  document.getElementById(tabId).classList.add('active-pane');
  if (btn) btn.classList.add('active');
}

function insertFormatting(textareaId, format) {
  const textarea = document.getElementById(textareaId);
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const sel = text.substring(start, end);
  
  let formatted = '';
  switch (format) {
    case 'bold': formatted = `**${sel || 'bold text'}**`; break;
    case 'italic': formatted = `*${sel || 'italic text'}*`; break;
    case 'h3': formatted = `\n<h3>${sel || 'Heading 3'}</h3>\n`; break;
    case 'code': formatted = `<code>${sel || 'code snippet'}</code>`; break;
    case 'callout': formatted = `\n<div class="analogy-box">\n  <div class="analogy-header"><i class="fa-solid fa-lightbulb"></i> NOTE</div>\n  <div class="analogy-content">${sel || 'Note details...'}</div>\n</div>\n`; break;
  }

  textarea.value = text.substring(0, start) + formatted + text.substring(end);
  textarea.focus();
  textarea.selectionStart = start + formatted.length;
  textarea.selectionEnd = start + formatted.length;

  markEditorChanged();

  // Sync previews
  if (textareaId === 'edit-slide-0-html') updateEditorLivePreview('edit-slide-0-html', 'preview-slide-0');
  if (textareaId === 'edit-slide-1-html') updateEditorLivePreview('edit-slide-1-html', 'preview-slide-1');
}

function updateEditorLivePreview(textareaId, previewId) {
  const textarea = document.getElementById(textareaId);
  const preview = document.getElementById(previewId);
  if (!textarea || !preview) return;

  let raw = textarea.value;
  // Basic markdown tags replacement helper
  let compiled = raw
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  
  preview.innerHTML = compiled;
}

function switchEditorCodeType(type) {
  const codeBox = document.getElementById('editor-code-snippet-box');
  if (!codeBox) return;
  const script = debuggerScripts[type] || debuggerScripts.basic;
  codeBox.textContent = script.code;
  markEditorChanged();
}

function markEditorChanged() {
  editorHasChanges = true;
  DOM.cmsSaveStatus.textContent = '● Unsaved Changes';
  DOM.cmsSaveStatus.className = 'saving-pulse';
}

function renderEditorQuizQuestions(questions) {
  const container = document.getElementById('editor-quiz-questions-list');
  container.innerHTML = '';
  if (!questions) return;
  questions.forEach((q, idx) => {
    container.appendChild(createQuizQuestionRow(q, idx));
  });
}

function createQuizQuestionRow(q = {}, idx = 0) {
  const el = document.createElement('div');
  el.className = 'editor-quiz-item glass-card';
  el.style.padding = '1.25rem';
  el.style.borderStyle = 'dashed';
  
  el.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.75rem;">
      <span style="font-weight:700; color: var(--neon-purple);">MCQ Question #${idx + 1}</span>
      <button class="secondary-btn" style="border-color:#ef4444; color:#ef4444; padding:0.25rem 0.5rem; font-size:0.8rem;" onclick="deleteEditorQuizQuestion(this)"><i class="fa-solid fa-trash"></i> Delete</button>
    </div>
    <div class="form-group">
      <label>Question Text:</label>
      <input type="text" class="q-text" value="${q.q || ''}" oninput="markEditorChanged()" />
    </div>
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem; margin-top:0.75rem;">
      <div class="form-group"><label>Option A:</label><input type="text" class="opt-a" value="${q.options ? q.options[0] || '' : ''}" oninput="markEditorChanged()" /></div>
      <div class="form-group"><label>Option B:</label><input type="text" class="opt-b" value="${q.options ? q.options[1] || '' : ''}" oninput="markEditorChanged()" /></div>
      <div class="form-group"><label>Option C:</label><input type="text" class="opt-c" value="${q.options ? q.options[2] || '' : ''}" oninput="markEditorChanged()" /></div>
      <div class="form-group"><label>Option D:</label><input type="text" class="opt-d" value="${q.options ? q.options[3] || '' : ''}" oninput="markEditorChanged()" /></div>
    </div>
    <div class="form-group" style="margin-top:0.75rem;">
      <label>Correct Answer Index:</label>
      <select class="correct-idx" onchange="markEditorChanged()">
        <option value="0" ${q.answer === 0 ? 'selected' : ''}>Option A</option>
        <option value="1" ${q.answer === 1 ? 'selected' : ''}>Option B</option>
        <option value="2" ${q.answer === 2 ? 'selected' : ''}>Option C</option>
        <option value="3" ${q.answer === 3 ? 'selected' : ''}>Option D</option>
      </select>
    </div>
    <div class="form-group" style="margin-top:0.75rem;">
      <label>Explanation Notes:</label>
      <textarea class="explanation-text" style="height:60px;" oninput="markEditorChanged()">${q.explanation || ''}</textarea>
    </div>
  `;
  return el;
}

function addEditorQuizQuestion() {
  const container = document.getElementById('editor-quiz-questions-list');
  const count = container.querySelectorAll('.editor-quiz-item').length;
  container.appendChild(createQuizQuestionRow({}, count));
  markEditorChanged();
}

function deleteEditorQuizQuestion(btn) {
  btn.closest('.editor-quiz-item').remove();
  markEditorChanged();
}

function renderEditorInterviewCards(cards) {
  const container = document.getElementById('editor-interview-cards-list');
  container.innerHTML = '';
  if (!cards) return;
  cards.forEach((c, idx) => {
    container.appendChild(createInterviewCardRow(c, idx));
  });
}

function createInterviewCardRow(c = {}, idx = 0) {
  const el = document.createElement('div');
  el.className = 'editor-card-item glass-card';
  el.style.padding = '1.25rem';
  el.style.borderStyle = 'dashed';

  el.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.75rem;">
      <span style="font-weight:700; color: var(--neon-cyan);">Flashcard Q&A #${idx + 1}</span>
      <button class="secondary-btn" style="border-color:#ef4444; color:#ef4444; padding:0.25rem 0.5rem; font-size:0.8rem;" onclick="deleteEditorInterviewCard(this)"><i class="fa-solid fa-trash"></i> Delete</button>
    </div>
    <div class="form-group">
      <label>Question:</label>
      <input type="text" class="card-q" value="${c.q || ''}" oninput="markEditorChanged()" />
    </div>
    <div class="form-group" style="margin-top:0.75rem;">
      <label>Answer / Explanation:</label>
      <textarea class="card-a" style="height:70px;" oninput="markEditorChanged()">${c.answer || ''}</textarea>
    </div>
  `;
  return el;
}

function addEditorInterviewCard() {
  const container = document.getElementById('editor-interview-cards-list');
  const count = container.querySelectorAll('.editor-card-item').length;
  container.appendChild(createInterviewCardRow({}, count));
  markEditorChanged();
}

function deleteEditorInterviewCard(btn) {
  btn.closest('.editor-card-item').remove();
  markEditorChanged();
}

function saveLessonAsStatus(status) {
  const dayMeta = lmsConfig.courses[activeCourse].days[currentEditingDayId];
  if (dayMeta) {
    dayMeta.status = status;
  }
  saveCMSEditorData(false);
}

function manualSaveLesson() {
  saveCMSEditorData(false);
}

function saveCMSEditorData(isAuto = false) {
  DOM.cmsSaveStatus.textContent = '● Saving...';
  DOM.cmsSaveStatus.className = 'saving-pulse';

  const dayNum = parseInt(document.getElementById('edit-day-num').value) || 1;
  const title = document.getElementById('edit-title').value || 'New Lesson';
  const category = document.getElementById('edit-category').value || 'Fundamentals';
  const difficulty = document.getElementById('edit-difficulty').value || 'Beginner';
  const isInterview = document.getElementById('edit-is-interview').checked;
  const isRecordingReady = document.getElementById('edit-is-ready').checked;

  const slides = [
    { slideIndex: 0, html: document.getElementById('edit-slide-0-html').value },
    { slideIndex: 1, html: document.getElementById('edit-slide-1-html').value }
  ];

  // Scrape list items
  const quizQuestions = getScrapedQuizQuestions();
  const interviewCards = getScrapedInterviewCards();

  const compiledLesson = {
    id: currentEditingDayId,
    dayNum,
    title,
    category,
    difficulty,
    isInterview,
    isRecordingReady,
    notesMarkdown: document.getElementById('edit-notes-markdown').value,
    contentSlides: slides,
    codeType: document.getElementById('edit-code-type').value,
    quizQuestions,
    interviewCards,
    youtubeMeta: {
      videoTitle: document.getElementById('edit-yt-title').value,
      thumbnailIdeas: document.getElementById('edit-yt-thumbnails').value.split('\n').filter(x => x.trim()),
      videoDescription: document.getElementById('edit-yt-desc').value,
      script: {
        opening: document.getElementById('edit-script-opening').value,
        explanation: document.getElementById('edit-script-explanation').value,
        transition: document.getElementById('edit-script-transition').value,
        closing: document.getElementById('edit-script-closing').value,
        cta: document.getElementById('edit-script-cta').value
      }
    }
  };

  // 1. Post JSON lesson file to Node API
  fetch('/api/save-lesson', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      course: activeCourse,
      dayId: currentEditingDayId,
      data: compiledLesson
    })
  })
  .then(res => res.json())
  .then(resData => {
    if (resData.success) {
      // Create version history in LocalStorage
      const verKey = `cms_ver_${activeCourse}_${currentEditingDayId}`;
      let list = [];
      try { list = JSON.parse(localStorage.getItem(verKey)) || []; } catch(e) {}
      list.unshift({ timestamp: Date.now(), data: compiledLesson });
      if (list.length > 10) list.pop();
      localStorage.setItem(verKey, JSON.stringify(list));

      // 2. Sync master config
      const daysObj = lmsConfig.courses[activeCourse].days;
      if (!daysObj[currentEditingDayId]) {
        daysObj[currentEditingDayId] = {};
      }
      const dayMeta = daysObj[currentEditingDayId];
      dayMeta.dayNum = dayNum;
      dayMeta.title = title;
      dayMeta.category = category;
      dayMeta.difficulty = difficulty;
      dayMeta.isInterviewImportant = isInterview;
      dayMeta.isRecordingReady = isRecordingReady;
      dayMeta.codeType = compiledLesson.codeType;
      
      // Update config file on server
      return fetch('/api/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: lmsConfig })
      });
    } else {
      throw new Error('Server returned save failure.');
    }
  })
  .then(res => res.json())
  .then(resConfig => {
    if (resConfig.success) {
      DOM.cmsSaveStatus.textContent = isAuto ? '✓ Auto-Saved' : '✓ Saved';
      DOM.cmsSaveStatus.className = 'saved-green';
      editorHasChanges = false;
      populateVersionsSelect();
    } else {
      throw new Error('Config save failure.');
    }
  })
  .catch(err => {
    console.error(err);
    DOM.cmsSaveStatus.textContent = '❌ Save Error';
    DOM.cmsSaveStatus.className = 'val-fail';
  });
}

function getScrapedQuizQuestions() {
  const list = [];
  document.querySelectorAll('.editor-quiz-item').forEach(el => {
    const q = el.querySelector('.q-text').value;
    const a = el.querySelector('.opt-a').value;
    const b = el.querySelector('.opt-b').value;
    const c = el.querySelector('.opt-c').value;
    const d = el.querySelector('.opt-d').value;
    const correct = parseInt(el.querySelector('.correct-idx').value) || 0;
    const exp = el.querySelector('.explanation-text').value;
    list.push({ q, options: [a, b, c, d], answer: correct, explanation: exp });
  });
  return list;
}

function getScrapedInterviewCards() {
  const list = [];
  document.querySelectorAll('.editor-card-item').forEach(el => {
    const q = el.querySelector('.card-q').value;
    const a = el.querySelector('.card-a').value;
    list.push({ q, answer: a });
  });
  return list;
}

function populateVersionsSelect() {
  const select = DOM.genVersionsSelect;
  select.innerHTML = '<option value="">Select a previous version...</option>';
  
  const verKey = `cms_ver_${activeCourse}_${currentEditingDayId}`;
  let list = [];
  try { list = JSON.parse(localStorage.getItem(verKey)) || []; } catch(e) {}

  if (list.length === 0) {
    select.innerHTML = '<option value="">No versions saved</option>';
    return;
  }

  list.forEach((v, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = `Version ${list.length - idx} (${new Date(v.timestamp).toLocaleTimeString()})`;
    select.appendChild(opt);
  });
}

function restoreSelectedVersion() {
  const select = DOM.genVersionsSelect;
  const idx = select.value;
  if (idx === '') return;

  const verKey = `cms_ver_${activeCourse}_${currentEditingDayId}`;
  let list = [];
  try { list = JSON.parse(localStorage.getItem(verKey)) || []; } catch(e) {}
  
  const target = list[idx];
  if (target && confirm('Restore editor inputs to this version? (Will overwrite active fields, but won\'t write to server until you save).')) {
    populateCMSEditorFields(target.data);
    markEditorChanged();
  }
}

function createNewLesson() {
  const dNum = prompt('Enter Day Number (e.g. 2):');
  if (dNum === null) return;
  if (!dNum.trim() || isNaN(dNum)) {
    alert('Please enter a valid numeric day number!');
    return;
  }
  const title = prompt('Enter Lesson Title:');
  if (title === null) return;
  if (!title.trim()) {
    alert('Lesson Title cannot be empty!');
    return;
  }

  const dayId = `day_${dNum.trim()}`;

  // Register in config registry
  const course = lmsConfig.courses[activeCourse];
  if (course.days[dayId]) {
    alert(`Day ${dNum} already exists in this course!`);
    return;
  }

  course.days[dayId] = {
    dayNum: parseInt(dNum),
    title: title.trim(),
    phase: 1,
    difficulty: 'Beginner',
    category: 'General',
    isInterviewImportant: false,
    status: 'Draft',
    isRecordingReady: false,
    codeType: 'basic'
  };

  // Write config
  fetch('/api/save-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: lmsConfig })
  })
  .then(res => {
    if (!res.ok) throw new Error(`HTTP Error Status: ${res.status}`);
    return res.json();
  })
  .then(resData => {
    if (resData.success) {
      renderCMSDashboard();
      // Instantly open editor
      openCMSEditor(dayId);
    } else {
      throw new Error(resData.message || 'Config save error.');
    }
  })
  .catch(err => {
    console.error(err);
    alert(`Failed to save new lesson: ${err.message}`);
  });
}

function duplicateCMSLesson(dayId) {
  const targetDay = prompt('Enter new Day Number to duplicate to:');
  if (!targetDay || isNaN(targetDay)) return;
  
  const targetId = `day_${targetDay}`;
  const course = lmsConfig.courses[activeCourse];

  if (course.days[targetId]) {
    alert(`Day ${targetDay} already exists!`);
    return;
  }

  const srcMeta = course.days[dayId];
  course.days[targetId] = {
    ...srcMeta,
    dayNum: parseInt(targetDay),
    title: `${srcMeta.title} (Copy)`,
    status: 'Draft',
    isRecordingReady: false
  };

  fetch('/api/duplicate-lesson', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      course: activeCourse,
      sourceDayId: dayId,
      targetDayId: targetId
    })
  })
  .then(res => res.json())
  .then(resDup => {
    if (resDup.success) {
      return fetch('/api/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: lmsConfig })
      });
    }
  })
  .then(res => res.json())
  .then(resData => {
    renderCMSDashboard();
  });
}

function archiveCMSLesson(dayId) {
  if (confirm(`Are you sure you want to archive Day ${dayId.split('_')[1]}? it will be hidden from students.`)) {
    const dayMeta = lmsConfig.courses[activeCourse].days[dayId];
    if (dayMeta) {
      dayMeta.status = 'Archive';
      fetch('/api/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: lmsConfig })
      })
      .then(res => res.json())
      .then(() => renderCMSDashboard());
    }
  }
}

function restoreCMSLesson(dayId) {
  const dayMeta = lmsConfig.courses[activeCourse].days[dayId];
  if (dayMeta) {
    dayMeta.status = 'Draft';
    fetch('/api/save-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: lmsConfig })
    })
    .then(res => res.json())
    .then(() => renderCMSDashboard());
  }
}

function permanentDeleteCMSLesson(dayId) {
  if (confirm(`⚠️ WARNING: Are you sure you want to PERMANENTLY delete Day ${dayId.split('_')[1]}? This action is irreversible.`)) {
    delete lmsConfig.courses[activeCourse].days[dayId];
    fetch('/api/save-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: lmsConfig })
    })
    .then(res => res.json())
    .then(() => renderCMSDashboard());
  }
}

function createNewCourse() {
  const key = prompt('Enter Course ID key (e.g. springboot, python):');
  if (key === null) return;
  const cleanedKey = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!cleanedKey) {
    alert('Course ID key must contain valid alphanumeric characters!');
    return;
  }

  const title = prompt('Enter Course Display Title (e.g. Spring Boot Microservices):');
  if (title === null) return;
  if (!title.trim()) {
    alert('Course Display Title cannot be empty!');
    return;
  }

  if (lmsConfig.courses[cleanedKey]) {
    alert('Course already exists!');
    return;
  }

  lmsConfig.courses[cleanedKey] = {
    title: title.trim(),
    category: 'Development',
    totalDays: 1,
    phases: [ { id: 1, title: 'PHASE 1: Foundations', description: 'Get started.' } ],
    days: {
      day_1: { dayNum: 1, title: 'Introduction', phase: 1, difficulty: 'Beginner', category: 'General', status: 'Draft', isRecordingReady: false, codeType: 'basic' }
    }
  };

  fetch('/api/save-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: lmsConfig })
  })
  .then(res => {
    if (!res.ok) throw new Error(`HTTP Error Status: ${res.status}`);
    return res.json();
  })
  .then(resData => {
    if (resData.success) {
      populateCourseSelectors();
      switchCMSCourse(cleanedKey);
    } else {
      throw new Error(resData.message || 'Config save error.');
    }
  })
  .catch(err => {
    console.error(err);
    alert(`Failed to create course: ${err.message}`);
  });
}

function exportSingleLessonJson(dayId) {
  const filePath = `content/${activeCourse}/${dayId}.json`;
  fetch(filePath)
    .then(res => res.json())
    .then(day => {
      const blob = new Blob([JSON.stringify(day, null, 2)], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeCourse}_${dayId}.json`;
      a.click();
    });
}

function previewLessonAsStudent() {
  currentDayId = currentEditingDayId;
  DOM.workspaceDaySelect.value = currentEditingDayId;
  switchView('lesson');
}

function triggerRecordingChecklist() {
  DOM.recordingChecklistModal.style.display = 'flex';
  
  // Pre-fill checkboxes based on system states
  document.getElementById('check-pres').checked = true;
  document.getElementById('check-notes').checked = true;
  document.getElementById('check-slide').checked = true;
}

function closeRecordingChecklist() {
  DOM.recordingChecklistModal.style.display = 'none';
}

function confirmAndStartRecording() {
  // Verify checklists
  const mic = document.getElementById('check-mic').checked;
  const res = document.getElementById('check-res').checked;
  if (!mic || !res) {
    alert('Please verify audio inputs and display resolutions before proceeding.');
    return;
  }

  closeRecordingChecklist();
  
  // Set current view to lesson
  currentDayId = currentEditingDayId;
  DOM.workspaceDaySelect.value = currentEditingDayId;
  switchView('lesson');
  
  // Bootstrap Presenter Mode
  startRecordingMode();
}

/* ==========================================================================
   LASER POINTER & FOCUS HIGHLIGHT PRESENTATION MODULES
   ========================================================================== */

function toggleLaserPointer() {
  const btn = DOM.laserPointerBtn;
  const dot = document.getElementById('laser-pointer-dot');
  
  if (isLaserPointerActive) {
    isLaserPointerActive = false;
    btn.classList.remove('active-tool');
    if (dot) dot.style.display = 'none';
    document.removeEventListener('mousemove', handleLaserPointerMove);
  } else {
    isLaserPointerActive = true;
    btn.classList.add('active-tool');
    if (dot) dot.style.display = 'block';
    document.addEventListener('mousemove', handleLaserPointerMove);
  }
}

function handleLaserPointerMove(e) {
  const dot = document.getElementById('laser-pointer-dot');
  if (dot) {
    dot.style.left = e.clientX + 'px';
    dot.style.top = e.clientY + 'px';
  }
}

function toggleFocusHighlight() {
  const btn = DOM.focusHighlightBtn;
  if (isFocusHighlightActive) {
    isFocusHighlightActive = false;
    btn.classList.remove('active-tool');
    DOM.body.classList.remove('presenter-focus-mode');
  } else {
    isFocusHighlightActive = true;
    btn.classList.add('active-tool');
    DOM.body.classList.add('presenter-focus-mode');
  }
}

function editCurrentCourse() {
  const course = lmsConfig.courses[activeCourse];
  if (!course) return;
  
  const newTitle = prompt(`Enter new display title for course "${course.title}":`, course.title);
  if (newTitle === null) return;
  if (!newTitle.trim()) {
    alert('Course Title cannot be empty!');
    return;
  }
  
  course.title = newTitle.trim();
  
  // Save config to server
  fetch('/api/save-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: lmsConfig })
  })
  .then(res => {
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return res.json();
  })
  .then(resData => {
    if (resData.success) {
      populateCourseSelectors();
      switchCMSCourse(activeCourse);
    } else {
      throw new Error(resData.message || 'Config save error.');
    }
  })
  .catch(err => {
    console.error(err);
    alert(`Failed to rename course: ${err.message}`);
  });
}

function deleteCurrentCourse() {
  const course = lmsConfig.courses[activeCourse];
  if (!course) return;
  
  const remainingKeys = Object.keys(lmsConfig.courses);
  if (remainingKeys.length <= 1) {
    alert('Cannot delete the last remaining course pathway!');
    return;
  }
  
  if (confirm(`⚠️ WARNING: Are you sure you want to permanently delete the course "${course.title}"?\nThis will remove the course metadata from the registry. This action is irreversible.`)) {
    delete lmsConfig.courses[activeCourse];
    
    // Fallback to first available course
    const fallbackKey = Object.keys(lmsConfig.courses)[0] || 'java';
    
    fetch('/api/save-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: lmsConfig })
    })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      return res.json();
    })
    .then(resData => {
      if (resData.success) {
        populateCourseSelectors();
        switchCMSCourse(fallbackKey);
      } else {
        throw new Error(resData.message || 'Config save error.');
      }
    })
    .catch(err => {
      console.error(err);
      alert(`Failed to delete course: ${err.message}`);
    });
  }
}

