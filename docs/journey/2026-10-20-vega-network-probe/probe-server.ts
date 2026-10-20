// Throwaway probe: can the Vega VVD reach the host over HTTP and WebSocket?
Bun.serve({
  port: 8787,
  hostname: "0.0.0.0",
  fetch(req, server) {
    console.log("http", req.url);
    if (server.upgrade(req)) return;
    return new Response("hello-http");
  },
  websocket: {
    open(ws) { console.log("ws open"); ws.send("hello-ws"); },
    message(ws, m) { console.log("ws msg", m); ws.send("echo:" + m); },
  },
});
console.log("listening 8787");
