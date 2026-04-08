import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = parseInt(process.env.PORT || "3000");

  // Room state management (minimal, just to relay)
  const rooms = new Map();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join", ({ roomId, username, maxPlayers, playerId }) => {
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          hostId: socket.id,
          hostPlayerId: playerId,
          players: [],
          maxPlayers: maxPlayers || 10
        });
      }
      
      const room = rooms.get(roomId);
      const existingPlayer = room.players.find(p => p.playerId === playerId);

      if (existingPlayer) {
        // Reconnection
        existingPlayer.id = socket.id;
        existingPlayer.name = username || existingPlayer.name;
        socket.join(roomId);
        
        // If they were host, update hostId to new socket.id
        if (room.hostPlayerId === playerId) {
          room.hostId = socket.id;
        }
      } else {
        // New join
        if (room.players.length >= room.maxPlayers) {
          socket.emit("error_message", "Room is full");
          return;
        }
        socket.join(roomId);
        room.players.push({ id: socket.id, playerId, name: username });
      }
      
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
      // We don't immediately remove players to allow reconnection.
      // We only clean up if the room becomes completely empty or after a long timeout.
      // For this simple implementation, we'll just leave them in the room.
      // A more robust version would mark them as 'offline'.
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      res.sendFile(indexPath, (err) => {
        if (err) {
          res.status(500).send("Build artifacts not found. Please run 'npm run build' first.");
        }
      });
    });
  }

  // Health check route
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", mode: process.env.NODE_ENV || 'development' });
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

startServer();
