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

/**
 * Route for checking server availability
 */
app.get('/ping', (req, res) => {
    res.send('pong')
})

/**
 * Login route
 */
app.post('/login', (req, res) => {
    const { userName } = req.body
    
    // Check if username is already taken
    redisClient.sismember('users', `"${userName}"`, (_, reply) => {
        if (reply) {
            log(`Username ${userName} already in use, denying login`)
            res.status(409).send({message: 'Username already in use'})
        } else {
            redisClient.sadd('users', `"${userName}"`)
            log(`Updating session for user ${userName}`)
            res.status(200).send({ userName, message: 'Login succesful' })
        }
    })
})

/**
 * Create server and logfile
 */
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
 * Checks if given user is connected
 * @param {string} user 
 */
function checkUserConnection(user) {
    redisClient.sismember('connected', `"${user}"`, (err, connected) => {
        if (!connected) { 
            // Not connected, publish a message about said user joining and update connected set
            redisClient.sadd('connected', `"${user}"`)
            publisher.publish('users:join', user)
        }
    })
}
/**
 * Log connection close event and remove user from logged users set and connected users set
 * @param {string} user 
 */
function closeUserConnection(user) {
    redisClient.srem('users', `"${user}"`) // Free username for use
    redisClient.srem('connected', `"${user}"`) // Remove user from connected set
    publisher.publish('users:leave', user)
    log(`User ${user} disconnected`)
}

/**
 * Establish websocket connection with the client
 */
server.on('upgrade', (request, socket, head) => {
    try {
        const [query, user] = decodeURI(request.url).split('=')
        if (query !== '/?user' || !user) {
            throw new Error('Username missing or it is invalid')
        }
        // Check if user is logged in
        redisClient.sismember('users', `"${user}"`, (err, reply) => {
            if (!reply) {
                throw new Error('Login to use the websocket')
            }
            request.session = { user }
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request)
            })
        })
    } catch (err) {
        socket.destroy(err.message)
    }
})

/**
 * Handle websocket connection
 */
wss.on('connection', (socket, request) => {
    let { user } = request.session
    log(`User ${user} connected`)
    checkUserConnection(user)

    socket.on('message', (message) => {
        log(`User ${user} sent message: ${message}`)
        publisher.publish('chat:messages', `${user}: ${message}`)
    })

    socket.on('close', () => {
        closeUserConnection(user)
    })
})
