import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

/* ------------------------------
   GEMINI SETUP
------------------------------ */
const genAI = new GoogleGenerativeAI("AIzaSyB5rVxiyWUC65w-K_1Jaxfi3XOoij8qgbw");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
window.geminiModel = model;

/* ------------------------------
   GLOBAL STATE
------------------------------ */
let db;
let currentUser = null;

const DB_NAME = "pecoLensDB";
const DB_VERSION = 2;

/* ------------------------------
   INDEXEDDB SETUP
------------------------------ */
const request = indexedDB.open(DB_NAME, DB_VERSION);

request.onupgradeneeded = function (event) {
  db = event.target.result;

  if (!db.objectStoreNames.contains("profiles")) {
    db.createObjectStore("profiles", { keyPath: "id", autoIncrement: true });
  }

  if (!db.objectStoreNames.contains("history")) {
    db.createObjectStore("history", { keyPath: "id", autoIncrement: true });
  }

  if (!db.objectStoreNames.contains("users")) {
    const userStore = db.createObjectStore("users", { keyPath: "id", autoIncrement: true });
    userStore.createIndex("username", "username", { unique: true });
  }
};

request.onsuccess = function (event) {
  db = event.target.result;
  ensureDefaultAdmin();
  loadProfiles();
  loadHistory();
};

request.onerror = function () {
  console.error("IndexedDB failed to open");
};

/* ------------------------------
   DEFAULT ADMIN (BRETT)
------------------------------ */
function ensureDefaultAdmin() {
  const tx = db.transaction("users", "readwrite");
  const store = tx.objectStore("users");
  const index = store.index("username");
  const req = index.get("brett");

  req.onsuccess = function () {
    if (!req.result) {
      const adminUser = {
        username: "brett",
        passcode: "1214",
        isAdmin: true,
        permissions: {
          lens: true,
          tools: true,
          maintenance: true,
          messaging: true,
          settings: true
        }
      };
      store.add(adminUser);
    }
  };
}

/* ------------------------------
   SIMPLE LAYER NAVIGATION
------------------------------ */
window.openLayer = function (id) {
  document.querySelectorAll('.layer').forEach(layer => {
    layer.classList.remove('active');
  });
  const target = document.getElementById(id);
  if (target) target.classList.add('active');

  if (id === "mainMenu") {
    applyPermissionsToUI();
  }
  if (id === "settingsLayer") {
    updateCurrentUserBox();
  }
  if (id === "manageUsersLayer") {
    loadUsersList();
  }
};

window.showInfo = function (id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('hidden');
};

/* ------------------------------
   LOGIN / LOGOUT
------------------------------ */
window.login = function () {
  const username = document.getElementById("loginUsername").value.trim();
  const passcode = document.getElementById("loginPasscode").value.trim();
  const errorBox = document.getElementById("loginError");

  if (!username || !passcode) {
    errorBox.textContent = "Enter username and passcode.";
    errorBox.classList.remove("hidden");
    return;
  }

  const tx = db.transaction("users", "readonly");
  const store = tx.objectStore("users");
  const index = store.index("username");
  const req = index.get(username);

  req.onsuccess = function () {
    const user = req.result;
    if (!user || user.passcode !== passcode) {
      errorBox.textContent = "Invalid username or passcode.";
      errorBox.classList.remove("hidden");
      return;
    }

    currentUser = user;
    errorBox.classList.add("hidden");
    document.getElementById("loginUsername").value = "";
    document.getElementById("loginPasscode").value = "";

    openLayer("mainMenu");
  };

  req.onerror = function () {
    errorBox.textContent = "Login error.";
    errorBox.classList.remove("hidden");
  };
};

window.logout = function () {
  currentUser = null;
  openLayer("loginLayer");
};

/* ------------------------------
   PERMISSIONS UI
------------------------------ */
function applyPermissionsToUI() {
  if (!currentUser) return;

  const p = currentUser.permissions || {};
  setButtonVisibility("btnLens", p.lens);
  setButtonVisibility("btnTools", p.tools);
  setButtonVisibility("btnMaintenance", p.maintenance);
  setButtonVisibility("btnMessaging", p.messaging);
  setButtonVisibility("btnSettings", p.settings);

  const manageUsersButton = document.querySelector("#settingsLayer .menu-button[onclick*='manageUsersLayer']");
  if (manageUsersButton) {
    manageUsersButton.style.display = currentUser.isAdmin ? "block" : "none";
  }
}

function setButtonVisibility(id, allowed) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.style.display = allowed ? "block" : "none";
}

function updateCurrentUserBox() {
  const box = document.getElementById("currentUserBox");
  if (!box) return;
  if (!currentUser) {
    box.textContent = "Not logged in.";
    return;
  }
  const p = currentUser.permissions || {};
  box.textContent =
    `User: ${currentUser.username}\n` +
    `Role: ${currentUser.isAdmin ? "Admin" : "User"}\n` +
    `Access:\n` +
    `- Lens: ${p.lens ? "Yes" : "No"}\n` +
    `- Tools: ${p.tools ? "Yes" : "No"}\n` +
    `- Maintenance: ${p.maintenance ? "Yes" : "No"}\n` +
    `- Messaging: ${p.messaging ? "Yes" : "No"}\n` +
    `- Settings: ${p.settings ? "Yes" : "No"}`;
}

/* ------------------------------
   MANAGE USERS
------------------------------ */
window.addUser = function () {
  if (!currentUser || !currentUser.isAdmin) {
    alert("Only admin can add users.");
    return;
  }

  const username = document.getElementById("newUserName").value.trim();
  const passcode = document.getElementById("newUserPasscode").value.trim();

  if (!username || !passcode) {
    alert("Enter username and passcode.");
    return;
  }

  const permissions = {
    lens: document.getElementById("permLens").checked,
    tools: document.getElementById("permTools").checked,
    maintenance: document.getElementById("permMaintenance").checked,
    messaging: document.getElementById("permMessaging").checked,
    settings: document.getElementById("permSettings").checked
  };

  const tx = db.transaction("users", "readwrite");
  const store = tx.objectStore("users");
  const index = store.index("username");
  const req = index.get(username);

  req.onsuccess = function () {
    if (req.result) {
      alert("Username already exists.");
      return;
    }

    const newUser = {
      username,
      passcode,
      isAdmin: false,
      permissions
    };

    store.add(newUser).onsuccess = function () {
      document.getElementById("newUserName").value = "";
      document.getElementById("newUserPasscode").value = "";
      loadUsersList();
    };
  };
};

function loadUsersList() {
  const list = document.getElementById("usersList");
  if (!list) return;
  list.innerHTML = "";

  const tx = db.transaction("users", "readonly");
  const store = tx.objectStore("users");

  store.openCursor().onsuccess = function (event) {
    const cursor = event.target.result;
    if (cursor) {
      const user = cursor.value;
      const div = document.createElement("div");
      div.className = "user-item";

      const p = user.permissions || {};
      const permsText =
        `Lens: ${p.lens ? "Y" : "N"}, ` +
        `Tools: ${p.tools ? "Y" : "N"}, ` +
        `Maint: ${p.maintenance ? "Y" : "N"}, ` +
        `Msg: ${p.messaging ? "Y" : "N"}, ` +
        `Settings: ${p.settings ? "Y" : "N"}`;

      div.innerHTML = `
        <div class="user-item-header">
          <div><strong>${user.username}</strong> ${user.isAdmin ? "(Admin)" : ""}</div>
        </div>
        <div class="user-perms">${permsText}</div>
        <div class="user-actions">
          <button onclick="editUserPermissions(${user.id})">Edit</button>
          <button onclick="deleteUser(${user.id})">Delete</button>
        </div>
      `;
      list.appendChild(div);
      cursor.continue();
    }
  };
}

window.editUserPermissions = function (id) {
  if (!currentUser || !currentUser.isAdmin) {
    alert("Only admin can edit users.");
    return;
  }

  const tx = db.transaction("users", "readwrite");
  const store = tx.objectStore("users");
  const req = store.get(id);

  req.onsuccess = function () {
    const user = req.result;
    if (!user) return;

    const lens = confirm(`Allow Lens for ${user.username}? (OK = Yes, Cancel = No)`);
    const tools = confirm(`Allow Tools for ${user.username}?`);
    const maintenance = confirm(`Allow Maintenance for ${user.username}?`);
    const messaging = confirm(`Allow Messaging for ${user.username}?`);
    const settings = confirm(`Allow Settings for ${user.username}?`);

    user.permissions = { lens, tools, maintenance, messaging, settings };
    store.put(user).onsuccess = function () {
      if (currentUser && currentUser.id === user.id) {
        currentUser = user;
        applyPermissionsToUI();
      }
      loadUsersList();
    };
  };
};

window.deleteUser = function (id) {
  if (!currentUser || !currentUser.isAdmin) {
    alert("Only admin can delete users.");
    return;
  }

  const txCount = db.transaction("users", "readonly");
  const storeCount = txCount.objectStore("users");
  const countReq = storeCount.count();

  countReq.onsuccess = function () {
    if (countReq.result <= 1) {
      alert("Cannot delete the last user.");
      return;
    }

    const tx = db.transaction("users", "readwrite");
    const store = tx.objectStore("users");
    const getReq = store.get(id);

    getReq.onsuccess = function () {
      const user = getReq.result;
      if (!user) return;

      if (user.username === "brett") {
        alert("Cannot delete default admin.");
        return;
      }

      if (!confirm(`Delete user ${user.username}?`)) return;

      store.delete(id).onsuccess = function () {
        if (currentUser && currentUser.id === id) {
          currentUser = null;
          openLayer("loginLayer");
        }
        loadUsersList();
      };
    };
  };
};

/* ------------------------------
   LENS LIVE CAMERA + OVERLAY
------------------------------ */
let lensVideo = null;
let lensOverlayCanvas = null;
let lensOverlayCtx = null;
let lensCaptureCanvas = null;
let lensStream = null;

window.addEventListener("load", () => {
  lensVideo = document.getElementById("lensVideo");
  lensOverlayCanvas = document.getElementById("lensOverlayCanvas");
  lensCaptureCanvas = document.getElementById("lensCaptureCanvas");
  if (lensOverlayCanvas) {
    lensOverlayCtx = lensOverlayCanvas.getContext("2d");
  }
});

window.startLensCamera = async function () {
  try {
    lensStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    lensVideo.srcObject = lensStream;

    lensVideo.onloadedmetadata = () => {
      lensVideo.play();
      lensOverlayCanvas.width = lensVideo.clientWidth;
      lensOverlayCanvas.height = lensVideo.clientHeight;
      lensCaptureCanvas.width = lensVideo.videoWidth;
      lensCaptureCanvas.height = lensVideo.videoHeight;
      clearLensOverlay();
    };
  } catch (err) {
    console.error("Camera error:", err);
    alert("Unable to access camera.");
  }
};

function clearLensOverlay() {
  if (!lensOverlayCtx || !lensOverlayCanvas) return;
  lensOverlayCtx.clearRect(0, 0, lensOverlayCanvas.width, lensOverlayCanvas.height);
}

function drawExampleOverlay() {
  if (!lensOverlayCtx || !lensOverlayCanvas) return;
  const toggle = document.getElementById("overlayToggle");
  if (toggle && !toggle.checked) {
    clearLensOverlay();
    return;
  }

  clearLensOverlay();
  lensOverlayCtx.strokeStyle = "#ffcc00";
  lensOverlayCtx.lineWidth = 3;
  lensOverlayCtx.strokeRect(
    lensOverlayCanvas.width * 0.2,
    lensOverlayCanvas.height * 0.2,
    lensOverlayCanvas.width * 0.6,
    lensOverlayCanvas.height * 0.4
  );

  lensOverlayCtx.fillStyle = "rgba(0,0,0,0.7)";
  lensOverlayCtx.fillRect(
    lensOverlayCanvas.width * 0.2,
    lensOverlayCanvas.height * 0.2 - 24,
    120,
    20
  );

  lensOverlayCtx.fillStyle = "#ffcc00";
  lensOverlayCtx.font = "12px Arial";
  lensOverlayCtx.fillText("Focus area", lensOverlayCanvas.width * 0.2 + 6, lensOverlayCanvas.height * 0.2 - 10);
}

window.runLens = async function () {
  if (!lensVideo || !lensCaptureCanvas) return;

  const outputBox = document.getElementById("lensOutput");
  outputBox.textContent = "Analyzing current frame...";

  const ctx = lensCaptureCanvas.getContext("2d");
  ctx.drawImage(lensVideo, 0, 0, lensCaptureCanvas.width, lensCaptureCanvas.height);

  const dataUrl = lensCaptureCanvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];

  try {
    const result = await window.geminiModel.generateContent([
      {
        inlineData: {
          data: base64,
          mimeType: "image/png"
        }
      },
      "Analyze this industrial component from the live camera frame. Identify issues, wear, damage, or incorrect assembly. Respond with clear technician-facing guidance."
    ]);

    const text = result.response.text();
    outputBox.textContent = text;

    drawExampleOverlay();
    saveHistory("Live Image Analysis", text);

  } catch (err) {
    outputBox.textContent = "Error analyzing frame.";
    console.error(err);
  }
};

/* ------------------------------
   MACHINE PROFILES
------------------------------ */
window.createProfile = function () {
  const name = prompt("Machine name");
  if (!name) return;

  const profile = {
    name,
    created: new Date().toLocaleString()
  };

  const tx = db.transaction("profiles", "readwrite");
  tx.objectStore("profiles").add(profile);
  tx.oncomplete = loadProfiles;
};

function loadProfiles() {
  const list = document.getElementById("profileList");
  if (!list) return;
  list.innerHTML = "";

  const tx = db.transaction("profiles", "readonly");
  const store = tx.objectStore("profiles");

  store.openCursor().onsuccess = function (event) {
    const cursor = event.target.result;
    if (cursor) {
      const item = cursor.value;
      const div = document.createElement("div");
      div.className = "profile-item";
      div.innerHTML = `
        <div class="profile-title">${item.name}</div>
        <div class="profile-sub">Created: ${item.created}</div>
      `;
      list.appendChild(div);
      cursor.continue();
    }
  };
}

/* ------------------------------
   DIAGNOSTICS HISTORY
------------------------------ */
function saveHistory(input, output) {
  if (!db) return;
  const entry = {
    input,
    output,
    timestamp: new Date().toLocaleString()
  };

  const tx = db.transaction("history", "readwrite");
  tx.objectStore("history").add(entry);
  tx.oncomplete = loadHistory;
}

function loadHistory() {
  const list = document.getElementById("historyList");
  if (!list) return;
  list.innerHTML = "";

  const tx = db.transaction("history", "readonly");
  const store = tx.objectStore("history");

  store.openCursor().onsuccess = function (event) {
    const cursor = event.target.result;
    if (cursor) {
      const item = cursor.value;
      const div = document.createElement("div");
      div.className = "history-item";
      div.innerHTML = `
        <strong>${item.timestamp}</strong><br>
        <em>Input:</em> ${item.input}<br>
        <em>Output:</em> ${item.output}
      `;
      list.appendChild(div);
      cursor.continue();
    }
  };
}

/* ------------------------------
   GEMINI TEXT DIAGNOSTICS
------------------------------ */
window.runDiagnostics = async function () {
  const input = document.getElementById("diagInput").value.trim();
  if (!input) return;

  const outputBox = document.getElementById("diagOutput");
  outputBox.textContent = "Running diagnostics...";

  try {
    const result = await window.geminiModel.generateContent(
      `You are an industrial diagnostics assistant. Analyze this issue and provide steps, causes, and checks:\n\n${input}`
    );

    const text = result.response.text();
    outputBox.textContent = text;

    saveHistory(input, text);

  } catch (err) {
    outputBox.textContent = "Error running diagnostics.";
    console.error(err);
  }
};

/* ------------------------------
   MESSAGING (TEXT CHAT)
------------------------------ */
window.sendMessage = async function () {
  const input = document.getElementById("msgInput").value.trim();
  if (!input) return;

  const outputBox = document.getElementById("msgOutput");
  outputBox.textContent = "Thinking...";

  try {
    const result = await window.geminiModel.generateContent(
      `You are a technician support assistant. Respond clearly and concisely:\n\n${input}`
    );

    const text = result.response.text();
    outputBox.textContent = text;

  } catch (err) {
    outputBox.textContent = "Error sending message.";
    console.error(err);
  }
};
