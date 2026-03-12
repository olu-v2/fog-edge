let socket = null;
const listeners = new Set();

export function connectWS(wsUrl) {
  if (socket) return;
  socket = new WebSocket(wsUrl);

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    listeners.forEach((fn) => fn(msg));
  };

  socket.onclose = () => {
    socket = null;
    // Reconnect after 3s
    setTimeout(() => connectWS(wsUrl), 3000);
  };

  socket.onerror = (err) => console.error("[WS] Error:", err);
}

export function onMessage(fn) {
  listeners.add(fn);
}
export function offMessage(fn) {
  listeners.delete(fn);
}
