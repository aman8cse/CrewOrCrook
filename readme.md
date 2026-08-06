# CrewOrCrook 🎮

A real-time multiplayer game backend built with Node.js, WebSockets, and Express. Inspired by the popular game Among Us, CrewOrCrook enables players to engage in social deduction gameplay with features like proximity-based actions, location tracking, and real-time game state management.

---

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Setup](#environment-setup)
  - [Running the Server](#running-the-server)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [WebSocket Events](#websocket-events)
- [Game Mechanics](#game-mechanics)
- [Database Models](#database-models)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [License](#license)

---

## ✨ Features

### Core Gameplay
- **Real-time Multiplayer**: WebSocket-based communication for instant player interactions
- **Social Deduction**: Players are assigned roles as either Crewmates or Impostors
- **Location-Based Mechanics**: GPS tracking with proximity-based kills and reports using Haversine distance calculations
- **Dynamic Game Phases**: Lobby → In-Game (Freeplay) → Meeting → Game End
- **Voting System**: Real-time voting during meeting phases with automatic winner resolution

### Technical Features
- **JWT Authentication**: Secure token-based authentication with refresh token support
- **Redis Caching**: Fast game state management and real-time updates
- **MongoDB Database**: Persistent storage for users, rooms, and players
- **Room Management**: Dynamic room creation with configurable player limits
- **Proximity Detection**: Kill and report mechanics based on real-world distance calculations
- **Cookie-based Sessions**: Secure refresh token storage using HTTP-only cookies

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| **Runtime** | Node.js |
| **Framework** | Express.js |
| **Real-time Communication** | Socket.IO |
| **Database** | MongoDB + Mongoose ODM |
| **Caching** | Redis |
| **Authentication** | JWT (jsonwebtoken) |
| **Encryption** | bcryptjs |
| **CORS** | express-cors |
| **Environment** | dotenv |

---

## 🏗️ Architecture

```
├── src/
│   ├── server.js                 # Main server entry point
│   ├── constants.js              # Game constants and configuration
│   ├── middleware/
│   │   ├── authMiddleware.js     # JWT verification
│   │   └── validateCode.js       # Room code validation
│   ├── routes/
│   │   ├── authRoutes.js         # Authentication endpoints
│   │   ├── roomRoutes.js         # Room management endpoints
│   │   └── refreshRoute.js       # Token refresh endpoint
│   ├── sockets/
│   │   ├── lobbySocket.js        # Lobby WebSocket handlers
│   │   └── gameSocket.js         # Game WebSocket handlers
│   ├── services/
│   │   ├── authService.js        # Authentication logic
│   │   ├── roomService.js        # Room management logic
│   │   └── gameStateService.js   # Game state and mechanics
│   ├── models/
│   │   ├── userModel.js          # User schema
│   │   ├── roomModel.js          # Room schema
│   │   └── playerModel.js        # Player schema
│   ├── utils/
│   │   ├── helper.js             # Utility functions
│   │   ├── token.js              # JWT token generation
│   │   ├── locationUtils.js      # GPS calculations
│   │   └── assignImposter.js     # Role assignment logic
│   └── redis/
│       └── redisClient.js        # Redis connection setup
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v14 or higher)
- **MongoDB** (local or cloud instance)
- **Redis** (local or cloud instance)
- **npm** or **yarn** package manager

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/aman8cse/CrewOrCrook.git
   cd CrewOrCrook
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

### Environment Setup

Create a `.env` file in the project root with the following variables:

```env
# Server Configuration
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:3000

# Database
MONGODB_URI=mongodb://localhost:27017/crewOrCrook
MONGODB_PASSWORD=your_password

# Authentication
JWT_SECRET=your_jwt_secret_key
JWT_REFRESH_SECRET=your_refresh_secret_key
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d

# Redis
REDIS_URL=redis://localhost:6379

# CORS
CORS_ORIGIN=http://localhost:3000
```

### Running the Server

```bash
# Development mode (with nodemon)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:5000`

---

## 📡 API Endpoints

### Authentication Routes (`/auth`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/register` | Register a new user | ❌ |
| POST | `/auth/login` | Login user | ❌ |
| POST | `/auth/setup` | Complete user setup profile | ✅ |

### Room Routes (`/room`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/room/available` | Get all available rooms | ✅ |
| POST | `/room/createNew` | Create a new room | ✅ |
| GET | `/room/:code/lookup` | Lookup room details | ✅ |

### Token Refresh Routes (`/reAuth`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/reAuth/refresh` | Refresh access token | ❌ |

### Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Server health check |
| GET | `/protected` | Protected route test | ✅ |

---

## 🎮 WebSocket Events

### Lobby Events

#### Client → Server
- `lobby:join-room` - Join an existing room
- `lobby:leave-room` - Leave current room
- `lobby:ready` - Mark player as ready

#### Server → Client
- `lobby:player-joined` - Broadcast when player joins
- `lobby:player-left` - Broadcast when player leaves
- `lobby:updated` - Room state update
- `lobby:error` - Error notification

### Game Events

#### Client → Server
- `game:start` - Host starts the game
- `game:move` - Player sends position update `{ roomCode, position: {lat, lng} }`
- `game:kill` - Impostor kills a crewmate `{ roomCode, victimId }`
- `game:report` - Report a dead body `{ roomCode, bodyUserId }`
- `game:vote` - Cast a vote during meeting `{ roomCode, votedUserId }`
- `game:task-complete` - Crewmate completes a task `{ roomCode }`

#### Server → Client
- `game:started` - Game has started
- `game:player-moved` - Broadcast player movement `{ userId, position }`
- `game:nearby-targets` - List of killable targets for impostor `{ targets }`
- `game:kill-event` - Broadcast kill action `{ killerId, victimId, position }`
- `game:meeting-called` - Meeting phase initiated
- `game:vote-result` - Voting results with eliminated player
- `game:ended` - Game conclusion `{ winner }`
- `game:error` - Error message

---

## 🎯 Game Mechanics

### Game States
- **Lobby**: Players join and prepare for the game
- **Started**: Game initialization in progress
- **In-Game**: Active gameplay with freeplay phase
- **Meeting**: Discussion and voting phase
- **Finished**: Game concluded

### Game Phases
- **Freeplay**: Crewmates complete tasks, impostors hunt
- **Meeting**: Players discuss and vote to eliminate suspects
- **Ended**: Game finished, results displayed

### Player Roles
- **Crewmate**: Complete assigned tasks, identify impostors, vote out impostor
- **Impostor**: Eliminate crewmates, deceive others, sabotage tasks

### Core Mechanics

#### Location-Based Actions
Uses **Haversine formula** for accurate real-world distance calculations:
- **Kill Range**: 8 meters (impostor can kill crewmates within range)
- **Report Range**: 8 meters (crewmates can report bodies within range)
- **Kill Cooldown**: 30 seconds between kills

#### Task Completion
- Crewmates must complete 5 free tasks when game starts
- Players can complete additional tasks during freeplay

#### Voting System
- During meetings, all players can vote to eliminate a suspect
- Player with most votes is eliminated
- Tie-breaking logic included

#### Win Conditions
- **Crewmates Win**: Complete all tasks OR eliminate all impostors
- **Impostor Wins**: Equal or outnumber crewmates

---

## 💾 Database Models

### User Model
```javascript
{
  username: String (unique),
  password: String (hashed),
  email: String,
  zealId: String,
  rollNo: String,
  section: String,
  avatar: String,
  createdAt: Date
}
```

### Room Model
```javascript
{
  code: String (unique),
  host: ObjectId (references User),
  players: [ObjectId] (references Player),
  state: String (LOBBY, STARTED, IN_GAME, MEETING, FINISHED),
  maxPlayers: Number,
  createdAt: Date,
  updatedAt: Date
}
```

### Player Model
```javascript
{
  userId: ObjectId (references User),
  roomId: ObjectId (references Room),
  socketId: String,
  role: String (CREWMATE, IMPOSTER),
  alive: Boolean,
  tasksCompleted: Number,
  createdAt: Date
}
```

---

## ⚙️ Configuration

### Game Configuration Constants (`src/constants.js`)

```javascript
GAME_CONFIG = {
  FREE_TASKS: 5,                    // Tasks assigned on game start
  MIN_PLAYERS: 2,                   // Minimum players to start
  KILL_RANGE_METRES: 8,             // Proximity distance for kills
  REPORT_RANGE_METRES: 8,           // Proximity distance for reports
  KILL_COOLDOWN_MS: 30_000,         // 30 seconds between kills
  MEETING_DURATION_MS: 120_000,     // 2 minutes meeting duration
}
```

---

## 🔒 Security Features

- **JWT Authentication**: Stateless authentication with secure tokens
- **Refresh Token Rotation**: HTTP-only cookie-based refresh tokens
- **Password Hashing**: Bcrypt with 10 salt rounds
- **CORS Configuration**: Configurable origin restrictions
- **Socket Authentication**: JWT validation on every WebSocket connection
- **Input Validation**: Room code and credential validation middleware

---

## 📦 Dependencies

See `package.json` for the complete list of dependencies. Key packages:

```json
{
  "dependencies": {
    "express": "^4.x",
    "socket.io": "^4.x",
    "mongoose": "^7.x",
    "jsonwebtoken": "^9.x",
    "bcryptjs": "^2.x",
    "redis": "^4.x",
    "cors": "^2.x",
    "dotenv": "^16.x"
  }
}
```

---

## 🤝 Contributing

Contributions are welcome! To contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is part of the GDG On Campus JSS community. See the LICENSE file for details.

---

## 📞 Support & Questions

For questions or issues, please open an issue on the GitHub repository or contact the maintainers.

---

## 🎓 Credits

Built as a multiplayer game backend project for independent deployment, testing, and feature experimentation. Forked from [GDG-OnCampus-JSS/CrewOrCrook](https://github.com/GDG-OnCampus-JSS/CrewOrCrook).

---

**Happy Gaming! 🚀**
