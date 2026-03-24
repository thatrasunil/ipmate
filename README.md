# 🎮 Elite Game Arena

A premium real-time multiplayer gaming platform featuring live chat, multiple games, and seamless player interactions. Experience the ultimate social gaming experience with beautiful glassmorphism UI and instant real-time gameplay.

## ✨ Features

- **Real-time Communication**: Live chat with typing indicators and message vanish-on-leave
- **Multiple Games**: 10+ premium games including Tic-Tac-Toe, Connect Four, Chess, Battleship, Hangman, Checkers, Othello, Memory Match, Dots & Boxes, and Rock Paper Scissors
- **Beautiful UI**: Modern glassmorphism design with animated backgrounds and smooth transitions
- **Real-time Gameplay**: Instant game state synchronization across all players
- **Room Management**: Secure room IDs with participant management
- **Responsive Design**: Optimized for desktop and mobile devices
- **Game Reset**: Reset any game at any time while maintaining connections

## 🎯 Games Available

- 🟡 **Tic-Tac-Toe** - Classic 3x3 grid strategy game
- 🔴 **Connect Four** - Drop pieces to connect four in a row
- ✂️ **Rock Paper Scissors** - Quick reaction game
- ♟️ **Chess** - Full chess board with piece movement
- 🚢 **Battleship** - Strategic naval combat
- 🎯 **Hangman** - Word guessing game
- ⚫ **Checkers** - Classic checkers board game
- 🔵 **Othello** - Reversi strategy game
- 🧠 **Memory Match** - Card matching memory game
- 📦 **Dots & Boxes** - Territory capture game

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Styling**: Modern CSS with glassmorphism effects
- **Real-time**: WebSocket communication via Socket.IO
- **Fonts**: Inter font family from Google Fonts
- **Icons**: Font Awesome 6

## 🚀 Run Locally

```bash
# Install dependencies
npm install

# Start the server
npm start
```

Open `http://localhost:3000` in multiple browser windows and join the same room ID to start playing!

## 🎮 How to Play

1. **Join a Room**: Enter your username and a room ID (or create one)
2. **Invite Friends**: Share the room ID with others to join
3. **Select a Game**: Choose from 10+ available games in the game selector
4. **Chat & Play**: Communicate in real-time while playing games
5. **Reset Anytime**: Use the reset button to start fresh

## 🔧 How Real-time Works

- **WebSocket Connections**: Instant bidirectional communication
- **Room-based Architecture**: Isolated game sessions per room
- **State Synchronization**: Automatic game state updates across all clients
- **Participant Management**: Dynamic join/leave handling with message cleanup
- **Typing Indicators**: Real-time typing status for better communication

## 📱 Responsive Design

- **Desktop**: Full-featured layout with sidebar and chat
- **Tablet**: Optimized grid layout
- **Mobile**: Touch-friendly interface with collapsible elements

## 🎨 UI Features

- **Glassmorphism**: Modern frosted glass effects
- **Animated Backgrounds**: Dynamic mesh gradients and floating elements
- **Smooth Transitions**: CSS animations for all interactions
- **Color-coded Games**: Visual distinction between game types
- **Status Indicators**: Connection status and game state displays

## 🔒 Security & Performance

- **Input Validation**: Sanitized user inputs and room IDs
- **Rate Limiting**: Built-in message and action throttling
- **Memory Management**: Efficient state storage and cleanup
- **Error Handling**: Graceful error recovery and user feedback

## 📝 Notes

- State is stored in memory only (resets on server restart)
- Each room supports up to 2 active participants
- Games automatically handle turn-based gameplay
- Chat messages vanish when participants leave
- All games include win/draw detection and reset functionality
