const express = require('express')
const WebSocket = require('ws')
const app = express();
const port = 3000;

app.use(express.static('public'))

const server = app.listen(port, () => {
    console.log(`Application listening on port ${port}`)
})

const ws = new WebSocket.Server({ server })

/**
 * Broadcast message to all other clients connected to the server
 * @param {string} message
 */
function broadcast(message) {
    ws.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

ws.on('connection', (socket) => {
    console.log(`Client connected`)
    socket.isAlive = true

    socket.on('pong', () => { socket.isAlive = true })

    socket.on('message', (message) => {
        console.log(`Received message: ${message}`)
        broadcast(message);
    })

    socket.on('close', () => {
        console.log('Client disconnected')
    })
})
