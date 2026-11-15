const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

// Node.js 18 буюу түүнээс шинэ хувилбар шаардлагатай
const SERVER = "http://localhost:3000";
const WS_SERVER = "ws://localhost:3000";

const sessionId = process.argv[2];

const imagePath = path.join(__dirname, "test-photo.jpg");

if (!sessionId) {
  console.error("Session ID оруулна уу.");
  console.log("Example: node simulator.js YOUR_SESSION_ID");
  process.exit(1);
}

if (!fs.existsSync(imagePath)) {
  console.error("server/test-photo.jpg файл олдсонгүй.");
  process.exit(1);
}

if (
  typeof fetch !== "function" ||
  typeof FormData !== "function" ||
  typeof Blob !== "function"
) {
  console.error("Node.js 18+ ашиглана уу.");
  process.exit(1);
}

// CAM1 бол бодит iPhone.
// Simulator зөвхөн CAM2-CAM8 үүсгэнэ.
const cameraIds = ["CAM2", "CAM3", "CAM4", "CAM5", "CAM6", "CAM7", "CAM8"];

const sockets = [];

async function uploadPhoto(cameraId, requestId) {
  const imageBuffer = fs.readFileSync(imagePath);

  const formData = new FormData();

  formData.append(
    "photo",
    new Blob([imageBuffer], { type: "image/jpeg" }),
    `${cameraId}.jpg`,
  );

  formData.append("sessionId", sessionId);
  formData.append("cameraId", cameraId);
  formData.append("requestId", String(requestId));
  formData.append("capturedAt", new Date().toISOString());

  const response = await fetch(`${SERVER}/upload`, {
    method: "POST",
    body: formData,
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body}`);
  }

  return JSON.parse(body);
}

function createVirtualCamera(cameraId) {
  const ws = new WebSocket(WS_SERVER);

  sockets.push(ws);

  let joined = false;
  let busy = false;

  ws.on("open", () => {
    console.log(`${cameraId}: WebSocket connected`);

    ws.send(
      JSON.stringify({
        type: "JOIN",
        role: "camera",
        sessionId,
        cameraId,
      }),
    );
  });

  ws.on("message", async (raw) => {
    let message;

    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === "JOINED") {
      joined = true;

      console.log(`${cameraId}: JOINED`);

      ws.send(
        JSON.stringify({
          type: "CAMERA_READY",
        }),
      );

      console.log(`${cameraId}: READY`);
      return;
    }

    if (message.type === "CAPTURE") {
      const requestId = message.requestId;

      if (busy) {
        ws.send(
          JSON.stringify({
            type: "CAPTURE_ERROR",
            requestId,
            message: `${cameraId} is busy`,
          }),
        );
        return;
      }

      busy = true;

      console.log(`${cameraId}: CAPTURE received`, requestId);

      try {
        const result = await uploadPhoto(cameraId, requestId);

        console.log(`${cameraId}: PHOTO SAVED`, result.photo?.url);
      } catch (error) {
        console.error(`${cameraId}: Upload failed`, error.message);

        ws.send(
          JSON.stringify({
            type: "CAPTURE_ERROR",
            requestId,
            message: error.message,
          }),
        );
      } finally {
        busy = false;

        if (joined && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "CAMERA_READY",
            }),
          );
        }
      }
    }

    if (message.type === "ERROR") {
      console.error(`${cameraId}: Server error`, message.message);
    }
  });

  ws.on("error", (error) => {
    console.error(`${cameraId}: WebSocket error`, error.message);
  });

  ws.on("close", () => {
    joined = false;
    console.log(`${cameraId}: DISCONNECTED`);
  });
}

console.log("Starting 7 virtual cameras...");
console.log("Session:", sessionId);

cameraIds.forEach(createVirtualCamera);

process.on("SIGINT", () => {
  console.log("\nStopping simulator...");

  sockets.forEach((ws) => ws.close());

  process.exit(0);
});
