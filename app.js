/* ==========================================================================
   FIREBASE CONFIGURATION & INITIALIZATION
   ========================================================================== */

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyB5InF4Fs-i--z8Tu-IA2ErA9AYwZtwCds",
  authDomain: "nembe-test-score.firebaseapp.com",
  databaseURL: "https://nembe-test-score-default-rtdb.firebaseio.com",
  projectId: "nembe-test-score",
  storageBucket: "nembe-test-score.firebasestorage.app",
  messagingSenderId: "200923321537",
  appId: "1:200923321537:web:1e6eb9644a4da17a8af040"
};

let db = null;
let isFirebaseEnabled = false;
let deviceFingerprint = 'demo-fingerprint';

// Initialize Firebase if the API key has been filled in
if (typeof firebase !== 'undefined' && firebaseConfig.apiKey !== "YOUR_API_KEY") {
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    
    // Force Firestore to use standard HTTPS long-polling instead of WebSockets
    // This bypasses strict firewalls, VPNs, or network blocks that throw "client offline" errors
    db.settings({
      experimentalForceLongPolling: true
    });
    
    isFirebaseEnabled = true;
    console.log("Firebase Cloud Firestore successfully initialized!");
  } catch (e) {
    console.error("Firebase initialization failed:", e);
  }
} else {
  console.warn("Firebase config placeholders not replaced or SDK missing. Running in Local Storage demo mode!");
}

// Generate a consistent unique hash for this browser/device
function getDeviceFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let canvasHash = 'no-canvas';
    if (ctx) {
      canvas.width = 200;
      canvas.height = 50;
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial', sans-serif";
      ctx.fillStyle = "#f60";
      ctx.fillRect(10, 10, 50, 10);
      ctx.fillStyle = "#069";
      ctx.fillText("CampusGrab_Awards_2026", 5, 5);
      canvasHash = canvas.toDataURL();
    }

    const parts = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 'unknown',
      canvasHash
    ];

    const str = parts.join('###');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return 'fp-' + Math.abs(hash).toString(16);
  } catch (e) {
    console.error("Error creating fingerprint, using fallback.", e);
    // Fallback: generate a random but persistent local ID if calculation fails completely
    let fallback = localStorage.getItem('campus_grab_awards_fallback_fp');
    if (!fallback) {
      fallback = 'fp-fallback-' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('campus_grab_awards_fallback_fp', fallback);
    }
    return fallback;
  }
}

/* ==========================================================================
   STATE MANAGEMENT & CONSTANTS
   ========================================================================== */

// Award Category Definitions
const CATEGORIES = {
  'best-vibe-male': {
    id: 'best-vibe-male',
    title: 'Best Vibe — Male',
    description: 'This award goes to the male student who brings the most positive energy to campus — the one whose presence lights up any room, lifts moods, and keeps the vibes unmatched.',
    prizeFinalist: 5000,
    prizeWinner: 50000
  },
  'best-vibe-female': {
    id: 'best-vibe-female',
    title: 'Best Vibe — Female',
    description: 'This award recognises the female student who consistently radiates good energy, warmth, and positivity across campus. She makes everyone feel welcome and keeps the atmosphere alive.',
    prizeFinalist: 5000,
    prizeWinner: 50000
  },
  'rising-star-male': {
    id: 'rising-star-male',
    title: 'Rising Star — Male',
    description: 'This award celebrates the male student who is new or upcoming yet already making a big impact — through talent, leadership, academics, or campus influence. A star on the rise.',
    prizeFinalist: 5000,
    prizeWinner: 50000
  },
  'rising-star-female': {
    id: 'rising-star-female',
    title: 'Rising Star — Female',
    description: 'This award honours the female student who has shown outstanding growth and promise. She may be new, but her impact is impossible to ignore. Watch this space.',
    prizeFinalist: 5000,
    prizeWinner: 50000
  }
};

// Initial state schema
const INITIAL_STATE = {
  currentStage: 1, // 1: Nominations, 2: Finalist Selection, 3: Voting
  nominations: [],
  finalists: {
    'best-vibe-male': [],
    'best-vibe-female': [],
    'rising-star-male': [],
    'rising-star-female': []
  },
  // Tracks user's own votes local to this browser
  userVotes: {
    'best-vibe': null,
    'rising-star': null
  },
  timelineDates: {
    nominationEnd: 'June 29',
    votingStart: 'July 10',
    votingEnd: 'September 10',
    grandFinale: 'September 19'
  },
  isAdminAuthenticated: false
};

// Global App State
let state = {};

// Active category selection in Stage 1 Tab View
let activeCategoryTab = 'best-vibe-male';

// Active accordions in Stage 2 Selection Dashboard
let activeAccordion = 'best-vibe-male';

/* ==========================================================================
   INITIALIZATION & DATA SYNCING
   ========================================================================== */

// Initialize Application
function initApp() {
  // Generate fingerprint
  deviceFingerprint = getDeviceFingerprint();
  console.log("Device fingerprint generated: " + deviceFingerprint);

  const storedState = localStorage.getItem('campus_grab_awards_state');
  if (storedState) {
    try {
      state = JSON.parse(storedState);
      // Ensure any missing fields are merged in
      state = { ...INITIAL_STATE, ...state };
    } catch (e) {
      console.error("Error reading stored state, resetting.", e);
      state = JSON.parse(JSON.stringify(INITIAL_STATE));
    }
  } else {
    // Deep clone initial state
    state = JSON.parse(JSON.stringify(INITIAL_STATE));
  }
  
  // Set initial admin authentication state to false on page load for safety
  state.isAdminAuthenticated = false;

  if (isFirebaseEnabled) {
    // 1. Listen for global settings (currentStage, finalists, timelineDates)
    db.collection('systemState').doc('global').onSnapshot(doc => {
      if (doc.exists) {
        const data = doc.data();
        state.currentStage = data.currentStage ?? state.currentStage;
        state.finalists = data.finalists ?? state.finalists;
        state.timelineDates = data.timelineDates ?? state.timelineDates;
        renderApp();
      } else {
        // Initialize global settings in DB
        db.collection('systemState').doc('global').set({
          currentStage: state.currentStage,
          finalists: state.finalists,
          timelineDates: state.timelineDates
        }).catch(err => console.error("Error writing settings: ", err));
      }
    }, err => {
      console.error("Error listening to settings:", err);
    });

    // 2. Listen for nominations list changes
    db.collection('nominations').onSnapshot(snapshot => {
      state.nominations = [];
      snapshot.forEach(doc => {
        state.nominations.push({ id: doc.id, ...doc.data() });
      });
      renderApp();
    }, err => {
      console.error("Error listening to nominations:", err);
    });

    // 3. Fetch user's votes once for highlight
    db.collection('deviceActions')
      .where('fingerprint', '==', deviceFingerprint)
      .where('actionType', '==', 'vote')
      .get()
      .then(snapshot => {
        state.userVotes = { 'best-vibe': null, 'rising-star': null };
        snapshot.forEach(doc => {
          const data = doc.data();
          state.userVotes[data.category] = data.targetId;
        });
        renderApp();
      }).catch(err => {
        console.error("Error fetching user votes:", err);
      });
  } else {
    saveState();
    renderApp();
  }
  
  // Setup forms and events
  setupEvents();
}

// Save state to local storage
function saveState() {
  localStorage.setItem('campus_grab_awards_state', JSON.stringify(state));
}

// Reset state entirely (Admin Command)
async function adminResetData() {
  if (confirm("Are you sure you want to reset all nominations, finalist selections, and votes? This cannot be undone.")) {
    if (isFirebaseEnabled) {
      try {
        showToast("Resetting database...", "info");
        
        // Reset system global settings
        await db.collection('systemState').doc('global').set({
          currentStage: 1,
          finalists: {
            'best-vibe-male': [],
            'best-vibe-female': [],
            'rising-star-male': [],
            'rising-star-female': []
          },
          timelineDates: {
            nominationEnd: 'June 29',
            votingStart: 'July 10',
            votingEnd: 'September 10',
            grandFinale: 'September 19'
          }
        });
        
        // Delete all nominations docs
        const nominationsSnapshot = await db.collection('nominations').get();
        const batch1 = db.batch();
        nominationsSnapshot.forEach(doc => {
          batch1.delete(doc.ref);
        });
        await batch1.commit();
        
        // Delete all device actions docs
        const actionsSnapshot = await db.collection('deviceActions').get();
        const batch2 = db.batch();
        actionsSnapshot.forEach(doc => {
          batch2.delete(doc.ref);
        });
        await batch2.commit();
        
        state.userVotes = {
          'best-vibe': null,
          'rising-star': null
        };
        
        closeAdminPanel();
        showToast("System successfully reset in Firebase Database!", "success");
      } catch (e) {
        console.error("Database reset failed:", e);
        showToast("Failed to reset database: " + e.message, "error");
      }
    } else {
      state = JSON.parse(JSON.stringify(INITIAL_STATE));
      saveState();
      closeAdminPanel();
      renderApp();
      showToast("System successfully reset to default demo state.", "success");
    }
  }
}

/* ==========================================================================
   EVENT LISTENERS & BINDINGS
   ========================================================================== */
function setupEvents() {
  // Synchronize category tab and form options on page load
  switchCategoryTab(activeCategoryTab);
}

/* ==========================================================================
   CORE RENDERING CONTROLLER
   ========================================================================== */
function renderApp() {
  renderProgressBar();
  renderTimeline();
  
  // Toggle Stage Sections
  document.querySelectorAll('.stage-view').forEach(view => view.classList.remove('active'));
  
  if (state.currentStage === 1) {
    document.getElementById('stage-nominations-view').classList.add('active');
    renderStage1Nominations();
  } else if (state.currentStage === 2) {
    document.getElementById('stage-finalists-view').classList.add('active');
    renderStage2FinalistSelection();
  } else if (state.currentStage === 3) {
    document.getElementById('stage-voting-view').classList.add('active');
    renderStage3Voting();
  }
  
  // Sync admin panels/buttons
  const adminConsoleBtn = document.getElementById('admin-console-btn');
  if (state.isAdminAuthenticated) {
    adminConsoleBtn.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
      Admin Panel
    `;
    adminConsoleBtn.setAttribute('onclick', 'openAdminPanel()');
  } else {
    adminConsoleBtn.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
      Admin Login
    `;
    adminConsoleBtn.setAttribute('onclick', 'openAdminModal()');
  }
}

// Render Top Progress Bar
function renderProgressBar() {
  const steps = [
    document.getElementById('step-1'),
    document.getElementById('step-2'),
    document.getElementById('step-3')
  ];
  const progressLineFill = document.getElementById('progress-line-fill');
  const stageBadge = document.getElementById('current-stage-badge');
  
  // Clear step states
  steps.forEach(step => {
    step.classList.remove('active', 'completed');
  });
  
  if (state.currentStage === 1) {
    steps[0].classList.add('active');
    progressLineFill.style.width = '0%';
    stageBadge.textContent = 'Stage 1: Public Nominations Open';
    stageBadge.className = 'badge badge-pulse';
  } else if (state.currentStage === 2) {
    steps[0].classList.add('completed');
    steps[1].classList.add('active');
    progressLineFill.style.width = '50%';
    stageBadge.textContent = 'Stage 2: Finalist Selection (Admin Mode)';
    stageBadge.className = 'badge';
  } else if (state.currentStage === 3) {
    steps[0].classList.add('completed');
    steps[1].classList.add('completed');
    steps[2].classList.add('active');
    progressLineFill.style.width = '100%';
    stageBadge.textContent = 'Stage 3: Live Voting Open';
    stageBadge.className = 'badge badge-pulse';
  }
}

// Render Timeline Highlights
function renderTimeline() {
  // Sync text elements with state timelineDates
  document.querySelector('#tl-nominations .tl-date').textContent = state.timelineDates.nominationEnd;
  document.querySelector('#tl-voting-start .tl-date').textContent = state.timelineDates.votingStart;
  document.querySelector('#tl-voting-end .tl-date').textContent = state.timelineDates.votingEnd;
  document.querySelector('#tl-announcement .tl-date').textContent = state.timelineDates.grandFinale;
  
  // Highlight active timeline node based on stage
  document.querySelectorAll('.timeline-item').forEach(item => item.classList.remove('active'));
  
  if (state.currentStage === 1) {
    document.getElementById('tl-nominations').classList.add('active');
  } else if (state.currentStage === 2) {
    document.getElementById('tl-voting-start').classList.add('active');
  } else if (state.currentStage === 3) {
    document.getElementById('tl-voting-end').classList.add('active');
  }
}

/* ==========================================================================
   STAGE 1 LOGIC & ACTIONS: NOMINATIONS
   ========================================================================== */

// Switch Category Tabs in Nominations
function switchCategoryTab(categoryId) {
  activeCategoryTab = categoryId;
  
  // Set tab active styling
  document.querySelectorAll('.categories-tabs .tab-btn').forEach(btn => {
    if (btn.getAttribute('data-cat') === categoryId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Synchronize Form input values
  const gender = categoryId.endsWith('-male') ? 'male' : 'female';
  const radio = document.querySelector(`input[name="nominee-gender"][value="${gender}"]`);
  if (radio) radio.checked = true;
  
  // Re-populate select options for this gender
  const select = document.getElementById('nominee-category-select');
  if (select) {
    select.innerHTML = '';
    if (gender === 'male') {
      select.innerHTML = `
        <option value="best-vibe-male">Best Vibe — Male</option>
        <option value="rising-star-male">Rising Star — Male</option>
      `;
    } else {
      select.innerHTML = `
        <option value="best-vibe-female">Best Vibe — Female</option>
        <option value="rising-star-female">Rising Star — Female</option>
      `;
    }
    select.value = categoryId;
  }
  
  // Clear search field
  document.getElementById('nomination-search').value = '';

  renderStage1Nominations();
}

// Populates category select in form depending on gender radio
function updateFormCategories(gender) {
  const select = document.getElementById('nominee-category-select');
  if (!select) return;
  
  select.innerHTML = '';
  if (gender === 'male') {
    select.innerHTML = `
      <option value="best-vibe-male">Best Vibe — Male</option>
      <option value="rising-star-male">Rising Star — Male</option>
    `;
  } else if (gender === 'female') {
    select.innerHTML = `
      <option value="best-vibe-female">Best Vibe — Female</option>
      <option value="rising-star-female">Rising Star — Female</option>
    `;
  }
  
  // Switch category tab view to match selected category
  switchCategoryTab(select.value);
}

// Catches dropdown change and updates layout
function handleFormCategoryChange() {
  const select = document.getElementById('nominee-category-select');
  if (select) {
    switchCategoryTab(select.value);
  }
}

// Render Active Stage 1 Nomination panel
function renderStage1Nominations() {
  const catInfo = CATEGORIES[activeCategoryTab];
  if (!catInfo) return;
  
  // Update counts on the tab buttons dynamically
  Object.keys(CATEGORIES).forEach(catId => {
    const tabBtn = document.querySelector(`.categories-tabs .tab-btn[data-cat="${catId}"]`);
    if (tabBtn) {
      const count = state.nominations.filter(nom => nom.category === catId).length;
      let label = "";
      if (catId === 'best-vibe-male') label = "Best Vibe (M)";
      else if (catId === 'best-vibe-female') label = "Best Vibe (F)";
      else if (catId === 'rising-star-male') label = "Rising Star (M)";
      else if (catId === 'rising-star-female') label = "Rising Star (F)";
      tabBtn.textContent = `${label} (${count})`;
    }
  });

  // Render details card
  const detailsContainer = document.getElementById('active-category-details');
  detailsContainer.innerHTML = `
    <div class="category-detail-header">
      <h2 class="category-title">${catInfo.title}</h2>
      <span class="badge">Naira Cash Prizes</span>
    </div>
    <p class="category-desc">"${catInfo.description}"</p>
    <div class="category-prizes">
      <div class="prize-box">
        <span class="prize-lbl">Finalist Stage</span>
        <span class="prize-val-bold">₦${catInfo.prizeFinalist.toLocaleString()}</span>
      </div>
      <div class="prize-box">
        <span class="prize-lbl">Category Winner</span>
        <span class="prize-val-bold">₦${catInfo.prizeWinner.toLocaleString()}</span>
      </div>
    </div>
  `;
  
  // Render Nominations list table
  renderNominationTable();
}

// Render nomination rows
function renderNominationTable() {
  const tbody = document.getElementById('nominations-table-body');
  const emptyState = document.getElementById('no-nominations-message');
  const searchQuery = document.getElementById('nomination-search').value.toLowerCase().trim();
  
  // Filter nominations for active category
  let categoryNoms = state.nominations.filter(nom => nom.category === activeCategoryTab);
  const totalCatCount = categoryNoms.length;
  
  // Apply Search query
  if (searchQuery) {
    categoryNoms = categoryNoms.filter(nom => 
      nom.name.toLowerCase().includes(searchQuery) || 
      nom.department.toLowerCase().includes(searchQuery)
    );
  }
  
  tbody.innerHTML = '';
  
  // Update header count title
  const listCardTitle = document.querySelector('.list-card .card-title');
  if (listCardTitle) {
    if (searchQuery) {
      listCardTitle.textContent = `Current Nominations (Filtered: ${categoryNoms.length} / Total: ${totalCatCount})`;
    } else {
      listCardTitle.textContent = `Current Nominations (Count: ${totalCatCount})`;
    }
  }
  
  if (categoryNoms.length === 0) {
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';
    categoryNoms.forEach(nom => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHTML(nom.name)}</strong></td>
        <td>${escapeHTML(nom.department)}</td>
        <td><span class="badge" style="background: rgba(139, 92, 246, 0.15); border-color: rgba(139, 92, 246, 0.3); color: var(--text-primary); font-weight: 700;">${nom.nominationCount || 1}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }
}

// Search filter binding
function filterNominationList() {
  renderNominationTable();
}

// Handle Form Submission: Create Nomination (with Firebase fingerprint check)
async function handleNominateSubmit(event) {
  event.preventDefault();
  
  const category = document.getElementById('nominee-category-select').value;
  const nameInput = document.getElementById('nominee-name');
  const deptInput = document.getElementById('nominee-dept');
  const feedback = document.getElementById('nomination-feedback');
  
  const name = nameInput.value.trim();
  const department = deptInput.value.trim();
  
  if (!name || !department) {
    showFormFeedback(feedback, "Please fill in all fields.", "error");
    return;
  }

  if (isFirebaseEnabled) {
    try {
      showFormFeedback(feedback, "Submitting nomination...", "info");
      
      // 1. Device check: has this device nominated in this category already?
      const actionDocId = `${deviceFingerprint}_nominate_${category}`;
      const actionDocRef = db.collection('deviceActions').doc(actionDocId);
      const actionDoc = await actionDocRef.get();
      
      if (actionDoc.exists) {
        showFormFeedback(feedback, "This device has already nominated in this category!", "error");
        showToast("You can only nominate once per category from this device.", "error");
        return;
      }
      
      // 2. Check if candidate already nominated in this category (case-insensitive)
      let existingNomineeDoc = null;
      const nominationsSnapshot = await db.collection('nominations')
        .where('category', '==', category)
        .get();
        
      nominationsSnapshot.forEach(doc => {
        const d = doc.data();
        if (d.name.toLowerCase() === name.toLowerCase() && d.department.toLowerCase() === department.toLowerCase()) {
          existingNomineeDoc = doc;
        }
      });
      
      if (existingNomineeDoc) {
        // Increment count
        const nomineeRef = db.collection('nominations').doc(existingNomineeDoc.id);
        await db.runTransaction(async (transaction) => {
          const doc = await transaction.get(nomineeRef);
          const currentCount = doc.data().nominationCount || 1;
          transaction.update(nomineeRef, { nominationCount: currentCount + 1 });
        });
        
        // Write action to prevent double submissions
        await actionDocRef.set({
          fingerprint: deviceFingerprint,
          actionType: 'nominate',
          category: category,
          targetId: existingNomineeDoc.id,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        nameInput.value = '';
        deptInput.value = '';
        showFormFeedback(feedback, `Nomination added! ${name} now has new nomination in this category.`, "success");
        showToast(`Updated nomination count for ${name}!`, "success");
        
        // Show success modal with WhatsApp discussion/giveaway invite
        toggleNominationSuccessModal(true);
      } else {
        // Create new nominee
        const newNomId = 'nom-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        const nomineeRef = db.collection('nominations').doc(newNomId);
        
        await nomineeRef.set({
          category: category,
          name: name,
          department: department,
          nominationCount: 1,
          votes: 0,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Write action to prevent double submissions
        await actionDocRef.set({
          fingerprint: deviceFingerprint,
          actionType: 'nominate',
          category: category,
          targetId: newNomId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        nameInput.value = '';
        deptInput.value = '';
        showFormFeedback(feedback, "Nomination submitted successfully!", "success");
        showToast(`Nominated ${name} successfully!`, "success");
        
        // Show success modal with WhatsApp discussion/giveaway invite
        toggleNominationSuccessModal(true);
      }
    } catch (e) {
      console.error("Nomination transaction failed: ", e);
      showFormFeedback(feedback, "Nomination failed. Database error: " + e.message, "error");
    }
  } else {
    // Check if student is already nominated in this category (Case-insensitive check)
    const existingNominee = state.nominations.find(nom => 
      nom.category === category && 
      nom.name.toLowerCase() === name.toLowerCase() && 
      nom.department.toLowerCase() === department.toLowerCase()
    );
    
    if (existingNominee) {
      // Increment their nomination count
      existingNominee.nominationCount = (existingNominee.nominationCount || 1) + 1;
      saveState();
      
      // Reset input fields
      nameInput.value = '';
      deptInput.value = '';
      
      showFormFeedback(feedback, `Nomination added! ${name} now has ${existingNominee.nominationCount} nominations in this category.`, "success");
      showToast(`Updated nomination count for ${name}!`, "success");
      
      // Show success modal with WhatsApp discussion/giveaway invite
      toggleNominationSuccessModal(true);
      
      renderStage1Nominations();
      return;
    }
    
    // Create and add new nomination
    const newNomination = {
      id: 'nom-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      category: category,
      name: name,
      department: department,
      nominationCount: 1,
      votes: 0
    };
    
    state.nominations.push(newNomination);
    saveState();
    
    // Reset fields
    nameInput.value = '';
    deptInput.value = '';
    
    showFormFeedback(feedback, "Nomination submitted successfully!", "success");
    
    // Re-render nomination list
    renderStage1Nominations();
    
    // Alert message banner
    showToast(`Nominated ${name} successfully!`, "success");
    
    // Show success modal with WhatsApp discussion/giveaway invite
    toggleNominationSuccessModal(true);
  }
}

/* ==========================================================================
   STAGE 2 LOGIC & ACTIONS: FINALIST SELECTION (ADMIN)
   ========================================================================== */

// Open accordion in Finalist Selector view
function toggleAccordion(categoryId) {
  if (activeAccordion === categoryId) {
    activeAccordion = null; // collapse
  } else {
    activeAccordion = categoryId;
  }
  renderStage2FinalistSelection();
}

// Render Finalist selection view
function renderStage2FinalistSelection() {
  // Check if admin is authenticated (extra safety check, although UI sections are controlled)
  
  // 1. Render Summary indicator grid & check overall readiness
  let categoriesReadyCount = 0;
  
  Object.keys(CATEGORIES).forEach(catId => {
    const selectedFinalistIds = state.finalists[catId] || [];
    const count = selectedFinalistIds.length;
    const isCompleted = count === 2;
    
    if (isCompleted) {
      categoriesReadyCount++;
    }
    
    // Update summary card item
    const progItem = document.getElementById(`prog-badge-${catId}`);
    if (progItem) {
      const statusText = progItem.querySelector('.prog-status');
      const fillBar = progItem.querySelector('.prog-mini-bar .fill');
      
      statusText.textContent = `${count} / 2 selected`;
      fillBar.style.width = `${(count / 2) * 100}%`;
      
      if (isCompleted) {
        progItem.style.borderColor = 'var(--accent-green)';
        statusText.style.color = 'var(--accent-green)';
      } else {
        progItem.style.borderColor = 'var(--border-color)';
        statusText.style.color = 'var(--accent-gold)';
      }
    }
    
    // Update Accordion Headers
    const accordionHeader = document.querySelector(`.accordion-item[data-category="${catId}"] .accordion-header`);
    if (accordionHeader) {
      const badge = accordionHeader.querySelector('.accordion-badge');
      badge.textContent = `${count}/2 Selected`;
      
      if (isCompleted) {
        badge.className = 'accordion-badge badge-success';
        badge.style.background = 'var(--accent-green-glow)';
        badge.style.borderColor = 'rgba(16, 185, 129, 0.25)';
        badge.style.color = 'var(--text-primary)';
      } else {
        badge.className = 'accordion-badge';
        badge.style.background = 'var(--accent-gold-glow)';
        badge.style.borderColor = 'rgba(245, 158, 11, 0.25)';
        badge.style.color = 'var(--accent-gold)';
      }
    }
    
    // Accordion active expansion toggling
    const accordionItem = document.querySelector(`.accordion-item[data-category="${catId}"]`);
    if (accordionItem) {
      if (activeAccordion === catId) {
        accordionItem.classList.add('active');
      } else {
        accordionItem.classList.remove('active');
      }
    }
    
    // 2. Render Selection checkbox cards in accordion bodies
    const grid = document.getElementById(`select-grid-${catId}`);
    if (grid) {
      const catNoms = state.nominations.filter(nom => nom.category === catId);
      grid.innerHTML = '';
      
      if (catNoms.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;">No nominations found in this category. Transition back to nominations or add them via console.</div>`;
      } else {
        catNoms.forEach(nom => {
          const isSelected = selectedFinalistIds.includes(nom.id);
          const selectorCard = document.createElement('div');
          selectorCard.className = `selector-card ${isSelected ? 'selected' : ''}`;
          selectorCard.setAttribute('onclick', `toggleFinalistSelection('${nom.id}', '${catId}')`);
          selectorCard.innerHTML = `
            <div class="selector-info">
              <span class="selector-name">${escapeHTML(nom.name)}</span>
              <span class="selector-dept">${escapeHTML(nom.department)}</span>
            </div>
            <div class="selector-checkbox"></div>
          `;
          grid.appendChild(selectorCard);
        });
      }
    }
  });
  
  // 3. Unlock button logic
  const openVotingBtn = document.getElementById('open-voting-btn');
  const reqText = document.getElementById('voting-unlock-requirement');
  
  if (categoriesReadyCount === 4) {
    openVotingBtn.removeAttribute('disabled');
    openVotingBtn.className = "btn btn-success btn-large";
    reqText.textContent = "All categories have 2 finalists selected. Ready to open public voting!";
    reqText.className = "requirement-text success-text";
    
    // Also unlock inside drawer
    document.getElementById('admin-open-voting-btn').removeAttribute('disabled');
  } else {
    openVotingBtn.setAttribute('disabled', 'true');
    openVotingBtn.className = "btn btn-secondary btn-large";
    reqText.textContent = "All 4 categories must have exactly 2 finalists selected to open voting.";
    reqText.className = "requirement-text";
    
    // Also lock inside drawer
    document.getElementById('admin-open-voting-btn').setAttribute('disabled', 'true');
  }
}

// Toggle selection checkbox for finalist
function toggleFinalistSelection(nomineeId, category) {
  // Check if admin is authenticated
  if (!state.isAdminAuthenticated) {
    showToast("Unauthorized. Please authenticate as Admin.", "error");
    return;
  }
  
  let selected = state.finalists[category] || [];
  const index = selected.indexOf(nomineeId);
  
  if (index > -1) {
    // Already selected, deselect it
    selected.splice(index, 1);
  } else {
    // Select it, check if we already have 2
    if (selected.length >= 2) {
      showToast("You can only select exactly 2 finalists per category.", "error");
      return;
    }
    selected.push(nomineeId);
  }
  
  if (isFirebaseEnabled) {
    db.collection('systemState').doc('global').update({
      [`finalists.${category}`]: selected
    }).catch(err => {
      console.error(err);
      showToast("Failed to save selection to database.", "error");
    });
  } else {
    state.finalists[category] = selected;
    saveState();
    renderStage2FinalistSelection();
  }
}

// Trigger Stage 3: Open Voting
function handleOpenVoting() {
  if (!state.isAdminAuthenticated) {
    showToast("Unauthorized. Admin authentication required.", "error");
    return;
  }
  
  // Verify all categories have 2
  let ok = true;
  Object.keys(CATEGORIES).forEach(catId => {
    if (state.finalists[catId].length !== 2) ok = false;
  });
  
  if (!ok) {
    showToast("Cannot open voting. Select exactly 2 finalists for each category.", "error");
    return;
  }
  
  if (confirm("Are you sure you want to open public voting? Nominations and finalists will be locked, and voting results will go live.")) {
    if (isFirebaseEnabled) {
      db.collection('systemState').doc('global').update({
        currentStage: 3
      }).then(() => {
        showToast("Voting is now open to the public!", "success");
      }).catch(err => {
        console.error(err);
        showToast("Failed to open voting in database.", "error");
      });
    } else {
      state.currentStage = 3;
      saveState();
      renderApp();
      showToast("Voting is now open to the public!", "success");
    }
  }
}

/* ==========================================================================
   STAGE 3 LOGIC & ACTIONS: VOTING PORTAL
   ========================================================================== */

function renderStage3Voting() {
  const mergedCategories = ['best-vibe', 'rising-star'];
  
  mergedCategories.forEach(combinedCatId => {
    const optionContainer = document.getElementById(`vote-options-${combinedCatId}`);
    if (!optionContainer) return;
    
    // Combine finalist IDs from male and female sub-categories
    const maleCatId = `${combinedCatId}-male`;
    const femaleCatId = `${combinedCatId}-female`;
    
    const maleFinalists = state.finalists[maleCatId] || [];
    const femaleFinalists = state.finalists[femaleCatId] || [];
    const finalistIds = [...maleFinalists, ...femaleFinalists];
    
    const localVotedId = state.userVotes[combinedCatId];
    
    optionContainer.innerHTML = '';
    
    if (finalistIds.length === 0) {
      optionContainer.innerHTML = `<div class="empty-state">No finalists selected by Admin.</div>`;
      return;
    }
    
    finalistIds.forEach(fid => {
      const nominee = state.nominations.find(nom => nom.id === fid);
      if (!nominee) return;
      
      const isVoted = localVotedId === fid;
      
      const voteRow = document.createElement('div');
      voteRow.className = `finalist-vote-row ${isVoted ? 'voted' : ''}`;
      voteRow.setAttribute('onclick', `handleVote('${fid}', '${combinedCatId}')`);
      voteRow.innerHTML = `
        <div class="vote-row-info">
          <span class="vote-row-name">${escapeHTML(nominee.name)}</span>
          <span class="vote-row-dept">${escapeHTML(nominee.department)}</span>
          <span class="badge" style="font-size: 0.7rem; padding: 0.15rem 0.5rem; margin-top: 0.35rem; width: fit-content; background: rgba(255, 255, 255, 0.05); border-color: var(--border-color); color: var(--text-muted);">
            ${nominee.category.endsWith('-male') ? 'Male Nominee' : 'Female Nominee'}
          </span>
        </div>
        <button class="vote-action-btn">${isVoted ? 'Voted' : 'Vote'}</button>
      `;
      optionContainer.appendChild(voteRow);
    });
    
    // Outline category card if completed
    const catCard = document.getElementById(`vote-card-${combinedCatId}`);
    if (catCard) {
      if (localVotedId) {
        catCard.classList.add('completed-vote');
      } else {
        catCard.classList.remove('completed-vote');
      }
    }
  });
}

// User Casts Vote (Dynamic Vote change support, synced to Firebase with device fingerprinting)
async function handleVote(finalistId, category) {
  if (isFirebaseEnabled) {
    try {
      const voteDocId = `${deviceFingerprint}_vote_${category}`;
      const voteDocRef = db.collection('deviceActions').doc(voteDocId);
      const voteDoc = await voteDocRef.get();
      const currentVoteId = voteDoc.exists ? voteDoc.data().targetId : null;
      
      if (currentVoteId === finalistId) {
        // Tapping the same voted candidate clears the vote
        const nomineeRef = db.collection('nominations').doc(finalistId);
        await db.runTransaction(async (transaction) => {
          const doc = await transaction.get(nomineeRef);
          if (doc.exists) {
            const currentVotes = doc.data().votes || 0;
            transaction.update(nomineeRef, { votes: Math.max(0, currentVotes - 1) });
          }
        });
        
        await voteDocRef.delete();
        state.userVotes[category] = null;
        showToast("Vote removed.", "success");
      } else {
        // If they had voted for someone else, decrement that candidate's vote count
        if (currentVoteId) {
          const oldNomineeRef = db.collection('nominations').doc(currentVoteId);
          await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(oldNomineeRef);
            if (doc.exists) {
              const currentVotes = doc.data().votes || 0;
              transaction.update(oldNomineeRef, { votes: Math.max(0, currentVotes - 1) });
            }
          });
        }
        
        // Increment the new candidate's vote count
        const newNomineeRef = db.collection('nominations').doc(finalistId);
        let name = '';
        await db.runTransaction(async (transaction) => {
          const doc = await transaction.get(newNomineeRef);
          if (doc.exists) {
            name = doc.data().name;
            const currentVotes = doc.data().votes || 0;
            transaction.update(newNomineeRef, { votes: currentVotes + 1 });
          }
        });
        
        // Save the device action record
        await voteDocRef.set({
          fingerprint: deviceFingerprint,
          actionType: 'vote',
          category: category,
          targetId: finalistId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        state.userVotes[category] = finalistId;
        showToast(`Voted for ${name}!`, "success");
      }
      renderStage3Voting();
    } catch (e) {
      console.error("Voting transaction failed:", e);
      showToast("Voting failed. Database error: " + e.message, "error");
    }
  } else {
    const currentVoteId = state.userVotes[category];
    
    if (currentVoteId === finalistId) {
      // Tapping the voted candidate again clears the vote
      const nominee = state.nominations.find(nom => nom.id === finalistId);
      if (nominee && nominee.votes > 0) {
        nominee.votes--;
      }
      state.userVotes[category] = null;
      showToast("Vote removed.", "success");
    } else {
      // If they had voted for someone else in this category before, decrement that nominee's count
      if (currentVoteId) {
        const oldNominee = state.nominations.find(nom => nom.id === currentVoteId);
        if (oldNominee && oldNominee.votes > 0) {
          oldNominee.votes--;
        }
      }
      
      // Increment the newly voted nominee's count
      const newNominee = state.nominations.find(nom => nom.id === finalistId);
      if (newNominee) {
        newNominee.votes = (newNominee.votes || 0) + 1;
      }
      
      // Save to userVotes state
      state.userVotes[category] = finalistId;
      showToast(`Voted for ${newNominee.name}!`, "success");
    }
    
    saveState();
    renderStage3Voting();
  }
}

/* ==========================================================================
   RESULTS PAGE / MODAL & DYNAMIC CHARTING
   ========================================================================== */

// Global interval tracking for countdown
let resultsCountdownInterval = null;

// Helper to parse date strings (e.g. "September 10" or "June 29") into Date objects
function parseDateString(dateStr) {
  if (!dateStr) return null;
  // Clean string: replace multiple spaces with single space, remove ordinal suffixes (1st, 2nd, etc.)
  let cleaned = dateStr.toLowerCase().replace(/,/g, '').trim();
  cleaned = cleaned.replace(/(\d+)(st|nd|rd|th)/g, '$1');
  
  const months = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
  };
  
  // Check if it contains a year (4 digits)
  let year = 2026; // default to 2026 based on metadata
  const yearMatch = cleaned.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
    cleaned = cleaned.replace(yearMatch[1], '').trim();
  }
  
  // Find month and day
  let month = -1;
  let day = -1;
  
  const words = cleaned.split(/\s+/);
  for (let word of words) {
    if (months[word] !== undefined) {
      month = months[word];
    } else {
      const num = parseInt(word, 10);
      if (!isNaN(num) && num > 0 && num <= 31) {
        day = num;
      }
    }
  }
  
  if (month !== -1 && day !== -1) {
    // Return Date object set to end of that day (23:59:59)
    return new Date(year, month, day, 23, 59, 59);
  }
  
  // Fallback: try standard Date.parse
  const parsed = Date.parse(dateStr + ", " + year);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }
  
  return null;
}

// Helper to parse nomination end date and set to exactly 12:00 PM (noon)
function parseNominationEndToDate(dateStr) {
  const parsed = parseDateString(dateStr);
  if (!parsed) return null;
  parsed.setHours(12, 0, 0, 0); // 12:00 PM
  return parsed;
}

// Checks if current date/time is after the Nomination End Date (June 29 at 12pm)
function isStandingsUnlocked() {
  const unlockDate = parseNominationEndToDate(state.timelineDates.nominationEnd);
  if (!unlockDate) return true;
  return new Date() >= unlockDate;
}

// Toggle Nomination Success modal
function toggleNominationSuccessModal(show) {
  const modal = document.getElementById('nomination-success-modal');
  if (modal) {
    if (show) {
      modal.classList.add('active');
    } else {
      modal.classList.remove('active');
    }
  }
}

// Open or Close Results modal
function toggleResultsModal(show) {
  const modal = document.getElementById('results-modal');
  
  // Clear any active countdown timer interval
  if (resultsCountdownInterval) {
    clearInterval(resultsCountdownInterval);
    resultsCountdownInterval = null;
  }
  
  if (show) {
    modal.classList.add('active');
    renderResultsDashboard();
  } else {
    modal.classList.remove('active');
  }
}

// Render locked view with countdown
function renderLockedResults(endDateStr) {
  const container = document.getElementById('results-charts-container');
  if (!container) return;
  
  container.innerHTML = `
    <div class="locked-results-container">
      <div class="lock-icon-wrap">
        <svg class="lock-icon" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
      </div>
      <h3>Standings Locked</h3>
      <p class="locked-desc">To keep the competition exciting and fair, the live standings are hidden until nominations close on <strong>${endDateStr} at 12:00 PM</strong>.</p>
      
      <div class="countdown-grid">
        <div class="countdown-item">
          <span class="count-num" id="cd-days">00</span>
          <span class="count-lbl">Days</span>
        </div>
        <div class="countdown-item">
          <span class="count-num" id="cd-hours">00</span>
          <span class="count-lbl">Hours</span>
        </div>
        <div class="countdown-item">
          <span class="count-num" id="cd-minutes">00</span>
          <span class="count-lbl">Mins</span>
        </div>
        <div class="countdown-item">
          <span class="count-num" id="cd-seconds">00</span>
          <span class="count-lbl">Secs</span>
        </div>
      </div>
    </div>
  `;
  
  const endDate = parseNominationEndToDate(endDateStr);
  if (!endDate) return;
  
  function updateTimer() {
    const now = new Date();
    const diff = endDate - now;
    
    if (diff <= 0) {
      clearInterval(resultsCountdownInterval);
      resultsCountdownInterval = null;
      renderResultsDashboard(); // Unlock and display charts
      return;
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    const dEl = document.getElementById('cd-days');
    const hEl = document.getElementById('cd-hours');
    const mEl = document.getElementById('cd-minutes');
    const sEl = document.getElementById('cd-seconds');
    
    if (dEl) dEl.textContent = String(days).padStart(2, '0');
    if (hEl) hEl.textContent = String(hours).padStart(2, '0');
    if (mEl) mEl.textContent = String(minutes).padStart(2, '0');
    if (sEl) sEl.textContent = String(seconds).padStart(2, '0');
  }
  
  updateTimer();
  resultsCountdownInterval = setInterval(updateTimer, 1000);
}

// Render dynamic results graphs (with Admin bypass and lock status check)
function renderResultsDashboard() {
  const container = document.getElementById('results-charts-container');
  container.innerHTML = '';
  
  const isEnded = isStandingsUnlocked();
  const isAdmin = state.isAdminAuthenticated;
  
  // Show lock screen if nominations have not ended yet and user is not an Admin
  if (!isEnded && !isAdmin) {
    renderLockedResults(state.timelineDates.nominationEnd);
    return;
  }
  
  const isVotingActiveOrDone = state.currentStage === 3;
  
  if (isVotingActiveOrDone) {
    // Stage 3: Show 2 Merged Categories (Best Vibe, Rising Star)
    const mergedCategories = [
      { id: 'best-vibe', title: 'Best Vibe (Combined)', desc: 'Best Vibe Male & Female Finalists merged' },
      { id: 'rising-star', title: 'Rising Star (Combined)', desc: 'Rising Star Male & Female Finalists merged' }
    ];
    
    mergedCategories.forEach(combinedCat => {
      const maleCatId = `${combinedCat.id}-male`;
      const femaleCatId = `${combinedCat.id}-female`;
      
      const maleFids = state.finalists[maleCatId] || [];
      const femaleFids = state.finalists[femaleCatId] || [];
      const fids = [...maleFids, ...femaleFids];
      
      // Get nominee objects
      const nominees = state.nominations.filter(nom => fids.includes(nom.id));
      
      // Calculate total category votes
      const totalVotes = nominees.reduce((acc, curr) => acc + (curr.votes || 0), 0);
      
      // Find leader nominee
      let leader = null;
      if (nominees.length > 0) {
        leader = nominees.reduce((max, curr) => (curr.votes || 0) > (max.votes || 0) ? curr : max, nominees[0]);
        if (leader && (leader.votes || 0) === 0) {
          leader = null;
        }
      }
      
      // Sort nominees by votes descending, then alphabetically
      nominees.sort((a, b) => {
        const vA = a.votes || 0;
        const vB = b.votes || 0;
        if (vB !== vA) return vB - vA;
        return a.name.localeCompare(b.name);
      });
      
      // Build HTML card
      const chartCard = document.createElement('div');
      chartCard.className = 'chart-card';
      
      // Admin bypass notice
      const adminNotice = (!isEnded && isAdmin) ? `<span class="badge" style="background: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.25); color: var(--accent-gold); font-size: 0.7rem; margin-top: 0.25rem; display: inline-block;">Admin View (Results Locked to Public)</span>` : '';
      
      chartCard.innerHTML = `
        <div class="chart-header">
          <div>
            <h3>${combinedCat.title}</h3>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem;">${combinedCat.desc}</p>
            ${adminNotice}
          </div>
          <span class="chart-total-votes">${totalVotes.toLocaleString()} votes</span>
        </div>
      `;
      
      const barsList = document.createElement('div');
      barsList.className = 'chart-bars-list';
      
      nominees.forEach(nom => {
        const votes = nom.votes || 0;
        const percent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
        const isLeader = leader && leader.id === nom.id;
        const isMale = nom.category.endsWith('-male');
        
        const barItem = document.createElement('div');
        barItem.className = `chart-bar-item ${isLeader ? 'leader-item' : ''}`;
        barItem.innerHTML = `
          <div class="bar-meta">
            <div class="bar-name-wrap">
              ${isLeader ? `<svg class="leader-icon" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>` : ''}
              <span class="bar-name" title="${escapeHTML(nom.name)} (${escapeHTML(nom.department)})">
                ${escapeHTML(nom.name)} <span style="font-size: 0.75rem; color: var(--text-muted);">(${isMale ? 'M' : 'F'})</span>
              </span>
            </div>
            <div class="bar-votes-wrap">
              <span class="bar-percent">${percent}%</span>
              <span class="bar-count">(${votes})</span>
            </div>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: 0%;"></div>
          </div>
        `;
        
        barsList.appendChild(barItem);
        
        setTimeout(() => {
          const fill = barItem.querySelector('.bar-fill');
          if (fill) fill.style.width = `${percent}%`;
        }, 100);
      });
      
      chartCard.appendChild(barsList);
      container.appendChild(chartCard);
    });
    
  } else {
    // Stage 1 & 2: Show 4 Individual Categories (nomination counts)
    Object.keys(CATEGORIES).forEach(catId => {
      const cat = CATEGORIES[catId];
      const nominees = state.nominations.filter(nom => nom.category === catId);
      
      const totalVotes = nominees.reduce((acc, curr) => acc + (curr.nominationCount || 1), 0);
      
      let leader = null;
      if (nominees.length > 0) {
        leader = nominees.reduce((max, curr) => {
          const currCount = curr.nominationCount || 1;
          const maxCount = max.nominationCount || 1;
          return currCount > maxCount ? curr : max;
        }, nominees[0]);
        if (leader && (leader.nominationCount || 1) === 0) {
          leader = null;
        }
      }
      
      nominees.sort((a, b) => {
        const countA = a.nominationCount || 1;
        const countB = b.nominationCount || 1;
        if (countB !== countA) return countB - countA;
        return a.name.localeCompare(b.name);
      });
      
      const chartCard = document.createElement('div');
      chartCard.className = 'chart-card';
      
      // Admin bypass notice
      const adminNotice = (!isEnded && isAdmin) ? `<span class="badge" style="background: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.25); color: var(--accent-gold); font-size: 0.7rem; margin-top: 0.25rem; display: inline-block;">Admin View (Results Locked to Public)</span>` : '';
      
      chartCard.innerHTML = `
        <div class="chart-header">
          <div>
            <h3>${cat.title}</h3>
            ${adminNotice}
          </div>
          <span class="chart-total-votes">${totalVotes.toLocaleString()} nominations</span>
        </div>
      `;
      
      const barsList = document.createElement('div');
      barsList.className = 'chart-bars-list';
      
      if (nominees.length === 0) {
        barsList.innerHTML = `<div class="empty-state" style="padding: 1.5rem 0;">No submissions yet.</div>`;
      } else {
        nominees.forEach(nom => {
          const votes = nom.nominationCount || 1;
          const percent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
          const isLeader = leader && leader.id === nom.id;
          
          const barItem = document.createElement('div');
          barItem.className = `chart-bar-item ${isLeader ? 'leader-item' : ''}`;
          barItem.innerHTML = `
            <div class="bar-meta">
              <div class="bar-name-wrap">
                ${isLeader ? `<svg class="leader-icon" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>` : ''}
                <span class="bar-name" title="${escapeHTML(nom.name)} (${escapeHTML(nom.department)})">${escapeHTML(nom.name)}</span>
              </div>
              <div class="bar-votes-wrap">
                <span class="bar-percent">${percent}%</span>
                <span class="bar-count">(${votes})</span>
              </div>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width: 0%;"></div>
            </div>
          `;
          
          barsList.appendChild(barItem);
          
          setTimeout(() => {
            const fill = barItem.querySelector('.bar-fill');
            if (fill) fill.style.width = `${percent}%`;
          }, 100);
        });
      }
      
      chartCard.appendChild(barsList);
      container.appendChild(chartCard);
    });
  }
}

/* ==========================================================================
   ADMIN PANEL ACTIONS & PASSWORD SECURITY
   ========================================================================== */

// Open authentication login modal
function openAdminModal() {
  if (state.isAdminAuthenticated) {
    openAdminPanel();
    return;
  }
  
  document.getElementById('admin-auth-error').textContent = '';
  document.getElementById('admin-passcode').value = '';
  document.getElementById('admin-auth-modal').classList.add('active');
  document.getElementById('admin-passcode').focus();
}

// Close authentication login modal
function closeAdminModal() {
  document.getElementById('admin-auth-modal').classList.remove('active');
}

// Handle Form Submission: Auth Login
function handleAdminLogin(event) {
  event.preventDefault();
  const passcodeField = document.getElementById('admin-passcode');
  const errorText = document.getElementById('admin-auth-error');
  
  const passcode = passcodeField.value.trim();
  
  if (passcode === 'dherinosha19@95') {
    state.isAdminAuthenticated = true;
    saveState();
    
    closeAdminModal();
    openAdminPanel();
    renderApp();
    showToast("Authentication successful. Welcome Admin!", "success");
  } else {
    showFormFeedback(errorText, "Incorrect passcode. Please try again.", "error");
    passcodeField.value = '';
    passcodeField.focus();
  }
}

// Open administrative side drawer control panel
function openAdminPanel() {
  // Sync Timeline configuration forms
  document.getElementById('conf-nom-end').value = state.timelineDates.nominationEnd;
  document.getElementById('conf-vote-start').value = state.timelineDates.votingStart;
  document.getElementById('conf-vote-end').value = state.timelineDates.votingEnd;
  document.getElementById('conf-final').value = state.timelineDates.grandFinale;
  
  // Sync Stage transition buttons text and states
  const closeNomsBtn = document.getElementById('admin-close-nominations-btn');
  const openVotingBtn = document.getElementById('admin-open-voting-btn');
  
  if (state.currentStage === 1) {
    closeNomsBtn.removeAttribute('disabled');
    closeNomsBtn.textContent = "Lock Nominations (Stage 2)";
    openVotingBtn.setAttribute('disabled', 'true');
  } else if (state.currentStage === 2) {
    closeNomsBtn.setAttribute('disabled', 'true');
    closeNomsBtn.textContent = "Nominations Closed & Locked";
    
    // Check if ready to vote
    let categoriesReadyCount = 0;
    Object.keys(CATEGORIES).forEach(catId => {
      if ((state.finalists[catId] || []).length === 2) {
        categoriesReadyCount++;
      }
    });
    
    if (categoriesReadyCount === 4) {
      openVotingBtn.removeAttribute('disabled');
    } else {
      openVotingBtn.setAttribute('disabled', 'true');
    }
  } else if (state.currentStage === 3) {
    closeNomsBtn.setAttribute('disabled', 'true');
    closeNomsBtn.textContent = "Nominations Locked";
    openVotingBtn.setAttribute('disabled', 'true');
    openVotingBtn.textContent = "Voting is Live";
  }
  
  document.getElementById('admin-panel-drawer').classList.add('active');
}

// Close administrative side drawer control panel
function closeAdminPanel() {
  document.getElementById('admin-panel-drawer').classList.remove('active');
}

// Lock Nominations (Trigger Stage 2 from panel)
function adminCloseNominations() {
  if (!state.isAdminAuthenticated) return;
  
  if (confirm("Are you sure you want to close public nominations? Students will no longer be able to submit nominees, and you must select exactly 2 finalists per category.")) {
    if (isFirebaseEnabled) {
      db.collection('systemState').doc('global').update({
        currentStage: 2
      }).then(() => {
        closeAdminPanel();
        showToast("Nominations closed! Navigating to finalist selection.", "success");
      }).catch(err => {
        console.error(err);
        showToast("Failed to close nominations in database.", "error");
      });
    } else {
      state.currentStage = 2;
      saveState();
      closeAdminPanel();
      renderApp();
      showToast("Nominations closed! Navigating to finalist selection.", "success");
    }
  }
}

// Open Voting (Trigger Stage 3 from drawer panel)
function adminOpenVotingFromDrawer() {
  closeAdminPanel();
  handleOpenVoting();
}

// Handle timeline date updating
function handleSaveTimeline(event) {
  event.preventDefault();
  if (!state.isAdminAuthenticated) return;
  
  const nominationEnd = document.getElementById('conf-nom-end').value.trim();
  const votingStart = document.getElementById('conf-vote-start').value.trim();
  const votingEnd = document.getElementById('conf-vote-end').value.trim();
  const grandFinale = document.getElementById('conf-final').value.trim();

  if (isFirebaseEnabled) {
    db.collection('systemState').doc('global').update({
      'timelineDates.nominationEnd': nominationEnd,
      'timelineDates.votingStart': votingStart,
      'timelineDates.votingEnd': votingEnd,
      'timelineDates.grandFinale': grandFinale
    }).then(() => {
      showToast("Timeline configuration updated in Firebase.", "success");
    }).catch(err => {
      console.error(err);
      showToast("Failed to update timeline in database.", "error");
    });
  } else {
    state.timelineDates.nominationEnd = nominationEnd;
    state.timelineDates.votingStart = votingStart;
    state.timelineDates.votingEnd = votingEnd;
    state.timelineDates.grandFinale = grandFinale;
    saveState();
    renderTimeline();
    showToast("Timeline configuration updated successfully.", "success");
  }
}

/* ==========================================================================
   UI HELPER FUNCTIONS & FEEDBACK UTILITIES
   ========================================================================== */

// Helper to escape HTML tags to prevent XSS issues
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Show validation feedback messages below forms
function showFormFeedback(element, message, type) {
  element.textContent = message;
  element.className = 'form-feedback';
  if (type === 'error') {
    element.classList.add('error-text');
  } else if (type === 'success') {
    element.classList.add('success-text');
  }
  
  // Clear after 4 seconds
  setTimeout(() => {
    element.textContent = '';
  }, 4000);
}

// Dynamic Floating Toast Alerts
function showToast(message, type = 'info') {
  // Remove existing toasts first
  const existing = document.querySelector('.toast-banner');
  if (existing) {
    existing.remove();
  }
  
  const toast = document.createElement('div');
  toast.className = `toast-banner toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
  `;
  document.body.appendChild(toast);
  
  // Animate slide-in
  setTimeout(() => {
    toast.classList.add('active');
  }, 50);
  
  // Auto dismiss
  setTimeout(() => {
    toast.classList.remove('active');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Include CSS styling for Toast notifications directly within page stylesheet or dynamically
const style = document.createElement('style');
style.textContent = `
  .toast-banner {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: rgba(20, 20, 31, 0.95);
    border: 1px solid var(--border-color);
    padding: 1rem 1.5rem;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    z-index: 2000;
    color: var(--text-primary);
    font-weight: 500;
    transform: translateY(100px);
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    max-width: 320px;
    pointer-events: none;
    font-family: var(--font-body);
    font-size: 0.9rem;
  }
  .toast-banner.active {
    transform: translateY(0);
    opacity: 1;
  }
  .toast-success {
    border-left: 4px solid var(--accent-green);
    box-shadow: 0 4px 20px rgba(16, 185, 129, 0.15);
  }
  .toast-error {
    border-left: 4px solid var(--accent-danger);
    box-shadow: 0 4px 20px rgba(239, 68, 68, 0.15);
  }
`;
document.head.appendChild(style);

// Window listener initialization
window.addEventListener('DOMContentLoaded', initApp);
