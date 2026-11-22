import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";

function getServerUrls(value) {
  const input = value.trim().replace(/\/+$/, "");

  if (input.startsWith("https://")) {
    return {
      http: input,
      ws: input.replace(/^https:/, "wss:"),
    };
  }

  if (input.startsWith("http://")) {
    return {
      http: input,
      ws: input.replace(/^http:/, "ws:"),
    };
  }

  return {
    http: `http://${input}:3000`,
    ws: `ws://${input}:3000`,
  };
}

export default function App() {
  const cameraRef = useRef(null);
  const socketRef = useRef(null);
  const readyRef = useRef(false);
  const busyRef = useRef(false);
  const settingsRef = useRef({});

  const [permission, requestPermission] = useCameraPermissions();
  const [serverIp, setServerIp] = useState(
    "https://photobooth-gmu1.onrender.com",
  );
  const [sessionId, setSessionId] = useState("");
  const [cameraId, setCameraId] = useState("CAM1");
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Not connected");
  const [photoCount, setPhotoCount] = useState(0);

  settingsRef.current = {
    serverIp,
    sessionId,
    cameraId,
  };

  function send(message) {
    const ws = socketRef.current;

    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  function markReady() {
    readyRef.current = true;
    setReady(true);

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      send({ type: "CAMERA_READY" });
    }
  }

  async function takePhoto(requestId) {
    if (busyRef.current || !readyRef.current || !cameraRef.current) {
      send({
        type: "CAPTURE_ERROR",
        requestId,
        message: "Camera not ready",
      });
      return;
    }

    busyRef.current = true;
    readyRef.current = false;
    setReady(false);

    const settings = settingsRef.current;

    try {
      setStatus("Taking photo...");

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
      });

      const capturedAt = new Date().toISOString();

      setStatus("Uploading photo...");
      const urls = getServerUrls(settings.serverIp);
      const result = await FileSystem.uploadAsync(
        `${urls.http}/upload`,
        photo.uri,
        {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: "photo",
          mimeType: "image/jpeg",
          parameters: {
            sessionId: settings.sessionId.trim(),
            cameraId: settings.cameraId.trim().toUpperCase(),
            requestId: String(requestId),
            capturedAt,
          },
        },
      );

      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Upload failed: ${result.status} ${result.body}`);
      }

      const data = JSON.parse(result.body);

      if (!data.success) {
        throw new Error("Server did not confirm upload");
      }

      setPhotoCount((count) => count + 1);
      setStatus("Photo uploaded successfully");
    } catch (error) {
      console.log("Capture error:", error);

      setStatus("Error: " + error.message);

      send({
        type: "CAPTURE_ERROR",
        requestId,
        message: error.message,
      });
    } finally {
      busyRef.current = false;
      readyRef.current = true;
      setReady(true);

      send({ type: "CAMERA_READY" });
    }
  }

  function connect() {
    const settings = settingsRef.current;

    if (!settings.serverIp.trim() || !settings.sessionId.trim()) {
      Alert.alert("Error", "Enter Server IP and Session ID");
      return;
    }

    socketRef.current?.close();

    const urls = getServerUrls(settings.serverIp);
    const ws = new WebSocket(urls.ws);

    socketRef.current = ws;
    setStatus("Connecting...");

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "JOIN",
          role: "camera",
          sessionId: settings.sessionId.trim(),
          cameraId: settings.cameraId.trim().toUpperCase(),
        }),
      );
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "JOINED") {
        setConnected(true);
        setStatus("Connected to session");

        if (readyRef.current) {
          ws.send(JSON.stringify({ type: "CAMERA_READY" }));
        }
      }

      if (message.type === "CAPTURE") {
        takePhoto(message.requestId);
      }

      if (message.type === "ERROR") {
        setStatus(message.message);
        Alert.alert("Server error", message.message);
      }
    };

    ws.onerror = () => setStatus("Connection error");

    ws.onclose = () => {
      if (socketRef.current !== ws) return;
      setConnected(false);
      setStatus("Disconnected");
    };
  }

  function disconnect() {
    socketRef.current?.close();
    socketRef.current = null;
    setConnected(false);
    setStatus("Disconnected");
  }

  useEffect(() => {
    return () => socketRef.current?.close();
  }, []);

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Loading camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Camera permission required</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          onCameraReady={markReady}
        />

        <View style={styles.overlay}>
          <Text style={styles.overlayText}>
            {cameraId} • {connected ? "ONLINE" : "OFFLINE"}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.controls}>
        <Text style={styles.title}>Photobooth Camera</Text>

        <Text style={styles.label}>Server IP or HTTPS URL</Text>
        <TextInput
          style={styles.input}
          value={serverIp}
          onChangeText={setServerIp}
          editable={!connected}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Session ID</Text>
        <TextInput
          style={styles.input}
          value={sessionId}
          onChangeText={setSessionId}
          editable={!connected}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Camera ID</Text>
        <TextInput
          style={styles.input}
          value={cameraId}
          onChangeText={setCameraId}
          editable={!connected}
          autoCapitalize="characters"
        />

        <TouchableOpacity
          style={styles.button}
          onPress={connected ? disconnect : connect}
        >
          <Text style={styles.buttonText}>
            {connected ? "Disconnect" : "Connect Camera"}
          </Text>
        </TouchableOpacity>

        <Text style={styles.info}>Status: {status}</Text>
        <Text style={styles.info}>Camera: {ready ? "Ready" : "Not ready"}</Text>
        <Text style={styles.info}>Photos uploaded: {photoCount}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  center: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  cameraContainer: {
    flex: 1.2,
    overflow: "hidden",
  },
  overlay: {
    position: "absolute",
    top: 45,
    left: 15,
    backgroundColor: "#0009",
    padding: 10,
    borderRadius: 8,
  },
  overlayText: {
    color: "white",
    fontWeight: "bold",
  },
  controls: {
    flex: 1,
    padding: 20,
    backgroundColor: "#161616",
  },
  title: {
    color: "white",
    fontSize: 21,
    fontWeight: "bold",
    marginBottom: 12,
  },
  label: {
    color: "#aaa",
    marginTop: 10,
    marginBottom: 5,
  },
  input: {
    backgroundColor: "#333",
    color: "white",
    padding: 12,
    borderRadius: 8,
  },
  button: {
    backgroundColor: "#4776ed",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 15,
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
  },
  info: {
    color: "#ddd",
    marginTop: 12,
  },
});
