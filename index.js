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
const LOG_HISTORY_MAX = 200;
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
    broadcast("❌ " + msg, "error");
};

io.on("connection", (socket) => {
    socket.emit("history", logHistory);
});

// ===== CẤU HÌNH & TRẠNG THÁI BOT =====
let isConnected = false;
let isReconnecting = false;
let currentBot = null;

// Quản lý dọn dẹp các luồng chạy ngầm của bot cũ
let activeIntervals = [];
let activeTimeouts = [];

function isDuplicateUsername(reason) {
    const r = String(reason || "").toLowerCase();
    return (
        r.includes("đã có người") ||
        r.includes("đang chơi") ||
        r.includes("same username") ||
        r.includes("already connected") ||
        r.includes("already logged") ||
        r.includes("duplicate_login")
    );
}

function scheduleReconnect(reason) {
    if (isReconnecting) return;
    isReconnecting = true;

    // Trường hợp 1: Phát hiện trùng tên (acc đang online) -> Chờ 30 giây
    if (isDuplicateUsername(reason)) {
        console.log(`🛑 Phát hiện acc trùng đang online -> Đợi 30s sau đăng nhập lại...`);
        let tReconnect = setTimeout(() => {
            isReconnecting = false;
            startBot();
        }, 30000); // 30000ms = 30 giây
        activeTimeouts.push(tReconnect);
        return;
    }

    // Trường hợp 2: Bị kick hoặc mất kết nối thông thường -> Chờ 15 giây
    console.log(`⚠️ Mất kết nối/Bị Kick: ${reason || "Không rõ lý do"} → Reconnect lại sau 15s...`);
    let tReconnect = setTimeout(() => {
        isReconnecting = false;
        startBot();
    }, 15000); // 15000ms = 15 giây
    activeTimeouts.push(tReconnect);
}

// ===== KHỞI CHẠY BOT MINECRAFT =====
function startBot() {
    if (isConnected || isReconnecting || currentBot) return;

    console.log("🔄 Đang kết nối bot...");

    const bot = mineflayer.createBot({
        host: "zincmii.play.hosting",
        username: "Hosting",
        version: "1.21.11", 
    });

    currentBot = bot;
    let ended = false;
    let loggedIn = false;
    let loginSent = false;
    let kickReason = "";

    bot.once("spawn", () => {
        isConnected = true;
        console.log("✅ Bot đã vào server thành công!");
    });

    // ===== XỬ LÝ CHAT & TỰ ĐỘNG LOGIN =====
    bot.on("message", (jsonMsg) => {
        const text = jsonMsg.toString();
        const lower = text.toLowerCase();
        console.log("📩", text);

        if (
            !loggedIn &&
            !loginSent &&
            (lower.includes("/login") || lower.includes("đăng nhập"))
        ) {
            loginSent = true;
            let tLogin = setTimeout(() => {
                if (currentBot === bot) {
                    bot.chat("/login BotAFK123");
                    console.log("🔑 Đã gửi lệnh đăng nhập /login");
                }
            }, 800);
            activeTimeouts.push(tLogin);
        }

        if (
            lower.includes("đăng nhập thành công") ||
            lower.includes("logged in successfully") ||
            lower.includes("successfully logged")
        ) {
            if (!loggedIn) {
                loggedIn = true;
                console.log("✅ Login thành công! Bắt đầu anti-AFK...");

                const rand = (min, max) => Math.random() * (max - min) + min;

                // Sneak on/off random 2-5 giây
                let sneaking = false;
                let sneakStopped = false;
                function doSneak() {
                    if (sneakStopped || ended || !isConnected || currentBot !== bot) return;
                    sneaking = !sneaking;
                    bot.setControlState("sneak", sneaking);
                    const t = setTimeout(doSneak, rand(2000, 5000));
                    activeTimeouts.push(t);
                }
                doSneak();

                // Nhảy mỗi 5 giây
                //let iJump = setInterval(() => {
                //    if (ended || !isConnected || currentBot !== bot) return;
                //    bot.setControlState("jump", true);
                //    let tJumpOff = setTimeout(() => {
                //        if (isConnected && currentBot === bot) bot.setControlState("jump", false);
                //    }, 200);
                //    activeTimeouts.push(tJumpOff);
                //    console.log("🦘 Nhảy!");
                //}, 5000);
                //activeIntervals.push(iJump);

                // Xoay nhìn ngẫu nhiên mỗi 3 giây
                let iLook = setInterval(() => {
                    if (ended || !isConnected || !bot.entity || currentBot !== bot) return;
                    const yaw = Math.random() * Math.PI * 2;
                    const pitch = (Math.random() - 0.5) * 1.0;
                    bot.look(yaw, pitch, true);
                }, 30000);
                activeIntervals.push(iLook);

                // Đánh tay random 2-5 giây
                let swingStopped = false;
                function doSwing() {
                    if (swingStopped || ended || !isConnected || currentBot !== bot) return;
                    bot.swingArm();
                    const t = setTimeout(doSwing, rand(10000, 3000));
                    activeTimeouts.push(t);
                }
                doSwing();
            }
        }
    });

    // ===== XỬ LÝ KHI BỊ KICK HOẶC MẤT KẾT NỐI =====
    bot.on("kicked", (reason) => {
        kickReason = typeof reason === "object" ? JSON.stringify(reason) : String(reason);
        console.log("🚫 Bot bị Kick khỏi Server:", kickReason);
    });

    bot.on("end", (reason) => {
        if (ended) return;
        ended = true;

        isConnected = false;
        currentBot = null;
        
        // Dọn dẹp tuyệt đối toàn bộ luồng cũ để tránh dồn ứ packet
        activeIntervals.forEach(clearInterval);
        activeTimeouts.forEach(clearTimeout);
        activeIntervals = [];
        activeTimeouts = [];

        scheduleReconnect(kickReason || reason);
    });

    bot.on("error", (err) => {
        console.error(err);
    });
}

// Khởi chạy server Web Express trước rồi bật bot
server.listen(PORT, () => {
    originalLog(`🌐 Hệ thống Monitor đang chạy tại cổng: ${PORT}`);
    startBot();
});

// ===== GIAO DIỆN MONITOR WEB (HTML/CSS/JS) =====
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
        .cursor {
            display: inline-block;
            width: 8px; height: 14px;
            background: #00ff96;
            animation: blink 1s step-end infinite;
            vertical-align: middle;
            margin-left: 2px;
        }
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
    <div id="console">
        <div class="log-line">
            <span class="log-time">--:--:--</span>
            <span class="log-msg">Đang kết nối...<span class="cursor"></span></span>
        </div>
    </div>
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
            .replace(/📝/g, '<span class="tag-ok">📝</span>')
            .replace(/🌐/g, '<span class="tag-ok">🌐</span>')
            .replace(/🦘/g, '<span class="tag-ok">🦘</span>')
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
\`;
`; //