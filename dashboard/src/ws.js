let socket = null;
let wsUrl = null;
const listeners = new Set();

export function connectWS(url, { onOpen, onClose, onError } = {}) {
  wsUrl = url;
  if (socket && socket.readyState < 2) return socket; // already open or connecting

  socket = new WebSocket(url);

  socket.onopen = () => {
    onOpen?.();
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      listeners.forEach((fn) => fn(msg));
    } catch (e) {
      console.error("[WS] Failed to parse message:", e);
    }
  };

  socket.onclose = () => {
    onClose?.();
    socket = null;
    // Reconnect after 3s, preserve callbacks
    setTimeout(() => connectWS(wsUrl, { onOpen, onClose, onError }), 3000);
  };

  socket.onerror = (err) => {
    console.error("[WS] Error:", err);
    onError?.();
  };

  return socket; // ← Bug 1 fix: must return socket
} // ← Bug 2 fix: closing brace was missing, trapping onMessage/offMessage inside

export function onMessage(fn) {
  listeners.add(fn);
}

export function offMessage(fn) {
  listeners.delete(fn);
}

export function disconnectWS() {
  socket?.close();
  socket = null;
}
