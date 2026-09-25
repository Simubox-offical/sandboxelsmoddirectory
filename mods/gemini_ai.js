(function () {
    function startGeminiMod() {
        if (document.getElementById("gemini-ai-container")) return;

        // --- Config & Storage ---
        let chatHistory = [];
        const STORAGE_KEY = "SANDBOXELS_GEMINI_API_KEY";
        const MODEL_NAME = "gemini-3.8-flash";

        // --- Sandbox Canvas Helpers ---
        function safeCreatePixel(elem, x, y) {
            x = Math.round(x);
            y = Math.round(y);
            const w = typeof width !== "undefined" ? width : 150;
            const h = typeof height !== "undefined" ? height : 100;
            if (x < 0 || x >= w || y < 0 || y >= h) return;
            if (typeof createPixel === "function") {
                createPixel(elem, x, y);
            }
        }

        function drawLine(elem, x0, y0, x1, y1) {
            x0 = Math.round(x0); y0 = Math.round(y0);
            x1 = Math.round(x1); y1 = Math.round(y1);
            let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
            let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
            let err = dx + dy, e2;
            while (true) {
                safeCreatePixel(elem, x0, y0);
                if (x0 === x1 && y0 === y1) break;
                e2 = 2 * err;
                if (e2 >= dy) { err += dy; x0 += sx; }
                if (e2 <= dx) { err += dx; y0 += sy; }
            }
        }

        function drawBox(elem, x1, y1, x2, y2, fill = false) {
            let minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
            let minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
            for (let x = minX; x <= maxX; x++) {
                for (let y = minY; y <= maxY; y++) {
                    if (fill || x === minX || x === maxX || y === minY || y === maxY) {
                        safeCreatePixel(elem, x, y);
                    }
                }
            }
        }

        function drawCircle(elem, cx, cy, r, fill = false) {
            cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
            for (let x = cx - r; x <= cx + r; x++) {
                for (let y = cy - r; y <= cy + r; y++) {
                    let dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
                    if (fill ? dist <= r : Math.abs(dist - r) < 0.8) {
                        safeCreatePixel(elem, x, y);
                    }
                }
            }
        }

        function executeActions(actions) {
            if (!Array.isArray(actions)) return;
            actions.forEach(action => {
                try {
                    switch (action.type) {
                        case "clear":
                            if (typeof clearAll === "function") clearAll();
                            break;
                        case "pixel":
                            safeCreatePixel(action.element, action.x, action.y);
                            break;
                        case "line":
                            drawLine(action.element, action.x1, action.y1, action.x2, action.y2);
                            break;
                        case "box":
                            drawBox(action.element, action.x1, action.y1, action.x2, action.y2, action.fill);
                            break;
                        case "circle":
                            drawCircle(action.element, action.x, action.y, action.radius, action.fill);
                            break;
                        case "explode":
                            if (typeof explodeAt === "function") {
                                explodeAt(action.x, action.y, action.radius || 10);
                            }
                            break;
                    }
                } catch (err) {
                    console.error("[Gemini AI] Action error:", action, err);
                }
            });
        }

        // --- Gemini Request ---
        async function sendToGemini(userText) {
            const apiKey = localStorage.getItem(STORAGE_KEY);
            if (!apiKey) {
                appendMessage("system", "Please set your API key by clicking ⚙ first.");
                return;
            }

            const currentW = typeof width !== "undefined" ? width : 120;
            const currentH = typeof height !== "undefined" ? height : 80;

            const systemPrompt = `
You are an AI player inside the game "Sandboxels".
Dimensions: width = ${currentW}, height = ${currentH} (top-left is 0,0).
Common elements: "sand", "water", "fire", "stone", "dirt", "plant", "wood", "lava", "acid", "glass", "gunpowder", "iron", "ice", "steam", "smoke".

Talk directly to the user and choose whether to place elements or alter the world.
You MUST output ONLY a JSON object:
{
  "reply": "Your message to the player",
  "actions": [
    { "type": "pixel", "element": "sand", "x": 50, "y": 20 },
    { "type": "line", "element": "wood", "x1": 10, "y1": 50, "x2": 60, "y2": 50 },
    { "type": "box", "element": "stone", "x1": 20, "y1": 40, "x2": 50, "y2": 70, "fill": false },
    { "type": "circle", "element": "water", "x": 35, "y": 30, "radius": 5, "fill": true },
    { "type": "explode", "x": 30, "y": 30, "radius": 15 },
    { "type": "clear" }
  ]
}
If no action is needed, return "actions": []. Do not include markdown formatting or backticks around the JSON.
`;

            chatHistory.push({ role: "user", parts: [{ text: userText }] });
            appendMessage("user", userText);
            appendMessage("system", "Thinking...");

            try {
                // Using gemini-3.8-flash endpoint
                const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        systemInstruction: { parts: [{ text: systemPrompt }] },
                        contents: chatHistory,
                        generationConfig: { responseMimeType: "application/json" }
                    })
                });

                const data = await res.json();
                removeLastSystemMessage();

                if (data.error) {
                    appendMessage("system", "API Error: " + data.error.message);
                    return;
                }

                const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!raw) {
                    appendMessage("system", "No response received.");
                    return;
                }

                let parsed;
                try {
                    parsed = JSON.parse(raw);
                } catch {
                    parsed = { reply: raw, actions: [] };
                }

                chatHistory.push({ role: "model", parts: [{ text: raw }] });
                appendMessage("ai", parsed.reply || "(Done)");

                if (parsed.actions && parsed.actions.length > 0) {
                    executeActions(parsed.actions);
                }

            } catch (err) {
                removeLastSystemMessage();
                appendMessage("system", "Network Error: " + err.message);
            }
        }

        // --- Inject CSS ---
        const style = document.createElement("style");
        style.textContent = `
            #gemini-toggle-btn {
                position: fixed;
                top: 10px;
                right: 15px;
                z-index: 2147483647;
                background: #5865F2;
                color: #fff;
                border: 1px solid #ffffff44;
                border-radius: 6px;
                padding: 6px 12px;
                font-family: sans-serif;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            }
            #gemini-ai-container {
                position: fixed;
                top: 50px;
                right: 15px;
                width: 330px;
                height: 420px;
                background: #18191c;
                border: 2px solid #5865F2;
                border-radius: 8px;
                display: flex;
                flex-direction: column;
                z-index: 2147483647;
                box-shadow: 0 6px 20px rgba(0,0,0,0.6);
                font-family: sans-serif;
                font-size: 13px;
                color: #fff;
            }
            #gemini-header {
                background: #5865F2;
                padding: 8px 10px;
                font-weight: bold;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
                user-select: none;
            }
            #gemini-chat-log {
                flex: 1;
                padding: 10px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 8px;
                background: #202225;
            }
            .gemini-msg {
                padding: 6px 10px;
                border-radius: 6px;
                max-width: 80%;
                word-wrap: break-word;
            }
            .gemini-msg.user { background: #4752C4; align-self: flex-end; }
            .gemini-msg.ai { background: #2B2D31; align-self: flex-start; border-left: 3px solid #5865F2; }
            .gemini-msg.system { background: #333; font-style: italic; align-self: center; font-size: 11px; }
            #gemini-controls {
                padding: 8px;
                display: flex;
                gap: 6px;
                background: #18191c;
            }
            #gemini-input {
                flex: 1;
                padding: 6px 8px;
                background: #2b2d31;
                border: 1px solid #3f4147;
                color: #fff;
                border-radius: 4px;
                outline: none;
            }
            #gemini-send, #gemini-settings-btn {
                background: #5865F2;
                border: none;
                color: white;
                padding: 6px 10px;
                border-radius: 4px;
                cursor: pointer;
            }
            #gemini-send:hover, #gemini-settings-btn:hover { background: #4752C4; }
        `;
        document.head.appendChild(style);

        // --- Quick Open Toggle Button ---
        const toggleBtn = document.createElement("button");
        toggleBtn.id = "gemini-toggle-btn";
        toggleBtn.textContent = "⚡ Gemini 3.8 Flash";
        document.body.appendChild(toggleBtn);

        // --- Main Chat Container ---
        const container = document.createElement("div");
        container.id = "gemini-ai-container";
        container.innerHTML = `
            <div id="gemini-header">
                <span>⚡ Gemini 3.8 Flash</span>
                <div>
                    <button id="gemini-settings-btn" title="Set API Key">⚙</button>
                    <button id="gemini-close-btn" style="background:none;border:none;color:#fff;cursor:pointer;font-size:14px;margin-left:4px;">✕</button>
                </div>
            </div>
            <div id="gemini-chat-log"></div>
            <div id="gemini-controls">
                <input type="text" id="gemini-input" placeholder="Type a message or build command..." />
                <button id="gemini-send">Send</button>
            </div>
        `;
        document.body.appendChild(container);

        const chatLog = document.getElementById("gemini-chat-log");
        const input = document.getElementById("gemini-input");
        const sendBtn = document.getElementById("gemini-send");
        const settingsBtn = document.getElementById("gemini-settings-btn");
        const closeBtn = document.getElementById("gemini-close-btn");
        const header = document.getElementById("gemini-header");

        function appendMessage(role, text) {
            const msg = document.createElement("div");
            msg.className = `gemini-msg ${role}`;
            msg.textContent = text;
            chatLog.appendChild(msg);
            chatLog.scrollTop = chatLog.scrollHeight;
        }

        function removeLastSystemMessage() {
            const sys = chatLog.querySelectorAll(".gemini-msg.system");
            if (sys.length) sys[sys.length - 1].remove();
        }

        function handleSend() {
            const val = input.value.trim();
            if (!val) return;
            input.value = "";
            sendToGemini(val);
        }

        sendBtn.addEventListener("click", handleSend);
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") handleSend();
        });

        settingsBtn.addEventListener("click", () => {
            const current = localStorage.getItem(STORAGE_KEY) || "";
            const key = prompt("Enter your Google Gemini API Key:", current);
            if (key !== null) {
                localStorage.setItem(STORAGE_KEY, key.trim());
                appendMessage("system", "Gemini API key saved!");
            }
        });

        // --- Toggle / Close Visibility ---
        closeBtn.addEventListener("click", () => {
            container.style.display = "none";
        });

        toggleBtn.addEventListener("click", () => {
            container.style.display = (container.style.display === "none") ? "flex" : "none";
        });

        // --- Dragging Window ---
        let isDragging = false, dragX = 0, dragY = 0;
        header.addEventListener("mousedown", (e) => {
            if (e.target.tagName === "BUTTON") return;
            isDragging = true;
            dragX = e.clientX - container.offsetLeft;
            dragY = e.clientY - container.offsetTop;
        });

        document.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            container.style.left = (e.clientX - dragX) + "px";
            container.style.top = (e.clientY - dragY) + "px";
            container.style.right = "auto";
        });

        document.addEventListener("mouseup", () => { isDragging = false; });

        // Initial Status
        if (!localStorage.getItem(STORAGE_KEY)) {
            appendMessage("system", "Click the ⚙ icon to enter your Gemini API Key.");
        } else {
            appendMessage("system", "Gemini 3.8 Flash ready! Chat or give a command.");
        }
    }

    if (document.body) {
        startGeminiMod();
    } else {
        document.addEventListener("DOMContentLoaded", startGeminiMod);
    }

    if (typeof runAfterLoad === "function") {
        runAfterLoad(startGeminiMod);
    }
})();