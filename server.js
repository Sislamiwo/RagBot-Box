 // server.js
import express from "express";

const app = express();
app.use(express.json());
app.use(express.static(".")); // for index.html/style.css/chat.js

const RAGFLOW_URL = "http://172.19.99.179"; 
const RAGFLOW_API_KEY = "ragflow-c2NmExMTQ2ZTRhYTExZjA4YjY1NmE3Yj";
const CHAT_ID = "a21d6560e17411f080db6a7b02b527a0";
const LIVE_CONTEXT_URL = process.env.LIVE_CONTEXT_URL || "https://icesco.org/en/";
const LIVE_FETCH_TIMEOUT_MS = Number(process.env.LIVE_FETCH_TIMEOUT_MS || 4000);

function sanitizeAnswer(text) {
  if (!text || typeof text !== "string") return "";
  const withoutArtifacts = text.replace(/##\d+\$\$/g, ""); // remove RAGFlow citation markers
  return withoutArtifacts
    .replace(/[ \t]{2,}/g, " ") // remove any double spaces
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}
//purpose: shorten responses to maximum 2 sentences.
function makeFriendlyAnswer(text) {
  const cleaned = sanitizeAnswer(text);
  if (!cleaned) return "";

// shorten sentences and limit them to 2 phrases max 
  const sentences = cleaned.match(/[^.!?]+[.!?]?/g) || [cleaned];
  let short = sentences.slice(0, 2).join(" ").trim();
  if (short.length > 400) {
    short = short.slice(0, 397).replace(/\s+\S*$/, "").trim() + "...";
  }

  const alreadyGreets = /^\s*(hi|hello|hey|wassup)\b/i.test(short);
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

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "RagBot-LiveFetcher/1.0" }
    });
    if (!res.ok) {
      console.warn(`Live fetch failed for ${url}: ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.warn(`Live fetch error for ${url}:`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ") // drop scripts
    .replace(/<style[\s\S]*?<\/style>/gi, " ") // drop styles
    .replace(/<[^>]+>/g, " ") // strip tags
    .replace(/\s+/g, " ")
    .trim();
}

function chunkText(text, maxChunkLength = 600, maxChunks = 3) {
  if (!text) return "";
  const words = text.split(/\s+/);
  const chunks = [];
  let current = "";

  for (const word of words) {
    if ((current + " " + word).trim().length > maxChunkLength) {
      if (current) chunks.push(current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
    if (chunks.length >= maxChunks) break;
  }
  if (chunks.length < maxChunks && current) {
    chunks.push(current.trim());
  }
  return chunks.slice(0, maxChunks).join("\n\n");
}

async function buildLiveContext() {
  const url = LIVE_CONTEXT_URL;
  if (!url) return null;

  const html = await fetchWithTimeout(url, LIVE_FETCH_TIMEOUT_MS);
  if (!html) return null;
  const text = stripHtml(html);
  if (!text) return null;
  const chunked = chunkText(text);
  if (!chunked) return null;
  return `Source: ${url}\n${chunked}`;
}

app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing 'message' (string)." });
    }

    // Pull live data if configured and prepend it to the user's question
    const liveContext = await buildLiveContext();
    const questionWithLiveContext = liveContext
      ? `${message}\n\nLive context:\n${liveContext}`
      : message;

    // Build payload - DON'T send session_id on first message
    const payload = {
      question: questionWithLiveContext,
      stream: false
    };
  
    // only add session_id if we have one from previous response
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
