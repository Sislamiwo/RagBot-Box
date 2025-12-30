const btn = document.getElementById("chat-btn");
const widget = document.getElementById("chat-widget");
const input = document.getElementById("chat-input");
const messages = document.getElementById("chat-messages");

let currentSessionId = null;

btn.onclick = () => widget.classList.toggle("hidden");

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