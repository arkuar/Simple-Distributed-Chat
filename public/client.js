const formEl = document.querySelector('#message-form')
const messageList = document.querySelector('#messages')

let ws

function connect() {
    const socket = new WebSocket('ws://localhost:8000')

    socket.onopen = () => {
        console.log('Opened connection')
    }
    
    socket.onmessage = (event) => {
        console.log(`Received message ${event.data}`)
        const item = document.createElement('li')
        const autoScroll = messageList.scrollTop + messageList.clientHeight === messageList.scrollHeight
    
        item.appendChild(document.createTextNode(event.data))
        messageList.appendChild(item)
    
        if (autoScroll) {
            messageList.scrollTop = messageList.scrollHeight
        }
    }
    
    socket.onclose = () => {
        console.log('Connection was closed, try reconnecting')
        setTimeout(() => {
            ws = connect()
        }, 5000)
    }

    return socket
}

formEl.addEventListener('submit', (event) => {
    event.preventDefault()
    const message = event.target.elements[0].value
    event.target.elements[0].value = ""
    ws.send(message)
})

ws = connect()

