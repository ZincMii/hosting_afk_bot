const mineflayer = require("mineflayer");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// ===== LOG =====
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

// ===== BOT STATE =====
let isConnected = false; // true khi bot đang ở trong server
let isReconnecting = false; // true khi đang đợi reconnect
let currentBot = null;

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

    // Nếu bị kick vì username trùng → có instance khác đang chạy, dừng hẳn
    if (isDuplicateUsername(reason)) {
        console.log(
            `🛑 Dừng: đã có bot khác vào server với cùng username. Không reconnect.`,
        );
        return;
    }

    isReconnecting = true;
    console.log(`⚠️ Mất kết nối: ${reason || "unknown"} → thử lại sau 15s...`);

    setTimeout(() => {
        isReconnecting = false;
        startBot();
    }, 15000);
}

function startBot() {
    if (isConnected) {
        console.log("✅ Bot đang trong server, bỏ qua.");
        return;
    }
    if (isReconnecting) {
        console.log("⏳ Đang chờ reconnect, bỏ qua.");
        return;
    }
    if (currentBot) {
        console.log("⚡ Bot instance đang tồn tại, bỏ qua.");
        return;
    }

    console.log("🔄 Đang kết nối bot...");

    const bot = mineflayer.createBot({
        host: "zincmii.play.hosting",
        username: "Hosting",
        version: false,
    });

    currentBot = bot;
    let ended = false;
    let intervals = [];
    let loggedIn = false;
    let loginSent = false;

    bot.once("spawn", () => {
        isConnected = true;
        console.log("✅ Bot đã vào server!");
    });

    bot.on("message", (jsonMsg) => {
        const text = jsonMsg.toString();
        const lower = text.toLowerCase();
        console.log("📩", text);

        // Server yêu cầu login → gửi lệnh /login (chỉ gửi 1 lần)
        if (
            !loggedIn &&
            !loginSent &&
            (lower.includes("/login") || lower.includes("đăng nhập"))
        ) {
            loginSent = true;
            setTimeout(() => {
                bot.chat("/login BotAFK123");
                console.log("🔑 Đã gửi /login");
            }, 500);
        }

        // Login thành công → bắt đầu AFK
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
                    if (sneakStopped) return;
                    sneaking = !sneaking;
                    bot.setControlState("sneak", sneaking);
                    const t = setTimeout(doSneak, rand(2000, 5000));
                    intervals.push(t);
                }
                doSneak();

                // Nhảy mỗi 5 giây
                intervals.push(
                    setInterval(() => {
                        bot.setControlState("jump", true);
                        setTimeout(
                            () => bot.setControlState("jump", false),
                            200,
                        );
                        console.log("🦘 Nhảy!");
                    }, 5000),
                );

                // Xoay nhìn ngẫu nhiên mỗi 3 giây
                intervals.push(
                    setInterval(() => {
                        const yaw = Math.random() * Math.PI * 2;
                        const pitch = (Math.random() - 0.5) * 1.0;
                        bot.look(yaw, pitch, true);
                    }, 3000),
                );

                // Đánh tay random 2-5 giây
                let swingStopped = false;
                function doSwing() {
                    if (swingStopped) return;
                    bot.swingArm();
                    const t = setTimeout(doSwing, rand(2000, 5000));
                    intervals.push(t);
                }
                doSwing();
            }
        }
    });

    let kickReason = null;

    bot.on("kicked", (reason) => {
        const r =
            typeof reason === "object"
                ? JSON.stringify(reason)
                : String(reason);
        kickReason = r;
        console.log("🚫 Bị kick:", r);
    });

    bot.on("end", (reason) => {
        if (ended) return;
        ended = true;
        isConnected = false;
        currentBot = null;

        intervals.forEach(clearInterval);
        intervals = [];

        // Dùng lý do kick thực (từ kicked event) thay vì "socketClosed"
        scheduleReconnect(kickReason || reason);
    });

    bot.on("error", (err) => {
        console.error(err);
    });
}

// ===== START =====
server.listen(80, () => {
    originalLog("🌐 Web chạy cổng 3000");
    startBot();
});
