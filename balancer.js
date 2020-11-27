const http = require('http')
const httpProxy = require('http-proxy')

const addresses = [
    {
        host: '127.0.0.1',
        port: 3000
    },
    {
        host: '127.0.0.1',
        port: 3001
    }
]

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

function log(msg, ...args) {
    if (args.length > 0) {
        console.log(`[Balancer] ${msg}`, args)
    } else {
        console.log(`[Balancer] ${msg}`)
    }
}

/**
 * Get next proxy with least connections
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
 * Increment target connection count
 */
function incrementConnections(target) {
    let count = connections.get(target) + 1
    connections.set(target, count)
}

/**
 * Decrement target connection count
 */
function decrementConnections(target) {
    let count = connections.get(target) - 1
    connections.set(target, count)
}

/**
 * Set target server to appear offline and reset the connection counter
 */
function disableServer(target) {
    // Update target weight to 0
    weights.set(target, 0)
    // Reset target connections to 0
    connections.set(target, 0)
}

/**
 * Check server status
 */
function heartbeat() {
    //TODO
}

const proxy = httpProxy.createProxyServer()

const server = http.createServer((req, res) => {
    const target = nextProxy()
    log(`Balancing request to ${target.host}:${target.port}`)
    
    incrementConnections(target)
    proxy.web(req, res, { target: target }, (error) => {
        // Update server status and return error to client
        disableServer(target)
        res.writeHead(500)
        res.end('Error when connecting to a server, please retry')
    })

    res.on('finish', () => decrementConnections(target))
})

server.on('upgrade', (req, socket, head) => {
    const target = nextProxy()
    proxy.ws(req, socket, head, { target: target }, (error) => {
        // Update server status and close the socket
        disableServer(target)
        socket.destroy(true)
    })
})

proxy.on('open', (proxySocket) => {
    // Find the connection that matches the socket
    const target = addresses.find((addr) => {
        return addr.host === proxySocket.remoteAddress
            && addr.port === proxySocket.remotePort
    })
    
    log(`Client connected to ${target.host}:${target.port}`)
    
    // Increment connection counter
    incrementConnections(target)

    // Add the target as a key to the socket so we can decrement the counter later
    proxySocket.key = target
})

proxy.on('close', (req, socket, head) => {
    const target = socket.key
    log(`Client disconnected from ${target.host}:${target.port}`)
    decrementConnections(target)
})

server.listen(8000)