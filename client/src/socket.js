// Single authenticated Socket.IO connection per session.
import { io } from 'socket.io-client';
import { SERVER_URL } from './config.js';

let socket = null;

export function connectSocket(token) {
  if (socket) socket.disconnect();
  socket = io(SERVER_URL, { auth: { token }, transports: ['websocket', 'polling'] });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// Promise wrapper around an emit-with-ack.
export function emitAck(event, payload) {
  return new Promise((resolve) => {
    if (!socket) return resolve({ error: 'Not connected.' });
    socket.emit(event, payload, (res) => resolve(res || {}));
  });
}
