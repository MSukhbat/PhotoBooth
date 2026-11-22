const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use("/camera", express.static(path.join(__dirname, "camera-web")));

const uploadsDir = path.join(__dirname, "uploads");
const dataDir = path.join(__dirname, "data");
const photosFile = path.join(dataDir, "photos.json");

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

let photos = [];
if (fs.existsSync(photosFile)) {
  photos = JSON.parse(fs.readFileSync(photosFile, "utf8"));
}

function savePhotos() {
  fs.writeFileSync(photosFile, JSON.stringify(photos, null, 2));
}

// Түр зуурын session-ууд (сервер restart хийхэд арилна)
const sessions = new Map();
const clients = new Map();

function send(ws, message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcast(sessionId, message) {
  for (const [ws, client] of clients) {
    if (client.sessionId === sessionId) {
      send(ws, message);
    }
  }
}

function getCameras(sessionId) {
  const result = [];

  for (const [ws, client] of clients) {
    if (
      client.role === "camera" &&
      client.sessionId === sessionId &&
      ws.readyState === WebSocket.OPEN
    ) {
      result.push({ ws, ...client });
    }
  }

  return result;
}

function getSessionPhotos(sessionId) {
  return photos.filter((photo) => photo.sessionId === sessionId);
}

function sendStatus(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  broadcast(sessionId, {
    type: "STATUS",
    mode: session.mode,
    completed: session.completed,
    busy: Boolean(session.pending),
    cameras: getCameras(sessionId).map((camera) => ({
      cameraId: camera.cameraId,
      ready: camera.ready,
    })),
    photoCount: getSessionPhotos(sessionId).length,
  });
}

function finishCapture(session, reason = null) {
  const job = session.pending;
  if (!job) return;

  clearTimeout(job.timer);

  const received = job.received.size;
  const expected = job.expected.size;

  session.pending = null;

  // Зөвхөн бүрэн амжилттай capture-г тоолно
  if (received === expected && !reason) {
    session.completed++;

    broadcast(session.id, {
      type: "CAPTURE_COMPLETED",
      requestId: job.requestId,
      shotNumber: job.shotNumber,
      received,
      expected,
    });
  } else {
    broadcast(session.id, {
      type: "CAPTURE_FAILED",
      requestId: job.requestId,
      shotNumber: job.shotNumber,
      received,
      expected,
      message: reason || "Incomplete capture",
    });
  }

  sendStatus(session.id);
}

// Session үүсгэх
app.post("/sessions", (req, res) => {
  const mode = req.body.mode;

  if (!["sequential", "simultaneous"].includes(mode)) {
    return res.status(400).json({ error: "Invalid mode" });
  }

  const id = crypto.randomUUID();

  sessions.set(id, {
    id,
    mode,
    completed: 0,
    pending: null,
  });

  console.log("Session created:", id, mode);

  res.json({ sessionId: id, mode });
});

// Зургийн жагсаалт
app.get("/sessions/:id/photos", (req, res) => {
  res.json(getSessionPhotos(req.params.id));
});

// Upload тохиргоо
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    cb(null, crypto.randomUUID() + ".jpg");
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "image/jpeg") {
      return cb(new Error("Only JPEG allowed"));
    }
    cb(null, true);
  },
});

app.use("/uploads", express.static(uploadsDir));

app.post("/upload", upload.single("photo"), (req, res) => {
  const { sessionId, cameraId, requestId, capturedAt } = req.body;
  const session = sessions.get(sessionId);
  const job = session?.pending;

  const valid =
    req.file &&
    job &&
    job.requestId === requestId &&
    job.expected.has(cameraId) &&
    !job.received.has(cameraId);

  if (!valid) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({
      error: "Invalid or expired capture",
    });
  }

  const photo = {
    photoId: crypto.randomUUID(),
    sessionId,
    cameraId,
    requestId,
    shotNumber: job.shotNumber,
    capturedAt: capturedAt || null,
    uploadedAt: new Date().toISOString(),
    url: `/uploads/${req.file.filename}`,
  };

  photos.push(photo);
  savePhotos();

  job.received.add(cameraId);

  console.log("Photo saved:", cameraId, req.file.filename);

  broadcast(sessionId, {
    type: "PHOTO_SAVED",
    photo,
  });

  res.json({ success: true, photo });

  if (job.received.size === job.expected.size) {
    finishCapture(session);
  }
});

// WebSocket
wss.on("connection", (ws) => {
  console.log("WebSocket connected");

  ws.on("message", (raw) => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, {
        type: "ERROR",
        message: "Invalid JSON",
      });
    }

    // Session-д нэгдэх
    if (msg.type === "JOIN") {
      const session = sessions.get(msg.sessionId);

      if (!session) {
        return send(ws, {
          type: "ERROR",
          message: "Session not found",
        });
      }

      if (!["camera", "controller"].includes(msg.role)) {
        return send(ws, {
          type: "ERROR",
          message: "Invalid role",
        });
      }

      if (msg.role === "camera") {
        if (!/^CAM[1-8]$/.test(msg.cameraId || "")) {
          return send(ws, {
            type: "ERROR",
            message: "Camera ID must be CAM1 to CAM8",
          });
        }

        if (
          getCameras(msg.sessionId).some(
            (camera) => camera.cameraId === msg.cameraId,
          )
        ) {
          return send(ws, {
            type: "ERROR",
            message: "Camera ID already connected",
          });
        }
      }

      clients.set(ws, {
        role: msg.role,
        sessionId: msg.sessionId,
        cameraId: msg.role === "camera" ? msg.cameraId : null,
        ready: false,
      });

      send(ws, { type: "JOINED" });
      sendStatus(msg.sessionId);
      return;
    }

    const client = clients.get(ws);
    if (!client) return;

    const session = sessions.get(client.sessionId);
    if (!session) return;

    // Утас бэлэн
    if (msg.type === "CAMERA_READY" && client.role === "camera") {
      client.ready = true;
      sendStatus(client.sessionId);
      return;
    }

    // Capture алдаа
    if (msg.type === "CAPTURE_ERROR" && client.role === "camera") {
      if (session.pending && session.pending.requestId === msg.requestId) {
        finishCapture(session, msg.message || "Camera error");
      }
      return;
    }

    // Зураг авах команд
    if (
      ["CAPTURE_ONE", "CAPTURE_ALL"].includes(msg.type) &&
      client.role === "controller"
    ) {
      if (session.pending) {
        return send(ws, {
          type: "ERROR",
          message: "Capture already in progress",
        });
      }

      const isSequential = session.mode === "sequential";

      if (
        (isSequential && msg.type !== "CAPTURE_ONE") ||
        (!isSequential && msg.type !== "CAPTURE_ALL")
      ) {
        return send(ws, {
          type: "ERROR",
          message: "Wrong command for session mode",
        });
      }

      const maxShots = isSequential ? 8 : 1;

      if (session.completed >= maxShots) {
        return send(ws, {
          type: "ERROR",
          message: "Session already completed",
        });
      }

      const connected = getCameras(session.id);
      const expectedCount = isSequential ? 1 : 8;

      if (
        connected.length !== expectedCount ||
        !connected.every((camera) => camera.ready)
      ) {
        return send(ws, {
          type: "ERROR",
          message: `Need ${expectedCount} ready camera(s)`,
        });
      }

      const requestId = crypto.randomUUID();
      const shotNumber = session.completed + 1;

      const job = {
        requestId,
        shotNumber,
        expected: new Set(connected.map((c) => c.cameraId)),
        received: new Set(),
        timer: null,
      };

      session.pending = job;

      job.timer = setTimeout(() => {
        if (session.pending === job) {
          finishCapture(session, "Capture timed out");
        }
      }, 30000);

      for (const camera of connected) {
        const cameraClient = clients.get(camera.ws);
        cameraClient.ready = false;

        send(camera.ws, {
          type: "CAPTURE",
          requestId,
          shotNumber,
        });
      }

      broadcast(session.id, {
        type: "CAPTURE_STARTED",
        requestId,
        shotNumber,
        expected: expectedCount,
      });

      sendStatus(session.id);
      return;
    }
  });

  ws.on("close", () => {
    const client = clients.get(ws);
    clients.delete(ws);

    if (!client) return;

    const session = sessions.get(client.sessionId);

    if (
      client.role === "camera" &&
      session?.pending &&
      session.pending.expected.has(client.cameraId) &&
      !session.pending.received.has(client.cameraId)
    ) {
      finishCapture(session, "Camera disconnected");
    }

    sendStatus(client.sessionId);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Camera server running on port ${PORT}`);
});
