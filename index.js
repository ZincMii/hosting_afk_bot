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
        username: "HostingV2",
        version: "1.21.11", 
    });

    currentBot = bot;
    let loggedIn = false;
    let loginSent = false;
    let kickReason = "";

    bot.once("spawn", () => {
        isConnected = true;
        console.log("✅ Bot đã vào server thành công!");
    });

    bot.on("message", (jsonMsg) => {
        const text = jsonMsg.toString();
        const lower = text.toLowerCase();
        console.log("📩", text);

        if (!loggedIn && !loginSent && (lower.includes("/login") || lower.includes("đăng nhập"))) {
            loginSent = true;
            let tLogin = setTimeout(() => {
                if (currentBot === bot) {
                    bot.chat("/register BotAFK123 BotAFK123");
                    bot.chat("/login BotAFK123");
                    console.log("🔑 Đã gửi lệnh đăng nhập /login");
                }
            }, 1000);
            activeTimeouts.push(tLogin);
        }

        if (lower.includes("thành công") || lower.includes("successfully")) {
            if (!loggedIn) {
                loggedIn = true;
                console.log("✅ Login thành công! Bắt đầu chuỗi Anti-AFK tổng hợp...");
                
                // Anti-AFK đa dạng hành động mỗi 15s
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
                            const yaw = (Math.random() * Math.PI * 2);
                            const pitch = (Math.random() * Math.PI / 2) - Math.PI / 4;
                            bot.look(yaw, pitch);
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

// ===== GIAO DIỆN WEB =====
// ===== GIAO DIỆN WEB TỐI ƯU HÓA (MINIFIED) =====
// ===== GIAO DIỆN WEB NÂNG CẤP (CYBERPUNK STYLE) =====
const htmlTemplate = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Gemini Bot Control Panel</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        :root {
            --primary: #00ff96;
            --secondary: #00ccff;
            --bg-dark: #050508;
            --panel-bg: rgba(10, 10, 15, 0.9);
            --border: rgba(0, 255, 150, 0.3);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            background: var(--bg-dark);
            color: #e0e0e0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            overflow-x: hidden;
        }

        /* Hiệu ứng nền lưới */
        body::before {
            content: '';
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background-image: 
                linear-gradient(var(--border) 1px, transparent 1px),
                linear-gradient(90deg, var(--border) 1px, transparent 1px);
            background-size: 50px 50px;
            mask-image: radial-gradient(circle, black, transparent 80%);
            animation: gridMove 20s linear infinite;
            pointer-events: none;
            z-index: 0;
        }

        @keyframes gridMove {
            0% { background-position: 0 0; }
            100% { background-position: 50px 50px; }
        }

        .container {
            position: relative;
            z-index: 1;
            width: 95%;
            max-width: 1000px;
            margin: 40px auto;
        }

        /* Header & Status */
        .header {
            text-align: center;
            margin-bottom: 40px;
        }

        .status-orb {
            width: 100px;
            height: 100px;
            margin: 0 auto 20px;
            background: radial-gradient(circle, var(--primary), transparent 70%);
            border-radius: 50%;
            position: relative;
            box-shadow: 0 0 30px var(--primary);
            animation: pulse 2s infinite alternate;
        }

        @keyframes pulse {
            from { transform: scale(1); opacity: 0.8; }
            to { transform: scale(1.1); opacity: 1; box-shadow: 0 0 50px var(--primary); }
        }

        h1 {
            font-size: 2.5rem;
            letter-spacing: 5px;
            text-transform: uppercase;
            background: linear-gradient(90deg, var(--primary), var(--secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 10px;
        }

        /* Stats Grid */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: var(--panel-bg);
            border: 1px solid var(--border);
            padding: 20px;
            border-radius: 12px;
            text-align: center;
            backdrop-filter: blur(10px);
            transition: 0.3s;
        }

        .stat-card:hover { border-color: var(--primary); transform: translateY(-5px); }

        .stat-label { font-size: 0.7rem; text-transform: uppercase; color: #888; letter-spacing: 2px; }
        .stat-value { font-size: 1.5rem; color: var(--primary); font-weight: bold; margin-top: 5px; }

        /* Console Area */
        .console-box {
            background: var(--panel-bg);
            border: 1px solid var(--border);
            border-radius: 15px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }

        .console-header {
            background: rgba(255,255,255,0.05);
            padding: 12px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border);
        }

        .dots { display: flex; gap: 8px; }
        .dot { width: 12px; height: 12px; border-radius: 50%; }
        .red { background: #ff5f57; } .yellow { background: #febc2e; } .green { background: #28c840; }

        #console {
            height: 450px;
            padding: 20px;
            overflow-y: auto;
            font-family: 'Consolas', monospace;
            font-size: 0.9rem;
            line-height: 1.6;
            scrollbar-width: thin;
        }

        .log-entry { margin-bottom: 8px; display: flex; gap: 12px; border-left: 2px solid transparent; padding-left: 10px; }
        .log-entry.new { border-left-color: var(--primary); background: rgba(0,255,150,0.05); }
        .log-time { color: #555; min-width: 80px; }
        .log-text { color: #d0d0d0; }
        .error { color: #ff6b6b !important; }
        .highlight { color: var(--primary); font-weight: bold; }

        /* Scrollbar */
        #console::-webkit-scrollbar { width: 6px; }
        #console::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }
    </style>
</head>
<body>

<div class="container">
    <div class="header">
        <div class="status-orb"></div>
        <h1>Bot System</h1>
        <div style="color: var(--secondary); letter-spacing: 3px;">CONNECTED TO ZINCMII</div>
    </div>

    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-label">Thời gian chạy</div>
            <div id="uptime" class="stat-value">00:00:00</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Số dòng nhật ký</div>
            <div id="log-count" class="stat-value">0</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Phiên bản</div>
            <div class="stat-value">1.21.11</div>
        </div>
    </div>

    <div class="console-box">
        <div class="console-header">
            <div class="dots">
                <div class="dot red"></div>
                <div class="dot yellow"></div>
                <div class="dot green"></div>
            </div>
            <span style="font-size: 0.7rem; color: #666;">TERMINAL OUTPUT - v2.0</span>
        </div>
        <div id="console"></div>
    </div>
</div>

<script>
    const socket = io();
    const consoleEl = document.getElementById("console");
    const logCountEl = document.getElementById("log-count");
    const uptimeEl = document.getElementById("uptime");
    const startTime = Date.now();

    function updateUptime() {
        const diff = Math.floor((Date.now() - startTime) / 1000);
        const h = String(Math.floor(diff / 3600)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const s = String(diff % 60).padStart(2, '0');
        uptimeEl.textContent = \`\${h}:\${m}:\${s}\`;
    }
    setInterval(updateUptime, 1000);

    function formatMsg(msg) {
        return msg
            .replace(/(✅|🔑|🦘|🥊|👀|🏃|👣)/g, '<span class="highlight">$1</span>')
            .replace(/ERROR/g, '<span class="error">ERROR</span>');
    }

    function addLog(data, isNew = false) {
        const div = document.createElement("div");
        div.className = "log-entry" + (isNew ? " new" : "");
        div.innerHTML = \`
            <span class="log-time">[\${data.time}]</span>
            <span class="log-text \${data.type === 'error' ? 'error' : ''}">\${formatMsg(data.msg)}</span>
        \`;
        consoleEl.appendChild(div);
        consoleEl.scrollTop = consoleEl.scrollHeight;
        
        if (isNew) {
            setTimeout(() => div.classList.remove("new"), 2000);
        }
    }

    socket.on("history", (history) => {
        consoleEl.innerHTML = "";
        history.forEach(item => addLog(item));
        logCountEl.textContent = history.length;
    });

    socket.on("log", (data) => {
        addLog(data, true);
        logCountEl.textContent = parseInt(logCountEl.textContent) + 1;
    });
</script>
</body>
</html>
`;