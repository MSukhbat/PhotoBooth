const API = "https://photobooth-gmu1.onrender.com";
const WS_URL = "wss://photobooth-gmu1.onrender.com";
const $ = (id) => document.getElementById(id);
let stream = null;
let socket = null;
let joined = false;
let capturing = false;
let generation = 0;
let sessionId = "";
let cameraId = "";

const query = new URLSearchParams(location.search);
$("session").value = query.get("sessionId") || "";
if (/^CAM[1-8]$/.test(query.get("cameraId") || ""))
  $("camera").value = query.get("cameraId");

function status(message, kind = "") {
  $("status").textContent = message;
  $("indicator").textContent =
    kind === "ready" ? "READY" : kind === "error" ? "ERROR" : "WAITING";
  $("indicator").className = kind;
}
function send(message) {
  if (socket?.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify(message));
}
function ready() {
  if (!joined || capturing || !stream?.active) return;
  send({ type: "CAMERA_READY" });
  status(`${cameraId} READY — Controller командыг хүлээж байна`, "ready");
}
function stop() {
  generation++;
  joined = false;
  capturing = false;
  if (socket) {
    const old = socket;
    socket = null;
    old.close();
  }
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  $("video").srcObject = null;
  $("connect").disabled = false;
  $("disconnect").disabled = true;
  $("session").disabled = false;
  $("camera").disabled = false;
  $("lens").disabled = false;
  status("Disconnected");
}
async function capture(message, token) {
  if (capturing || !joined || !stream?.active) return;
  capturing = true;
  status(`Зураг авч байна: shot ${message.shotNumber}`);
  try {
    const video = $("video");
    if (!video.videoWidth || !video.videoHeight)
      throw Error("Camera preview not ready");
    const canvas = $("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(Error("JPEG conversion failed"))),
        "image/jpeg",
        0.9,
      ),
    );
    const form = new FormData();
    form.append("sessionId", sessionId);
    form.append("cameraId", cameraId);
    form.append("requestId", message.requestId);
    form.append("capturedAt", new Date().toISOString());
    form.append("photo", blob, `${cameraId}-${message.shotNumber}.jpg`);
    status("Зураг сервер рүү илгээж байна...");
    const response = await fetch(`${API}/upload`, {
      method: "POST",
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw Error(data.error || `Upload failed: HTTP ${response.status}`);
    if (token !== generation) return;
    $("details").textContent =
      `Shot ${message.shotNumber} uploaded successfully`;
    status("Зураг хадгалагдлаа");
  } catch (error) {
    if (token !== generation) return;
    send({
      type: "CAPTURE_ERROR",
      requestId: message.requestId,
      message: error.message,
    });
    status(error.message, "error");
  } finally {
    if (token === generation) {
      capturing = false;
      // Backend clears pending only after all uploads; delay READY until STATUS.
    }
  }
}
async function start() {
  const id = $("session").value.trim();
  if (!id) return status("Session ID оруулна уу", "error");
  if (!navigator.mediaDevices?.getUserMedia)
    return status("HTTPS болон camera permission шаардлагатай", "error");
  stop();
  const token = generation;
  sessionId = id;
  cameraId = $("camera").value;
  $("connect").disabled = true;
  $("disconnect").disabled = false;
  $("session").disabled = true;
  $("camera").disabled = true;
  $("lens").disabled = true;
  try {
    status("Camera permission хүсэж байна...");
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: $("lens").value },
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
    });
    if (token !== generation) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    $("video").srcObject = stream;
    await $("video").play();
    status("WebSocket холбож байна...");
    const ws = new WebSocket(WS_URL);
    socket = ws;
    ws.onopen = () =>
      send({ type: "JOIN", role: "camera", sessionId, cameraId });
    ws.onmessage = async (event) => {
      if (token !== generation) return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === "JOINED") {
        joined = true;
        ready();
      }
      if (msg.type === "CAPTURE") await capture(msg, token);
      if (msg.type === "STATUS" && joined && !msg.busy && !capturing) {
        const me = msg.cameras?.find((c) => c.cameraId === cameraId);
        if (me && !me.ready) ready();
      }
      if (msg.type === "CAPTURE_COMPLETED" && joined && !capturing) ready();
      if (msg.type === "ERROR") {
        status(msg.message || "Server error", "error");
        if (!joined) stop();
      }
    };
    ws.onerror = () => status("WebSocket connection error", "error");
    ws.onclose = () => {
      if (token === generation) {
        joined = false;
        status("Connection closed — Reconnect дарна уу", "error");
        $("connect").disabled = false;
      }
    };
  } catch (error) {
    if (token === generation) {
      stop();
      status(error.message, "error");
    }
  }
}
$("connect").addEventListener("click", start);
$("disconnect").addEventListener("click", stop);
window.addEventListener("pagehide", stop);
