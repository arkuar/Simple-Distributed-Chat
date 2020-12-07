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

// Redis client for regular operations
const redisClient = redis.createClient({host: REDIS_HOST})

// Log path variables, initialized after server has started
let logPath

// Subscribe to messages so they can be broadcasted to all connected client sockets
subscriber.on('message', (channel, message) => {
    log(`Received message from channel ${channel}. Message content: ${message}`)
    // Handle special cases when user joins or leaves
    switch (channel) {
        case 'users:join':
            message = `${message} joined`
            break
        case 'users:leave':
            message = `${message} left`
            break
    }
    broadcast(message)
})

subscriber.on('error', redisError)
publisher.on('error', redisError)
redisClient.on('error', redisError)

subscriber.subscribe('chat:messages')
subscriber.subscribe('users:join')
subscriber.subscribe('users:leave')

app.use(express.static('public'))
app.use(express.json())

app.get('/ping', (req, res) => {
    res.send('pong')
})

app.post('/login', (req, res) => {
    const { userName } = req.body
    
    // Check if username is already taken
    redisClient.sismember('users', userName, (_, reply) => {
        if (reply) {
            log(`Username ${userName} already in use, denying login`)
            res.status(409).send({message: 'Username already in use'})
        } else {
            redisClient.sadd('users', userName)
            log(`Updating session for user ${userName}`)
            res.status(200).send({ userName, message: 'Login succesful' })
        }
    })
})

const server = app.listen(PORT, () => {
    logPath = `logs/${NAME}-${new Date().toISOString().replace(/(:|\.)/g, '')}.log`
    log(`Application listening on port ${PORT}`)
})

const wss = new WebSocket.Server({ noServer: true })

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
    fs.appendFile(logPath, `[${NAME}]\t${new Date().toISOString()}\t${message}\n`, (err) => {
        if (err) throw err
    })
    console.log(message)
}

/**
 * Broadcast message to all other clients connected to the server
 * @param {string} message
 */
function broadcast(message) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

/**
 * Establish websocket connection with the client
 */
server.on('upgrade', (request, socket, head) => {
    const [query, user] = request.url?.split('=')
    if (query !== '/?user' || !user) {
        socket.destroy(new Error('Username missing or it is invalid'))
        return
    }
    // Check if user is logged in
    redisClient.sismember('users', user, (err, reply) => {
        if (!reply) {
            socket.destroy(new Error('Login to use the websocket'))
            return
        }
        request.session = { user }
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request)
        })
    })
})

wss.on('connection', (socket, request) => {
    let { user } = request.session
    log(`User ${user} connected`)
    publisher.publish('users:join', user)

    socket.on('message', (message) => {
        log(`User ${user} sent message: ${message}`)
        publisher.publish('chat:messages', `${user}: ${message}`)
    })

    socket.on('close', () => {
        redisClient.srem('users', user) // Free username for use
        publisher.publish('users:leave', user)
        log(`User ${user} disconnected`)
    })
})
