const SERVERS = process.env.SERVERS.split(';').map((server) => {
    const [ host, port ] = server.split(':')
    return { host, port }
})

const PORT = process.env.PORT || 8000

console.log('Servers:', SERVERS)

module.exports = {
    SERVERS,
    PORT
}