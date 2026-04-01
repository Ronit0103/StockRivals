import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  // Room state management (minimal, just to relay)
  const rooms = new Map();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join", ({ roomId, username, maxPlayers }) => {
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          hostId: socket.id,
          players: [],
          maxPlayers: maxPlayers || 10
        });
      }
      
      const room = rooms.get(roomId);
      if (room.players.length >= room.maxPlayers) {
        socket.emit("error_message", "Room is full");
        return;
      }

      socket.join(roomId);
      room.players.push({ id: socket.id, name: username });
      
      io.to(roomId).emit("lobby_update", {
        roomId,
        players: room.players,
        hostId: room.hostId,
        maxPlayers: room.maxPlayers
      });
    });

    socket.on("start_game", ({ roomId, initialState }) => {
      io.to(roomId).emit("start_game", initialState);
    });

    socket.on("action", ({ roomId, action }) => {
      const room = rooms.get(roomId);
      if (room) {
        io.to(room.hostId).emit("action_received", { playerId: socket.id, action });
      }
    });

    socket.on("state_update", ({ roomId, state }) => {
      io.to(roomId).emit("state_update", state);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      // Clean up rooms
      for (const [roomId, room] of rooms.entries()) {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          room.players.splice(playerIndex, 1);
          if (room.players.length === 0) {
            rooms.delete(roomId);
          } else {
            if (room.hostId === socket.id) {
              room.hostId = room.players[0].id;
            }
            io.to(roomId).emit("lobby_update", {
              players: room.players,
              hostId: room.hostId
            });
          }
        }
      }
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
