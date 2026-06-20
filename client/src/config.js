// Product name — change here to rebrand everywhere.
export const APP_NAME = 'Playverse';

// Where the backend lives. Override with VITE_SERVER_URL when deploying or when a
// second device connects over the LAN (e.g. http://192.168.1.20:3001).
export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || `http://${location.hostname}:3001`;
