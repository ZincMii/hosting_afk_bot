const mineflayer = require("mineflayer");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 80;

// ===== HỆ THỐNG TRẠNG THÁI & LOG =====
const LOG_HISTORY_MAX = 2000;
const logHistory = [];
const originalLog = console.log;

let botStatus = {
    connected: false,
    loggedIn: false,
    action: "Nghỉ ngơi",
    details: "Đang chờ kết nối...",
    jumpCount: 0,
    punchCount: 0,
    moveCount: 0,
    sneakCount: 0
};

function broadcastStatus() {
    io.emit("status-update", botStatus);
}

function broadcast(msg, type = "info") {
    const entry = { time: new Date().toLocaleTimeString("vi-VN"), msg, type };
    logHistory.push(entry);
    if (logHistory.length > LOG_HISTORY_MAX) logHistory.shift();
    io.emit("log", entry);
}

console.log = (...args) => {
    const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
    originalLog(msg);
    broadcast(msg);
};

// ===== CẤU HÌNH & TRẠNG THÁI BOT =====
let isReconnecting = false;
let currentBot = null;
let activeIntervals = [];
let activeTimeouts = [];

function clearAllTimers() {
    activeIntervals.forEach(clearInterval);
    activeTimeouts.forEach(clearTimeout);
    activeIntervals = [];
    activeTimeouts = [];
}

function isDuplicateUsername(reason) {
    const r = String(reason || "").toLowerCase();
    return (r.includes("tên này đã có người") || r.includes("đã có người") || r.includes("same username") || r.includes("already connected"));
}

function startBot() {
    if (currentBot || isReconnecting) return;

    console.log("🔄 Đang kết nối bot...");
    botStatus.action = "Đang kết nối";
    broadcastStatus();

    const bot = mineflayer.createBot({
        host: "zincmii.play.hosting",
        username: "Hosting",
        version: "1.21.11", 
    });

    currentBot = bot;
    let loginSent = false;
    let kickReason = "";

    bot.once("spawn", () => {
        botStatus.connected = true;
        botStatus.action = "Đã vào Server";
        console.log("✅ Bot đã spawn thành công!");
        broadcastStatus();
    });

    bot.on("message", (jsonMsg) => {
        const text = jsonMsg.toString();
        const lower = text.toLowerCase();
        if (text.trim()) console.log("📩 " + text);

        if (!botStatus.loggedIn && !loginSent && (lower.includes("/login") || lower.includes("đăng nhập"))) {
            loginSent = true;
            let tLogin = setTimeout(() => {
                if (currentBot === bot) {
                    bot.chat("/login BotAFK123");
                    console.log("🔑 Đã gửi lệnh đăng nhập /login");
                    bot.chat("/login BotAFK123");
                }
            }, 2000);
            activeTimeouts.push(tLogin);
        }

        if (lower.includes("thành công") || lower.includes("successfully")) {
            if (!botStatus.loggedIn) {
                botStatus.loggedIn = true;
                botStatus.action = "Running AFK";
                console.log("✅ Login thành công! Kích hoạt Anti-AFK đa năng.");
                startFullAntiAFK();
            }
        }
    });

    bot.on("kicked", (reason) => {
        kickReason = typeof reason === "object" ? JSON.stringify(reason) : String(reason);
    });

    bot.on("end", (reason) => {
        const finalReason = kickReason || reason;
        console.log("🚫 Kết thúc: " + finalReason);
        
        botStatus.connected = false;
        botStatus.loggedIn = false;
        botStatus.action = "Offline";
        currentBot = null;
        clearAllTimers();
        broadcastStatus();

        if (!isReconnecting) {
            isReconnecting = true;
            const delay = isDuplicateUsername(finalReason) ? 30000 : 15000;
            console.log(`🔄 Reconnect sau ${delay/1000}s...`);
            setTimeout(() => { isReconnecting = false; startBot(); }, delay);
        }
    });

    bot.on("error", (err) => console.log("❌ Lỗi: " + err.message));
}

// ===== ANTI-AFK ĐA NĂNG =====
function startFullAntiAFK() {
    const iAFK = setInterval(() => {
        if (!currentBot) return;
        const actions = ["jump", "punch", "sneak", "move", "look"];
        const rand = actions[Math.floor(Math.random() * actions.length)];

        switch (rand) {
            case "jump":
                currentBot.setControlState("jump", true);
                setTimeout(() => currentBot.setControlState("jump", false), 500);
                botStatus.jumpCount++;
                botStatus.details = `Nhảy (\${botStatus.jumpCount})`;
                break;
            case "punch":
                currentBot.swingArm("right");
                botStatus.punchCount++;
                botStatus.details = `Đánh tay (\${botStatus.punchCount})`;
                break;
            case "sneak":
                currentBot.setControlState("sneak", true);
                setTimeout(() => currentBot.setControlState("sneak", false), 1000);
                botStatus.sneakCount++;
                botStatus.details = `Shift (\${botStatus.sneakCount})`;
                break;
            case "move":
                const dirs = ["forward", "back", "left", "right"];
                const d = dirs[Math.floor(Math.random() * dirs.length)];
                currentBot.setControlState(d, true);
                setTimeout(() => currentBot.setControlState(d, false), 800);
                botStatus.moveCount++;
                botStatus.details = `Đi hướng \${d}`;
                break;
            case "look":
                currentBot.look(Math.random() * Math.PI * 2, 0);
                botStatus.details = "Xoay người";
                break;
        }
        broadcastStatus();
    }, 15000);
    activeIntervals.push(iAFK);
}

// ===== WEB SOCKET & SERVER =====
io.on("connection", (socket) => {
    socket.emit("history", logHistory);
    socket.emit("status-update", botStatus);
    socket.on("send-chat", (msg) => { if (currentBot) currentBot.chat(msg); });
    socket.on("reconnect-bot", () => { if (currentBot) currentBot.quit(); startBot(); });
});

app.get("/", (req, res) => res.send(htmlTemplate));
server.listen(PORT, () => {
    originalLog(`🌐 Monitor chạy tại cổng: \${PORT}`);
    startBot();
});

// ===== GIAO DIỆN WEB (PHONG CÁCH CYBERPUNK) =====
const htmlTemplate = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Hosting Monitor Pro</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #0a0a0f; color: #e0e0e0; font-family: 'Courier New', monospace; min-height: 100vh; display: flex; flex-direction: column; align-items: center; overflow-x: hidden; }
        body::before {
            content: ''; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-image: linear-gradient(rgba(0,255,150,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,150,0.03) 1px, transparent 1px);
            background-size: 40px 40px; animation: gridMove 20s linear infinite; pointer-events: none; z-index: 0;
        }
        @keyframes gridMove { 0% { background-position: 0 0; } 100% { background-position: 40px 40px; } }
        
        .hero { position: relative; z-index: 1; padding: 40px 20px; text-align: center; }
        .pulse-ring { position: relative; width: 100px; height: 100px; margin: 0 auto 20px; }
        .pulse-ring::before { content: ''; position: absolute; inset: 0; border-radius: 50%; border: 2px solid #00ff96; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { transform: scale(0.8); opacity: 1; } 100% { transform: scale(1.6); opacity: 0; } }
        .pulse-dot { position: absolute; inset: 25px; background: #00ff96; border-radius: 50%; box-shadow: 0 0 30px #00ff96; }

        .status-title { font-size: 2rem; color: #00ff96; text-transform: uppercase; letter-spacing: 2px; }
        
        /* TABS */
        .tab-nav { display: flex; gap: 10px; margin: 20px 0; z-index: 2; }
        .tab-btn { background: rgba(0,255,150,0.1); border: 1px solid #00ff9644; color: #00ff96; padding: 10px 20px; cursor: pointer; border-radius: 5px; font-family: inherit; }
        .tab-btn.active { background: #00ff96; color: #000; font-weight: bold; }

        .container { width: 95%; max-width: 900px; z-index: 1; position: relative; }
        .tab-content { display: none; background: rgba(13, 13, 20, 0.9); border: 1px solid #00ff9633; border-radius: 10px; padding: 20px; min-height: 350px; }
        .tab-content.active { display: block; }

        #console { height: 310px; overflow-y: auto; font-size: 0.85rem; scrollbar-width: thin; scrollbar-color: #00ff9633 transparent; }
        .log-line { display: flex; gap: 10px; margin-bottom: 4px; border-left: 2px solid #333; padding-left: 8px; }
        .log-time { color: #555; }
        
        /* DEBUG STYLES */
        .debug-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .stat-card { background: #11111b; border: 1px solid #00ff9622; padding: 15px; border-radius: 8px; }
        .stat-label { color: #00ff9688; font-size: 0.7rem; text-transform: uppercase; }
        .stat-val { font-size: 1.2rem; color: #00ff96; margin-top: 5px; }

        /* CONTROL */
        input { width: 100%; padding: 12px; background: #05050a; border: 1px solid #00ff9644; color: #fff; border-radius: 5px; margin-bottom: 15px; outline: none; }
        .btn-act { width: 100%; padding: 12px; background: #00ff9622; border: 1px solid #00ff96; color: #00ff96; cursor: pointer; border-radius: 5px; margin-bottom: 10px; }
        .btn-act:hover { background: #00ff96; color: #000; }
    </style>
</head>
<body>
    <div class="hero">
        <div class="pulse-ring"><div class="pulse-dot"></div></div>
        <div class="status-title" id="main-status">BOT OFFLINE</div>
    </div>

    <div class="tab-nav">
        <button class="tab-btn active" onclick="openTab('console-tab')">CONSOLE</button>
        <button class="tab-btn" onclick="openTab('debug-tab')">DEBUG</button>
        <button class="tab-btn" onclick="openTab('control-tab')">CONTROL</button>
    </div>

    <div class="container">
        <div id="console-tab" class="tab-content active">
            <div id="console"></div>
        </div>

        <div id="debug-tab" class="tab-content">
            <div class="debug-grid">
                <div class="stat-card"><div class="stat-label">Hành động hiện tại</div><div class="stat-val" id="d-act">-</div></div>
                <div class="stat-card"><div class="stat-label">Chi tiết</div><div class="stat-val" id="d-det">-</div></div>
                <div class="stat-card"><div class="stat-label">Tổng số Jump</div><div class="stat-val" id="d-jump">0</div></div>
                <div class="stat-card"><div class="stat-label">Tổng số Punch</div><div class="stat-val" id="d-punch">0</div></div>
                <div class="stat-card"><div class="stat-label">Tổng số Shift</div><div class="stat-val" id="d-sneak">0</div></div>
                <div class="stat-card"><div class="stat-label">Tổng số Move</div><div class="stat-val" id="d-move">0</div></div>
            </div>
        </div>

        <div id="control-tab" class="tab-content">
            <input type="text" id="chatMsg" placeholder="Nhập tin nhắn vào game...">
            <button class="btn-act" onclick="sendChat()">GỬI TIN NHẮN</button>
            <button class="btn-act" style="border-color:#ff5f57; color:#ff5f57" onclick="socket.emit('reconnect-bot')">RECONNECT BOT</button>
        </div>
    </div>

    <script>
        const socket = io();
        const consoleEl = document.getElementById("console");

        function openTab(id) {
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            event.currentTarget.classList.add('active');
        }

        function sendChat() {
            const m = document.getElementById("chatMsg").value;
            if(m) { socket.emit("send-chat", m); document.getElementById("chatMsg").value = ""; }
        }

        socket.on("log", (data) => {
            const line = document.createElement("div");
            line.className = "log-line";
            line.innerHTML = \`<span class="log-time">[\${data.time}]</span><span>\${data.msg}</span>\`;
            consoleEl.appendChild(line);
            consoleEl.scrollTop = consoleEl.scrollHeight;
        });

        socket.on("status-update", (s) => {
            document.getElementById("main-status").textContent = s.connected ? (s.loggedIn ? "BOT AFK RUNNING" : "BOT LOGIN...") : "BOT OFFLINE";
            document.getElementById("d-act").textContent = s.action;
            document.getElementById("d-det").textContent = s.details;
            document.getElementById("d-jump").textContent = s.jumpCount;
            document.getElementById("d-punch").textContent = s.punchCount;
            document.getElementById("d-sneak").textContent = s.sneakCount;
            document.getElementById("d-move").textContent = s.moveCount;
        });

        socket.on("history", (h) => {
            consoleEl.innerHTML = "";
            h.forEach(d => {
                const line = document.createElement("div");
                line.className = "log-line";
                line.innerHTML = \`<span class="log-time">[\${d.time}]</span><span>\${d.msg}</span>\`;
                consoleEl.appendChild(line);
            });
            consoleEl.scrollTop = consoleEl.scrollHeight;
        });
    </script>
</body>
</html>
`;