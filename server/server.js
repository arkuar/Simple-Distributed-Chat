const express = require('express')
const WebSocket = require('ws')
const redis = require('redis')
const app = express();
const PORT = process.env.PORT || 3000;
const REDIS_HOST = process.env.REDIS_HOST || 'localhost'

const subscriber = redis.createClient({ host: REDIS_HOST })
const publisher = redis.createClient({ host: REDIS_HOST })

subscriber.on('message', (channel, message) => {
    console.log(`Received message from channel ${channel}. Message content: ${message}`)
    broadcast(message)
})

app.use(express.static('public'))

app.get('/ping', (req, res) => {
    res.send('pong')
})

const server = app.listen(PORT, () => {
    console.log(`Application listening on port ${PORT}`)
})

subscriber.subscribe('chat:messages')

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
        console.log(`Publishing message: ${message}`)
        // broadcast(message);
        publisher.publish('chat:messages', message)
    })

    socket.on('close', () => {
        console.log('Client disconnected')
    })
})
