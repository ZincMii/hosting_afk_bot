const mineflayer = require("mineflayer");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 80;

// ===== ROUTE TRANG CHỦ =====
app.get("/", (req, res) => {
    res.send(htmlTemplate);
});

// ===== HỆ THỐNG LOG MANAGEMENT =====
const LOG_HISTORY_MAX = 2000;
const logHistory = [];
const originalLog = console.log;

function broadcast(msg, type = "info") {
    const entry = { time: new Date().toLocaleTimeString("vi-VN"), msg, type };
    logHistory.push(entry);
    if (logHistory.length > LOG_HISTORY_MAX) logHistory.shift();
    io.emit("log", entry);
}

console.log = (...args) => {
    const msg = args
        .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
        .join(" ");
    originalLog(msg);
    broadcast(msg);
};

console.error = (...args) => {
    const msg = args
        .map((a) =>
            a instanceof Error
                ? a.message
                : typeof a === "object"
                  ? JSON.stringify(a)
                  : String(a),
        )
        .join(" ");
    originalLog("[ERROR]", msg);
    broadcast("❌ Lỗi " + msg, "error");
};

io.on("connection", (socket) => {
    socket.emit("history", logHistory);
});

// ===== CẤU HÌNH & TRẠNG THÁI BOT =====
let isConnected = false;
let isReconnecting = false;
let currentBot = null;
let activeIntervals = [];
let activeTimeouts = [];
let time_Reconnect_Same_User = 0;

function clearAllTimers() {
    activeIntervals.forEach(clearInterval);
    activeTimeouts.forEach(clearTimeout);
    activeIntervals = [];
    activeTimeouts = [];
}

function isDuplicateUsername(reason) {
    const r = String(reason || "").toLowerCase();
    return (
        r.includes("tên này đã có người đang chơi") ||
        r.includes("đã có người") ||
        r.includes("đang chơi") ||
        r.includes("same username") ||
        r.includes("already connected")
    );
}

function scheduleReconnect(reason) {
    if (isReconnecting) return;
    isReconnecting = true;
    time_Reconnect_Same_User += 1;
    const delay = isDuplicateUsername(reason) ? 30000 : 15000;
    console.log(`Lần ${time_Reconnect_Same_User} Bot Sẽ Reconnect lại sau ${delay/1000}s...`);

    let tReconnect = setTimeout(() => {
        isReconnecting = false;
        startBot();
    }, delay);
    activeTimeouts.push(tReconnect);
}

// ===== KHỞI CHẠY BOT MINECRAFT =====
function startBot() {
    if (isConnected || isReconnecting || currentBot) return;

    console.log(" 🔄 Đang kết nối bot...");

    const bot = mineflayer.createBot({
        host: "zincmii.play.hosting",
        username: "Hosting",
        version: "1.21.11", 
    });

    currentBot = bot;
    let authDone = false; // Đã xong phần đăng nhập hoặc đăng ký
    let authSent = false;
    let kickReason = "";

    bot.once("spawn", () => {
        isConnected = true;
        console.log("✅ Bot đã vào server thành công!");
    });

    bot.on("message", (jsonMsg) => {
        const text = jsonMsg.toString();
        const lower = text.toLowerCase();
        console.log("📩", text);

        // --- Logic Tự động Đăng ký (Register) ---
        if (!authDone && !authSent && (lower.includes("/register") || lower.includes("đăng ký"))) {
            authSent = true;
            let tReg = setTimeout(() => {
                if (currentBot === bot) {
                    bot.chat("/register BotAFK123 BotAFK123");
                    console.log("🔑 Đã gửi lệnh đăng ký /register");
                }
            }, 1500);
            activeTimeouts.push(tReg);
        }

        // --- Logic Tự động Đăng nhập (Login) ---
        if (!authDone && !authSent && (lower.includes("/login") || lower.includes("đăng nhập"))) {
            authSent = true;
            let tLogin = setTimeout(() => {
                if (currentBot === bot) {
                    bot.chat("/login BotAFK123");
                    console.log("🔑 Đã gửi lệnh đăng nhập /login");
                    bot.chat("/login BotAFK123");
                    bot.chat("/login BotAFK123");
                }
            }, 5000);
            activeTimeouts.push(tLogin);
        }

        // --- Xác nhận vào game thành công ---
        if (lower.includes("thành công") || lower.includes("successfully") || lower.includes("logged in")) {
            if (!authDone) {
                authDone = true;
                console.log("✅ Xác thực thành công! Bắt đầu chuỗi Anti-AFK...");
                
                let iAntiAfk = setInterval(() => {
                    if (currentBot !== bot) return;

                    const actions = ["jump", "punch", "sneak", "move", "look"];
                    const randomAction = actions[Math.floor(Math.random() * actions.length)];

                    switch (randomAction) {
                        case "jump":
                            bot.setControlState("jump", true);
                            setTimeout(() => bot.setControlState("jump", false), 200);
                            console.log("🦘 Hành động: Nhảy");
                            break;
                        case "punch":
                            bot.swingArm();
                            console.log("🥊 Hành động: Đấm (Punch)");
                            break;
                        case "sneak":
                            bot.setControlState("sneak", true);
                            setTimeout(() => bot.setControlState("sneak", false), 500);
                            console.log("👣 Hành động: Ngồi (Sneak)");
                            break;
                        case "move":
                            const dir = Math.random() > 0.5 ? "forward" : "back";
                            bot.setControlState(dir, true);
                            setTimeout(() => bot.setControlState(dir, false), 300);
                            console.log(`🏃 Hành động: Di chuyển (${dir})`);
                            break;
                        case "look":
                            bot.look(Math.random() * Math.PI * 2, (Math.random() * Math.PI / 2) - Math.PI / 4);
                            console.log("👀 Hành động: Nhìn xung quanh");
                            break;
                    }
                }, 15000);
                activeIntervals.push(iAntiAfk);
            }
        }
    });

    bot.on("kicked", (reason) => {
        kickReason = typeof reason === "object" ? JSON.stringify(reason) : String(reason);
        console.log("🚫 Bot bị Kick:", kickReason);
    });

    bot.on("end", (reason) => {
        isConnected = false;
        currentBot = null;
        clearAllTimers();
        scheduleReconnect(kickReason || reason);
    });

    bot.on("error", (err) => console.error(err));
}

server.listen(PORT, () => {
    originalLog(`🌐 Monitor đang chạy tại cổng: ${PORT}`);
    startBot();
});

// ===== GIAO DIỆN WEB (GIỮ NGUYÊN NHƯ CŨ) =====
const htmlTemplate = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Hosting Status</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #0a0a0f;
            color: #e0e0e0;
            font-family: 'Courier New', monospace;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            overflow-x: hidden;
        }
        body::before {
            content: '';
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background-image:
                linear-gradient(rgba(0,255,150,0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0,255,150,0.03) 1px, transparent 1px);
            background-size: 40px 40px;
            animation: gridMove 20s linear infinite;
            pointer-events: none;
            z-index: 0;
        }
        @keyframes gridMove {
            0% { background-position: 0 0; }
            100% { background-position: 40px 40px; }
        }
        .hero {
            position: relative;
            z-index: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 20px 30px;
            text-align: center;
        }
        .pulse-ring {
            position: relative;
            width: 120px;
            height: 120px;
            margin-bottom: 30px;
        }
        .pulse-ring::before,
        .pulse-ring::after {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: 50%;
            border: 2px solid #00ff96;
            animation: pulseRing 2s ease-out infinite;
        }
        .pulse-ring::after { animation-delay: 1s; }
        @keyframes pulseRing {
            0% { transform: scale(0.8); opacity: 1; }
            100% { transform: scale(1.8); opacity: 0; }
        }
        .pulse-dot {
            position: absolute;
            inset: 30px;
            background: radial-gradient(circle, #00ff96, #00cc77);
            border-radius: 50%;
            animation: pulseDot 2s ease-in-out infinite;
            box-shadow: 0 0 30px #00ff9688;
        }
        @keyframes pulseDot {
            0%, 100% { transform: scale(1); box-shadow: 0 0 30px #00ff9688; }
            50% { transform: scale(1.1); box-shadow: 0 0 50px #00ff96cc; }
        }
        .status-title {
            font-size: clamp(1.8rem, 5vw, 3rem);
            font-weight: 700;
            letter-spacing: 2px;
            background: linear-gradient(90deg, #00ff96, #00ccff, #00ff96);
            background-size: 200% auto;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: shimmer 3s linear infinite;
            text-transform: uppercase;
        }
        @keyframes shimmer {
            0% { background-position: 0% center; }
            100% { background-position: 200% center; }
        }
        .status-sub {
            margin-top: 12px;
            font-size: 0.85rem;
            color: #00ff9688;
            letter-spacing: 4px;
            text-transform: uppercase;
            animation: blink 1.5s step-end infinite;
        }
        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }
        .loading-bar-wrap {
            margin-top: 20px;
            width: 280px;
            height: 4px;
            background: #1a1a2e;
            border-radius: 4px;
            overflow: hidden;
        }
        .loading-bar {
            height: 100%;
            background: linear-gradient(90deg, #00ff96, #00ccff);
            border-radius: 4px;
            animation: loadingSlide 2s ease-in-out infinite;
        }
        @keyframes loadingSlide {
            0% { width: 0%; margin-left: 0%; }
            50% { width: 60%; margin-left: 20%; }
            100% { width: 0%; margin-left: 100%; }
        }
        .stats {
            display: flex;
            gap: 30px;
            margin-top: 30px;
            z-index: 1;
            position: relative;
        }
        .stat-box {
            background: rgba(0,255,150,0.05);
            border: 1px solid rgba(0,255,150,0.15);
            border-radius: 10px;
            padding: 12px 20px;
            text-align: center;
            min-width: 100px;
        }
        .stat-label {
            font-size: 0.65rem;
            color: #00ff9666;
            letter-spacing: 2px;
            text-transform: uppercase;
        }
        .stat-value {
            font-size: 1.1rem;
            color: #00ff96;
            margin-top: 4px;
        }
        .console-wrap {
            position: relative;
            z-index: 1;
            width: 100%;
            max-width: 900px;
            margin: 30px auto 40px;
            padding: 0 20px;
        }
        .console-header {
            display: flex;
            align-items: center;
            gap: 10px;
            background: #111118;
            border: 1px solid rgba(0,255,150,0.2);
            border-bottom: none;
            border-radius: 10px 10px 0 0;
            padding: 10px 16px;
        }
        .console-dot {
            width: 12px; height: 12px;
            border-radius: 50%;
        }
        .console-dot.red { background: #ff5f57; }
        .console-dot.yellow { background: #febc2e; }
        .console-dot.green { background: #28c840; }
        .console-title {
            font-size: 0.75rem;
            color: #888;
            margin-left: 6px;
            letter-spacing: 1px;
        }
        #console {
            background: #0d0d14;
            border: 1px solid rgba(0,255,150,0.2);
            border-radius: 0 0 10px 10px;
            padding: 16px;
            height: 340px;
            overflow-y: auto;
            font-size: 0.82rem;
            line-height: 1.7;
            scrollbar-width: thin;
            scrollbar-color: #00ff9633 transparent;
        }
        #console::-webkit-scrollbar { width: 5px; }
        #console::-webkit-scrollbar-thumb { background: #00ff9644; border-radius: 4px; }
        .log-line {
            display: flex;
            gap: 10px;
            padding: 1px 0;
            animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .log-time {
            color: #444;
            flex-shrink: 0;
            font-size: 0.75rem;
            padding-top: 1px;
        }
        .log-msg { color: #b0ffcc; word-break: break-all; }
        .log-msg.error { color: #ff6b6b; }
        .log-msg .tag-ok { color: #00ff96; }
        .log-msg .tag-chat { color: #00ccff; }
        .log-msg .tag-warn { color: #febc2e; }
    </style>
</head>
<body>
<div class="hero">
    <div class="pulse-ring"><div class="pulse-dot"></div></div>
    <div class="status-title">Hosting Đang Hoạt Động</div>
    <div class="status-sub">● ONLINE ● RUNNING ●</div>
    <div class="loading-bar-wrap"><div class="loading-bar"></div></div>
</div>
<div class="stats">
    <div class="stat-box">
        <div class="stat-label">Uptime</div>
        <div class="stat-value" id="uptime">00:00:00</div>
    </div>
    <div class="stat-box">
        <div class="stat-label">Logs</div>
        <div class="stat-value" id="log-count">0</div>
    </div>
    <div class="stat-box">
        <div class="stat-label">Server</div>
        <div class="stat-value" style="font-size:0.75rem; padding-top:3px;">zincmii</div>
    </div>
</div>
<div class="console-wrap">
    <div class="console-header">
        <div class="console-dot red"></div>
        <div class="console-dot yellow"></div>
        <div class="console-dot green"></div>
        <div class="console-title">CONSOLE OUTPUT</div>
    </div>
    <div id="console"></div>
</div>
<script>
    const socket = io();
    const consoleEl = document.getElementById("console");
    const logCountEl = document.getElementById("log-count");
    const uptimeEl = document.getElementById("uptime");
    let logCount = 0;
    const startTime = Date.now();

    setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const h = String(Math.floor(elapsed / 3600)).padStart(2, "0");
        const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
        const s = String(elapsed % 60).padStart(2, "0");
        uptimeEl.textContent = \`\${h}:\${m}:\${s}\`;
    }, 1000);

    function colorize(msg) {
        return msg
            .replace(/✅/g, '<span class="tag-ok">✅</span>')
            .replace(/📩/g, '<span class="tag-chat">📩</span>')
            .replace(/⚠️/g, '<span class="tag-warn">⚠️</span>')
            .replace(/🔑/g, '<span class="tag-ok">🔑</span>')
            .replace(/🦘/g, '<span class="tag-ok">🦘</span>')
            .replace(/🥊/g, '<span class="tag-ok">🥊</span>')
            .replace(/👀/g, '<span class="tag-ok">👀</span>')
            .replace(/🏃/g, '<span class="tag-ok">🏃</span>')
            .replace(/👣/g, '<span class="tag-ok">👣</span>')
            .replace(/🔄/g, '<span class="tag-warn">🔄</span>');
    }

    function addLine(data, animate) {
        const line = document.createElement("div");
        line.className = "log-line";
        if (animate) line.style.animation = "fadeIn 0.3s ease";
        const time = document.createElement("span");
        time.className = "log-time";
        time.textContent = data.time;
        const msgEl = document.createElement("span");
        msgEl.className = "log-msg" + (data.type === "error" ? " error" : "");
        msgEl.innerHTML = colorize(data.msg);
        line.appendChild(time);
        line.appendChild(msgEl);
        consoleEl.appendChild(line);
    }

    socket.on("history", (history) => {
        consoleEl.innerHTML = "";
        logCount = 0;
        history.forEach(entry => { addLine(entry, false); logCount++; });
        logCountEl.textContent = logCount;
        consoleEl.scrollTop = consoleEl.scrollHeight;
    });

    socket.on("log", (data) => {
        logCount++;
        logCountEl.textContent = logCount;
        addLine(data, true);
        consoleEl.scrollTop = consoleEl.scrollHeight;
    });
</script>
</body>
</html>
`;