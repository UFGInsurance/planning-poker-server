const http = require("http");
const { Server } = require("socket.io");
const { v4 } = require("uuid");

const server = http.createServer();
const io = new Server(server);

const PORT = process.env.PORT || 3000;

class Room {
  constructor({ owner, participants = [], flipped = false }) {
    this.flipped = flipped;
    this.owner = owner;
    this.participants = participants;

    this.reset = this.reset.bind(this);
    this.getState = this.getState.bind(this);
  }

  reset() {
    this.flipped = false;
    this.participants = this.participants.map(
      (participant) => new Participant({ ...participant, estimate: "" })
    );
  }

  getState() {
    if (this.flipped) {
      return {
        owner: this.owner,
        participants: this.participants
      }
    }

    //mask unflipped cards
    return {
      owner: this.owner,
      participants: this.participants.map(participant => ({...participant, estimate: "X"}))
    };
  }
}

class Participant {
  constructor({ id, username, estimate = "" }) {
    this.id = id;
    this.username = username;
    this.estimate = estimate;
  }
}

let rooms = {};
const planningPoker = io.of("/planning-poker");

planningPoker.on("connection", (socket) => {
  socket.use((packet, next) => {
    const [ event ] = packet;

    const room = Object.entries(rooms).find(([roomKey, room]) =>
      room.participants.some(participant => participant.id === socket.id)
    );

    if (event !== "join" && room) {
      next();
    } else if (event === "join") {
      next();
    } else {
      console.error("Invalid action: user is not in a room.");
    }
  });

  socket.on("get_rooms", () => {
    socket.emit("get_rooms", rooms);
  });

  socket.on("join", ({ id, username }) => {
    // register user to room
    const room = id || v4();
    socket.join(room);

    //register new room with owner
    if (!rooms[room]) {
      rooms[room] = new Room({ owner: username });
    }

    // add participant to participant pool
    rooms[room].participants.push(new Participant({ id: socket.id, username }));

    // push new state to participants
    planningPoker.in(room).emit("state", rooms[room].getState());
  });

  socket.on("set_estimate", (estimate) => {
    //find room
    const [key, room] = Object.entries(rooms).find(([roomKey, room]) =>
      room.participants.some(participant => participant.id === socket.id)
    ) || [];

    if (!room) {
      console.error("Failed to update: user needs to join a room");
      return;
    }

    if (room.flipped) {
      // return error?
      console.error("Failed to update: could not update estimate at this time");
      return;
    }

    //set sender estimate
    room.participants.map(participant => {
      if (participant.id === socket.id) {
        participant.estimate = estimate;
      }

      return participant;
    })

    // push new state to participants
    planningPoker.in(key).emit("state", room.getState())
  });

  socket.on("flip_cards", () => {
    const [key, room] = Object.entries(rooms).find(([roomKey, room]) =>
      room.participants.some(participant => participant.id === socket.id)
    );

    const client = room.participants.find(participant => participant.id === socket.id);

    if (client.username === room.owner) {
      room.flipped = true;
      planningPoker.in(key).emit("state", room.getState())
    } else {
      // emit error "Unauthorized action"?
      // do nothing?
      console.error("Failed to update: client not authorized for this action");
    }
  });

  socket.on("reset_cards", () => {
    // find room with participant
    const [key, room] = Object.entries(rooms).find(([roomKey, room]) =>
      room.participants.some(participant => participant.id === socket.id)
    );
    const client = room.participants.find(participant => participant.id === socket.id);

    // identify owner status
    if (client.username === room.owner) {
      // reset room
      room.reset();

      // push new state to participants
      planningPoker.in(key).emit("state", room.getState())
    }
  });

  socket.on("disconnect", () => {
    const roomsToNotify = [];

    // filter out disconnected participant and empty rooms
    const newRoomsState = Object.entries(rooms) // get room key,value pairs
      .map(([roomKey, room]) => {
        // filter out the disconnected socket from any rooms joined
        const filteredParticipants = room.participants.filter(
          (participant) => participant.id !== socket.id
        );

        const newRoomState = [
          roomKey,
          new Room({ ...room, participants: filteredParticipants }), // this is needed to not mutate the state but also preserve an instance of Room
        ];

        // list the updated rooms
        if (room.participants.length !== filteredParticipants.length) {
          roomsToNotify.push(roomKey);
        }

        return newRoomState;
      })
      .filter(([key, room]) => room.participants.length) // remove empty rooms
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {}); // reduce the entries array back to an object format

    // update rooms
    rooms = newRoomsState;

    roomsToNotify.forEach((roomKey) => {
      planningPoker.in(roomKey).emit("state", rooms[roomKey]?.getState()); // state is a tuple
    });
  });
});

server.listen(PORT, () => {
  console.log("listening on port " + PORT);
});
