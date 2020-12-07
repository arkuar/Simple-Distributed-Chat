const axios = require('axios')
const fs = require('fs')
const http = require('http')
const httpProxy = require('http-proxy')
const config = require('./config')

// ENV variables
const PORT = config.PORT
const NAME = config.NAME

let logPath

/**
 * Addresses for the nodes
 */
const addresses = config.SERVERS

/**
 * Node weights
 * 
 * Weight 0 means that the node is offline
 */
const weights = new Map(addresses.map((address) => [address, 1]))

/**
 * Connections on each node
 */
const connections = new Map(addresses.map((address) => [address, 0]))

/**
 * Logger function that writes the message to a file and prints it to stdout
 */
function log(msg, ...args) {
    msg = `[${NAME}] ${msg}`
    if (args.length > 0) {
        console.log(`${msg}`, args)
    } else {
        console.log(`${msg}`)
    }
    fs.appendFile(logPath, `${new Date().toISOString()}\t${msg}\n`, (err) => {
        if(err) throw err
    })
}

/**
 * Get the next proxy with least connections
 */
function nextProxy() {
    for (m = 0; m < addresses.length; m++) {
        if (weights.get(addresses[m]) > 0) {
            for (i = m + 1; i < addresses.length; i++) {
                if (weights.get(addresses[i]) <= 0) {
                    continue
                }
                if (connections.get(addresses[i]) < connections.get(addresses[m])) {
                    m = i
                }
            }
            return addresses[m]
        }
    }
    return null
}

/**
 * Updates given target connection count
 * @param {*} target 
 * @param {number} num 
 */
function updateConnectionCount(target, num) {
    let count = connections.get(target) + num
    connections.set(target, count)
}

/**
 * Set target server to appear offline and reset the connection counter
 */
function setServerOffline(target) {
    // Update target weight to 0
    weights.set(target, 0)
    // Reset target connections to 0
    connections.set(target, 0)
}

function setServerOnline(target) {
    weights.set(target, 1)
}

/**
 * Check server statuses
 */
async function heartbeat() {
    try {
        const queries = await Promise.allSettled(addresses.map((addr) => axios.get(`http://${addr.host}:${addr.port}/ping`)))
        queries.forEach(({ status }, idx) => {
            const target = addresses[idx]

            if (status === 'fulfilled' && weights.get(target) === 0) {
                log(`Activating server ${target.host}:${target.port}`)
                setServerOnline(target)
            } else if (status === 'rejected' && weights.get(target) > 0) {
                log(`Disabling server ${target.host}:${target.port}`)
                setServerOffline(target)
            }
        })
    } catch (err) {
        log('Unexpected error during heartbeat operation', err)
    }   
}

const proxy = httpProxy.createProxyServer()

const server = http.createServer((req, res) => {
    const target = nextProxy()
    log(`Balancing request to ${target.host}:${target.port}`)
    
    updateConnectionCount(target, 1)
    proxy.web(req, res, { target: target }, (error) => {
        // Update server status and return error to client
        setServerOffline(target)
        res.writeHead(500)
        res.end('Error when connecting to a server, please retry')
    })

    res.on('finish', () => updateConnectionCount(target, -1))
})

/**
 * Forward websocket connection to target
 */
server.on('upgrade', (req, socket, head) => {
    const target = nextProxy()
    
    socket.on('close', (hadError) => {
        if (!hadError) {
            log(`Socket connection closed to ${target.host}:${target.port}`)
            updateConnectionCount(target, -1)
        }
    })

    socket.on('error', (err) => {
        log(`Error in socket connection to ${target.host}:${target.port}`, err)
        log('Updating server status')
        setServerOffline(target)
    })

    log('Creating socket connection to', target)
    updateConnectionCount(target, 1)
    
    proxy.ws(req, socket, head, { target: target }, (error) => {
        // Update server status and close the socket
        setServerOffline(target)
        socket.destroy(true)
    })
})

// Create interval for pinging the servers
const heartbeatInterval = setInterval(heartbeat, 10000)

/**
 * Create server and logfile
 */
server.listen(PORT, () => {
    logPath = `logs/${NAME}-${new Date().toISOString().replace(/(:|\.)/g, '')}.log`
    log(`Balancer listening on port ${PORT}`)
})

server.on('close', () => {
    clearInterval(heartbeatInterval)
})

