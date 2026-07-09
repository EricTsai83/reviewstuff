#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const port = Number(process.env.PORT || 18765);
const outDir = process.env.CAPTURE_DIR || "/tmp/coderabbit-trpc-capture";
const outFile = path.join(outDir, "capture.json");

const capture = {
  startedAt: new Date().toISOString(),
  port,
  http: [],
  ws: [],
  trpcMessages: [],
  reviewPayloads: [],
};

fs.mkdirSync(outDir, { recursive: true });

function redactHeaders(headers) {
  const sensitive = new Set([
    "authorization",
    "x-coderabbitai-api-key",
    "cookie",
    "set-cookie",
  ]);
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      sensitive.has(key.toLowerCase()) ? "<redacted>" : value,
    ]),
  );
}

function writeCapture() {
  fs.writeFileSync(outFile, JSON.stringify(capture, null, 2));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const body = await readBody(req);
  capture.http.push({
    at: new Date().toISOString(),
    method: req.method,
    url: req.url,
    headers: redactHeaders(req.headers),
    body: body || undefined,
  });
  writeCapture();

  if (req.url?.startsWith("/cli/validate-api-key")) {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url?.startsWith("/health")) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("OK");
    return;
  }

  if (req.url?.startsWith("/trpc")) {
    sendJson(res, 200, { result: { data: null } });
    return;
  }

  sendJson(res, 404, { error: { message: "not found" } });
});

function wsAcceptKey(key) {
  return crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
}

function encodeFrame(text) {
  const payload = Buffer.from(text);
  const header = [];
  header.push(0x81);
  if (payload.length < 126) {
    header.push(payload.length);
  } else if (payload.length < 65536) {
    header.push(126, (payload.length >> 8) & 0xff, payload.length & 0xff);
  } else {
    header.push(127, 0, 0, 0, 0);
    header.push(
      (payload.length >> 24) & 0xff,
      (payload.length >> 16) & 0xff,
      (payload.length >> 8) & 0xff,
      payload.length & 0xff,
    );
  }
  return Buffer.concat([Buffer.from(header), payload]);
}

function sendText(socket, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  socket.write(encodeFrame(text));
  capture.trpcMessages.push({
    at: new Date().toISOString(),
    direction: "server->client",
    value: typeof value === "string" ? value : value,
  });
  writeCapture();
}

function decodeFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (buffer.length - offset >= 2) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let headerLength = 2;

    if (length === 126) {
      if (buffer.length - offset < 4) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (buffer.length - offset < 10) break;
      const high = buffer.readUInt32BE(offset + 2);
      const low = buffer.readUInt32BE(offset + 6);
      length = high * 2 ** 32 + low;
      headerLength = 10;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + length;
    if (buffer.length - offset < frameLength) break;

    const payloadStart = offset + headerLength + maskLength;
    const payload = Buffer.from(buffer.subarray(payloadStart, payloadStart + length));
    if (masked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
    }

    frames.push({ opcode, text: payload.toString("utf8") });
    offset += frameLength;
  }

  return { frames, rest: buffer.subarray(offset) };
}

function handleMessage(socket, state, text) {
  if (text === "PING") {
    sendText(socket, "PONG");
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  capture.trpcMessages.push({
    at: new Date().toISOString(),
    direction: "client->server",
    value: parsed,
  });
  writeCapture();

  const messages = Array.isArray(parsed) ? parsed : [parsed];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;

    if (message.method === "connectionParams") {
      continue;
    }

    if (message.method === "subscription") {
      state.subscriptionId = message.id;
      sendText(socket, { id: message.id, result: { type: "started" } });
      continue;
    }

    if (message.method === "mutation") {
      const trpcPath = message.params?.path;
      if (trpcPath === "vsCode.requestFullReview") {
        const payload = message.params?.input;
        capture.reviewPayloads.push({
          at: new Date().toISOString(),
          payload,
        });
        writeCapture();

        const reviewId = payload?.extensionEvent?.reviewId;
        setTimeout(() => {
          if (!state.subscriptionId) return;
          sendText(socket, {
            id: state.subscriptionId,
            result: {
              type: "data",
              data: {
                type: "review_status",
                reviewId,
                payload: {
                  reviewStatus: "reviewing",
                  reason: "mock server accepted review payload",
                },
              },
            },
          });
        }, 50);
        setTimeout(() => {
          if (!state.subscriptionId) return;
          sendText(socket, {
            id: state.subscriptionId,
            result: {
              type: "data",
              data: {
                type: "review_completed",
                reviewId,
                payload: {},
              },
            },
          });
        }, 100);
      }

      sendText(socket, { id: message.id, result: { type: "data", data: null } });
    }
  }
}

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  capture.ws.push({
    at: new Date().toISOString(),
    url: req.url,
    headers: redactHeaders(req.headers),
  });
  writeCapture();

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${wsAcceptKey(key)}`,
      "\r\n",
    ].join("\r\n"),
  );

  const state = { subscriptionId: null };
  let pending = Buffer.alloc(0);

  socket.on("data", (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    const decoded = decodeFrames(pending);
    pending = decoded.rest;
    for (const frame of decoded.frames) {
      if (frame.opcode === 0x8) {
        socket.end();
        return;
      }
      if (frame.opcode === 0x1) handleMessage(socket, state, frame.text);
    }
  });
});

process.on("SIGINT", () => {
  writeCapture();
  process.exit(0);
});

server.listen(port, "127.0.0.1", () => {
  writeCapture();
  console.log(`capture server listening on http://127.0.0.1:${port}`);
  console.log(`capture file: ${outFile}`);
});
