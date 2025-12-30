 // server.js
import express from "express";

const app = express();
app.use(express.json());
app.use(express.static(".")); // for index.html/style.css/chat.js

const RAGFLOW_URL = "http://172.19.99.179"; 
const RAGFLOW_API_KEY = "ragflow-c2NmExMTQ2ZTRhYTExZjA4YjY1NmE3Yj";
const CHAT_ID = "a21d6560e17411f080db6a7b02b527a0";

function sanitizeAnswer(text) {
  if (!text || typeof text !== "string") return "";
  const withoutArtifacts = text.replace(/##\d+\$\$/g, ""); // strip RAGFlow citation markers
  return withoutArtifacts
    .replace(/[ \t]{2,}/g, " ") // collapse runaway spaces without smashing newlines
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function makeFriendlyAnswer(text) {
  const cleaned = sanitizeAnswer(text);
  if (!cleaned) return "";

  // Keep only the first couple of sentences to avoid overly long replies
  const sentences = cleaned.match(/[^.!?]+[.!?]?/g) || [cleaned];
  let short = sentences.slice(0, 2).join(" ").trim();
  if (short.length > 400) {
    short = short.slice(0, 397).replace(/\s+\S*$/, "").trim() + "...";
  }

  const alreadyGreets = /^\s*(hi|hello|hey)\b/i.test(short);
  const greeting = alreadyGreets ? "" : "Hi there! ";

  return `${greeting}${short}`;
}

function parseSsePayload(sseString) {
  const lines = sseString.split('\n').filter(line => line.trim());
  let latestAnswer = null;
  let sessionId = null;
  let reference = null;
  for (const line of lines) {
    if (!line.startsWith('data:')) continue;
    const payload = line.substring(5).trim();
    if (payload === "[DONE]") continue;

    try {
      const parsed = JSON.parse(payload);
      if (parsed?.data?.answer) {
        latestAnswer = sanitizeAnswer(parsed.data.answer);
      }
      if (parsed?.data?.session_id) {
        sessionId = parsed.data.session_id;
      }
      if (parsed?.data?.reference) {
        reference = parsed.data.reference;
      }
    } catch (e) {
      console.error("Failed to parse SSE line:", line, e);
    }
  }

  if (latestAnswer) {
    return { answer: latestAnswer, session_id: sessionId, reference };
  }
  return null;
}

function extractAnswer(ragflowResponse) {
  // Case 1:Response is an object with data.data (SSE wrapped in JSON)
  if (ragflowResponse?.data && typeof ragflowResponse.data === 'string') {
    const parsed = parseSsePayload(ragflowResponse.data);
    if (parsed) return parsed;
  }
  
  // Case 2:Response is a string (raw SSE format)
  if (typeof ragflowResponse === 'string') {
    const parsed = parseSsePayload(ragflowResponse);
    if (parsed) return parsed;
  }
  
  // Case 3: Normal JSON response (direct answer)
  if (typeof ragflowResponse === 'object') {
    const rawAnswer =
      ragflowResponse?.data?.answer ||
      ragflowResponse?.answer ||
      ragflowResponse?.data?.content ||
      ragflowResponse?.content ||
      ragflowResponse?.message ||
      "";
      
    return {
      answer: rawAnswer ? sanitizeAnswer(rawAnswer) : "",
      session_id: ragflowResponse?.data?.session_id || ragflowResponse?.session_id,
      reference: ragflowResponse?.data?.reference || ragflowResponse?.reference
    };
  }
  
  return { answer: "", session_id: null, reference: null };
}

app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing 'message' (string)." });
    }

    // Build payload - DON'T send session_id on first message
    const payload = {
      question: message,
      stream: false
    };

    // Only add session_id if we have one from previous response
    if (sessionId) {
      payload.session_id = sessionId;
    }

    console.log("Sending to RAGFlow:", payload);

    const r = await fetch(`${RAGFLOW_URL}/api/v1/chats/${CHAT_ID}/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RAGFLOW_API_KEY}`
      },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    console.log("RAGFlow raw response:", text);

    if (!r.ok) {
      return res.status(502).json({ error: "RAGFlow error", details: text });
    }

    // Parse the response
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // If parsing fails, treat as raw streaming format
      data = text;
    }

    const result = extractAnswer(data);

    if (!result.answer) {
      console.error("No answer extracted from response");
      console.error("Parsed data:", JSON.stringify(data, null, 2));
      return res.json({ 
        answer: "Sorry, I couldn't generate a response. Please try again.", 
        raw: data 
      });
    }

    const friendlyAnswer = makeFriendlyAnswer(result.answer);

    // Return the session_id directly from RAGFlow's response
    return res.json({ 
      answer: friendlyAnswer,
      sessionId: result.session_id,  // Send RAGFlow's session_id directly to frontend
      reference: result.reference
    });

  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

app.listen(3000, () => console.log("Open http://localhost:3000"));