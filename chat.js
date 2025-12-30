const btn = document.getElementById("chat-btn");
const widget = document.getElementById("chat-widget");
const input = document.getElementById("chat-input");
const messages = document.getElementById("chat-messages");
const header = document.getElementById("chat-header");

let currentSessionId = null;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

btn.onclick = () => widget.classList.toggle("hidden");

const getClientPosition = (e) => {
  if (e.touches && e.touches.length) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
};

const startDrag = (e) => {
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
  if (!isDragging) return;
  const { x, y } = getClientPosition(e);
  const newLeft = x - dragOffsetX;
  const newTop = y - dragOffsetY;
  widget.style.left = `${newLeft}px`;
  widget.style.top = `${newTop}px`;
  widget.style.right = "auto";
  widget.style.bottom = "auto";
  if (e.cancelable) e.preventDefault(); // prevent scroll on touch drag
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

input.addEventListener("keypress", async (e) => {
  if (e.key !== "Enter") return;

  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  messages.innerHTML += `<div><b>You:</b> ${text}</div>`;

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      message: text,
      sessionId: currentSessionId 
    })
  });

  const data = await res.json();
  console.log("API response:", data);

  if (data.error) {
    messages.innerHTML += `<div><b>SDG Bot:</b> ERROR: ${data.error}</div>`;
    return;
  }

  // Store session ID for conversation continuity
  if (data.sessionId) {
    currentSessionId = data.sessionId;
  }

  messages.innerHTML += `<div><b>SDG Bot:</b> ${data.answer}</div>`;
  messages.scrollTop = messages.scrollHeight;
});
