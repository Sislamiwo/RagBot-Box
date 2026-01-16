const btn = document.getElementById("chat-btn");
const widget = document.getElementById("chat-widget");
const input = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const messages = document.getElementById("chat-messages");
const header = document.getElementById("chat-header");
const toggleSidebarBtn = document.getElementById("toggle-sidebar-btn");
const conversationList = document.getElementById("conversation-list");
const newChatBtn = document.getElementById("new-chat-btn");
const resizeHandle = document.getElementById("resize-handle");
const STORAGE_KEY = "sdgBotConversations";
const MIN_WIDTH = 320;
const MIN_HEIGHT = 360;

let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let isSending = false;
let sidebarHidden = false;
let isResizing = false;
let resizeStart = null;
let conversations = loadConversations();
let currentConversationId = conversations[0]?.id || null;
btn.onclick = () => widget.classList.toggle("hidden");
const getClientPosition = (e) => {
  if (e.touches && e.touches.length) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
};
const startDrag = (e) => {
  if (isResizing) return;
  const { x, y } = getClientPosition(e);
  const rect = widget.getBoundingClientRect();
  isDragging = true;
  dragOffsetX = x - rect.left;
  dragOffsetY = y - rect.top;
  widget.style.transition = "none";
  document.addEventListener("mousemove", onDrag);
  document.addEventListener("touchmove", onDrag, { passive: false });
  document.addEventListener("mouseup", stopDrag);
  document.addEventListener("touchend", stopDrag);
};
const onDrag = (e) => {
  if (!isDragging || isResizing) return;
  const { x, y } = getClientPosition(e);
  const newLeft = x - dragOffsetX;
  const newTop = y - dragOffsetY;
  widget.style.left = `${newLeft}px`;
  widget.style.top = `${newTop}px`;
  widget.style.right = "auto";
  widget.style.bottom = "auto";
  if (e.cancelable) e.preventDefault();
};
const stopDrag = () => {
  isDragging = false;
  widget.style.transition = "";
  document.removeEventListener("mousemove", onDrag);
  document.removeEventListener("touchmove", onDrag);
  document.removeEventListener("mouseup", stopDrag);
  document.removeEventListener("touchend", stopDrag);
};
header.addEventListener("mousedown", startDrag);
header.addEventListener("touchstart", startDrag, { passive: true });
function updateSidebarState(hidden) {
  sidebarHidden = hidden;
  widget.classList.toggle("sidebar-hidden", hidden);
  if (toggleSidebarBtn) {
    toggleSidebarBtn.textContent = hidden ? "Show history" : "Hide history";
    toggleSidebarBtn.setAttribute("aria-expanded", (!hidden).toString());
  }
}
if (toggleSidebarBtn) {
  toggleSidebarBtn.addEventListener("click", () => updateSidebarState(!sidebarHidden));
  toggleSidebarBtn.addEventListener("mousedown", (e) => e.stopPropagation());
  toggleSidebarBtn.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
}
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}


function startResize(e) {
  const { x, y } = getClientPosition(e);
  const rect = widget.getBoundingClientRect();
  isResizing = true;
  resizeStart = {
    x,
    y,
    width: rect.width,
    height: rect.height
  };
  widget.style.transition = "none";
  document.addEventListener("mousemove", onResize);
  document.addEventListener("touchmove", onResize, { passive: false });
  document.addEventListener("mouseup", stopResize);
  document.addEventListener("touchend", stopResize);
  e.preventDefault();
}
function onResize(e) {
  if (!isResizing) return;
  const {x, y} = getClientPosition(e);
  const dx = x - resizeStart.x;
  const dy = y - resizeStart.y;
  const maxWidth = window.innerWidth * 0.95;
  const maxHeight = window.innerHeight * 0.9;
  //limit to min/max
  const newWidth = clamp(resizeStart.width + dx, MIN_WIDTH, maxWidth);
  const newHeight = clamp(resizeStart.height + dy, MIN_HEIGHT, maxHeight);
  widget.style.width = `${newWidth}px`;
  widget.style.height = `${newHeight}px`;
  if (e.cancelable) e.preventDefault();
}
function stopResize() {
  if (!isResizing) return;
  isResizing = false;
  resizeStart = null;
  widget.style.transition = "";
  document.removeEventListener("mousemove", onResize);
  document.removeEventListener("touchmove", onResize);
  document.removeEventListener("mouseup", stopResize);
  document.removeEventListener("touchend", stopResize);
}
if (resizeHandle) {
  resizeHandle.addEventListener("mousedown", startResize);
  resizeHandle.addEventListener("touchstart", startResize, { passive: false });
}
function loadConversations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeConversation);
  } catch (err) {
    console.warn("Could not load conversations:", err);
    return [];
  }
}
function normalizeConversation(conv) {
  const normalizedMessages = Array.isArray(conv?.messages)
    ? conv.messages.map((m) => ({
        role: m?.role === "bot" ? "bot" : m?.role === "system" ? "system" : "user",
        text: typeof m?.text === "string" ? m.text : "",
        timestamp: m?.timestamp || Date.now()
      }))
    : []; 
  return {
    id: conv?.id || `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: conv?.title || "Conversation",
    sessionId: conv?.sessionId || null,
    updatedAt: conv?.updatedAt || Date.now(),
    messages: normalizedMessages
  };
}
function saveConversations() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch (err) {
    console.warn("Could not save conversations:", err);
  }
}
function getCurrentConversation() {
  return conversations.find((c) => c.id === currentConversationId) || null;
}

function buildTitleFrom(text) {
  const clean = (text || "Conversation").trim();
  const short = clean.length > 42 ? `${clean.slice(0, 42)}...` : clean;
  return short || "Conversation";
}
function createConversation(title, addGreeting = false) {
  const convo = {
    id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: buildTitleFrom(title || "New conversation"),
    sessionId: null,
    updatedAt: Date.now(),
    messages: []
  };
  conversations.unshift(convo);
  currentConversationId = convo.id;
  saveConversations();
  renderConversationList();
  renderMessages(convo);
  return convo;
}

function ensureActiveConversation(firstMessage) {
  let convo = getCurrentConversation();
  if (!convo) {
    convo = createConversation(buildTitleFrom(firstMessage), false);
  } else if (convo.messages.length === 0 && firstMessage) {
    convo.title = buildTitleFrom(firstMessage);
  }
  saveConversations();
  renderConversationList();
  return convo;
}
function formatSnippet(text) {
  if (!text) return "No messages yet";
  const trimmed = text.trim();
  if (trimmed.length <= 40) return trimmed;
  return `${trimmed.slice(0, 40)}...`;
}
function renderConversationList() {
  conversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  conversationList.innerHTML = "";

  conversations.forEach((conv) => {
    const item = document.createElement("div");
    item.className = `convo-item${conv.id === currentConversationId ? " active" : ""}`;
    item.dataset.id = conv.id;
    const mainbutton = document.createElement("button");
    mainbutton.type = "button";
    mainbutton.className = "convo-main";
    mainbutton.dataset.id = conv.id;
    const title = document.createElement("div");
    title.className = "convo-title";
    title.textContent = conv.title;

    const meta = document.createElement("p");
    meta.className = "convo-meta";
    const lastMessage = conv.messages[conv.messages.length - 1];
    const label =
      lastMessage?.role === "bot" ? "SDG Bot" : lastMessage?.role === "system" ? "Note" : "You";
    meta.textContent = lastMessage ? `${label}: ${formatSnippet(lastMessage.text)}` : "No messages yet";
    mainbutton.appendChild(title);
    mainbutton.appendChild(meta);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-convo-btn";
    deleteBtn.dataset.id = conv.id;
    deleteBtn.title = "Delete conversation";
    deleteBtn.setAttribute("aria-label", "Delete conversation");
    deleteBtn.textContent = "✕";

    item.appendChild(mainbutton
    );
    item.appendChild(deleteBtn);
    conversationList.appendChild(item);
  });
}

function renderMessages(conv) {
  messages.innerHTML = "";
 if (!conv || conv.messages.length === 0) {
  const welcome = document.createElement("div");
  welcome.className = "message bot"; // looks like bot, but not stored

  const author = document.createElement("div");
  author.className = "message-author";
  author.textContent = "SDG Bot";

  const body = document.createElement("p");
  body.className = "message-text";
  body.textContent = "Hi! Ask me anything about the Sustainable Development Goals.";

  welcome.appendChild(author);
  welcome.appendChild(body);
  messages.appendChild(welcome);
  return;
}

  conv.messages.forEach((msg) => {
    messages.appendChild(renderMessage(msg));
  });
  messages.scrollTop = messages.scrollHeight;
}

function renderMessage(msg) {
  const row = document.createElement("div");
  row.className = `message ${msg.role}`;

  const author = document.createElement("div");
  author.className = "message-author";
  if (msg.role === "user") author.textContent = "You";
  else if (msg.role === "bot") author.textContent = "SDG Bot";
  else author.textContent = "Note";

  const body = document.createElement("p");
  body.className = "message-text";
  body.textContent = msg.text;

  row.appendChild(author);
  row.appendChild(body);
  return row;
}

function appendMessage(conversationId, role, text) {
  const conv = conversations.find((c) => c.id === conversationId);
  if (!conv) return;
  conv.messages.push({
    role,
    text,
    timestamp: Date.now()
  });
  conv.updatedAt = Date.now();
  saveConversations();
  if (conv.id === currentConversationId) {
    renderMessages(conv);
  }
  renderConversationList();
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text || isSending) return;

  const convo = ensureActiveConversation(text);
  const conversationIdForRequest = convo.id;
  const sessionId = convo.sessionId;

  input.value = "";
  appendMessage(conversationIdForRequest, "user", text);

  isSending = true;
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        sessionId: sessionId || undefined
      })
    });

    const responseText = await res.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = null;
    }

    console.log("API response:", data || responseText);

    if (!res.ok) {
      const errorMsg = data?.error || `Request failed (${res.status})`;
      appendMessage(conversationIdForRequest, "system", `Error: ${errorMsg}`);
      return;
    }

    if (!data) {
      appendMessage(conversationIdForRequest, "system", "Unexpected response from the assistant.");
      return;
    }

    if (data.error) {
      appendMessage(conversationIdForRequest, "system", `Error: ${data.error}`);
      return;
    }

    const targetConversation = conversations.find((c) => c.id === conversationIdForRequest);
    if (!targetConversation) return;

    if (data.sessionId) {
      targetConversation.sessionId = data.sessionId;
    }

    if (data.answer && data.answer.trim() !== "") {
      appendMessage(conversationIdForRequest, "bot", data.answer);
    } else {
      console.log("Received empty answer from server, skipping message append");
    }
  } catch (err) {
    console.error("Chat error:", err);
    appendMessage(conversationIdForRequest, "system", "Could not reach the assistant. Please try again.");
  } finally {
    isSending = false;
  }
}

conversationList.addEventListener("click", (e) => {
  const deleteBtn = e.target.closest(".delete-convo-btn");
  if (deleteBtn?.dataset?.id) {
    e.stopPropagation();
    const id = deleteBtn.dataset.id;
    const conv = conversations.find((c) => c.id === id);
    const title = conv?.title || "this conversation";
    const confirmed = window.confirm(`Delete "${title}"?`);
    if (!confirmed) return;
    deleteConversation(id);
    return;
  }

  const mainBtn = e.target.closest(".convo-main");
  if (mainBtn?.dataset?.id) {
    currentConversationId = mainBtn.dataset.id;
    const conv = getCurrentConversation();
    renderConversationList();
    renderMessages(conv);
    input.focus();
  }
});

newChatBtn.addEventListener("click", () => {
  createConversation("New conversation", false);
  input.focus();
});

sendBtn.addEventListener("click", sendMessage);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMessage();
  }
});

// Initial render
renderConversationList();
if (currentConversationId) {
  renderMessages(getCurrentConversation());
} else {
  renderMessages(null);
}
updateSidebarState(false);

function deleteConversation(id) {
  const index = conversations.findIndex((c) => c.id === id);
  if (index === -1) return;
  conversations.splice(index, 1);

  if (currentConversationId === id) {
    currentConversationId = conversations[0]?.id || null;
  }

  saveConversations();
  renderConversationList();
  const current = getCurrentConversation();
  renderMessages(current);
}
