const express = require('express')
const WebSocket = require('ws')
const redis = require('redis')
const fs = require('fs')
const app = express();

// ENV variables
const PORT = process.env.PORT || 3000;
const REDIS_HOST = process.env.REDIS_HOST || 'localhost'
const NAME = process.env.NAME || 'server'

// Redis clients for pub/sub
const subscriber = redis.createClient({ host: REDIS_HOST })
const publisher = redis.createClient({ host: REDIS_HOST })

// Log path variables, initialized after server has started
let logPath

// Subscribe to messages so they can be broadcasted to all connected client sockets
subscriber.on('message', (channel, message) => {
    log(`Received message from channel ${channel}. Message content: ${message}`)
    broadcast(message)
})

subscriber.on('error', redisError)

publisher.on('error', redisError)

subscriber.subscribe('chat:messages')

app.use(express.static('public'))

app.get('/ping', (req, res) => {
    res.send('pong')
})

const server = app.listen(PORT, () => {
    logPath = `logs/${NAME}-${new Date().toISOString().replace(/(:|\.)/g, '')}.log`
    log(`Application listening on port ${PORT}`)
})

const ws = new WebSocket.Server({ server })

/**
 * Error handler for redis clients
 */
function redisError(error) {
    log(`Error with redis: ${error.message}`)
}

/**
 * Logger function that writes the message to file and prints it to stdout
 */
function log(message) {
    fs.appendFile(logPath, `${new Date().toISOString()}\t${message}\n`, (err) => {
        if (err) throw err
    })
    console.log(message)
}

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
        log(`Publishing message: ${message}`)
        publisher.publish('chat:messages', message)
    })

    socket.on('close', () => {
        log('Client disconnected')
    })
})
