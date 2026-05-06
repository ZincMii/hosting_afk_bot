const mineflayer = require("mineflayer");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 80;
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
let isConnected = false;
let isReconnecting = false;
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

    if (isDuplicateUsername(reason)) {
        console.log("🛑 Đã có bot khác → dừng.");
        return;
    }

    isReconnecting = true;
    console.log(`⚠️ Mất kết nối: ${reason || "unknown"} → reconnect sau 15s...`);

    setTimeout(() => {
        isReconnecting = false;
        startBot();
    }, 5000);
}

function startBot() {
    if (isConnected || isReconnecting || currentBot) return;

    console.log("🔄 Đang kết nối bot...");

    const bot = mineflayer.createBot({
        host: "zincmii.play.hosting",
        username: "Hosting",
        version: false,
    });

    currentBot = bot;
    let ended = false;
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

        if (
            lower.includes("đăng nhập thành công") ||
            lower.includes("logged in successfully") ||
            lower.includes("successfully logged")
        ) {
            if (!loggedIn) {
                loggedIn = true;
                console.log("✅ Login thành công! Bắt đầu anti-AFK...");

                // ===== ANTI AFK (SAFE) =====
                const rand = (min, max) => Math.random() * (max - min) + min;

                function doRandomAction() {
                    const actions = ["jump", "look", "sneak", "idle"];
                    const action = actions[Math.floor(Math.random() * actions.length)];

                    if (action === "jump") {
                        bot.setControlState("jump", true);
                        setTimeout(() => bot.setControlState("jump", false), 300);
                        console.log("Bot nhảy nhẹ");
                    }

                    if (action === "look") {
                        const yaw = Math.random() * Math.PI * 2;
                        const pitch = (Math.random() - 0.5) * 0.5;
                        bot.look(yaw, pitch, true);
                        console.log("Bot quay đầu");
                    }

                    if (action === "sneak") {
                        bot.setControlState("sneak", true);
                        setTimeout(() => bot.setControlState("sneak", false), rand(1000, 3000));
                        console.log("Bot cúi nhẹ");
                    }

                    if (action === "idle") {
                        console.log("Bot đứng yên");
                    }

                    const delay = rand(8000, 15000);
                    setTimeout(doRandomAction, delay);
                }

                doRandomAction();
            }
        }
    });

    let kickReason = null;

    bot.on("kicked", (reason) => {
        kickReason = typeof reason === "object" ? JSON.stringify(reason) : String(reason);
        console.log("🚫 Bị kick:", kickReason);
    });

    bot.on("end", (reason) => {
        if (ended) return;
        ended = true;
        isConnected = false;
        currentBot = null;
        scheduleReconnect(kickReason || reason);
    });

    bot.on("error", (err) => {
        console.error(err);
    });
}

server.listen(PORT, () => {
    originalLog(`🌐 Web chạy cổng ${PORT}`);
    startBot();
});