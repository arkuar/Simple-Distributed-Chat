const formEl = document.querySelector('#message-form')
const messageList = document.querySelector('#messages')
const ws = new WebSocket('ws://localhost:3000')

ws.addEventListener('open', () => {
    console.log('Opened connection')
})

ws.addEventListener('message', (event) => {
    console.log(`Received message ${event.data}`)
    const item = document.createElement('li')
    const autoScroll = messageList.scrollTop + messageList.clientHeight === messageList.scrollHeight

    item.appendChild(document.createTextNode(event.data))
    messageList.appendChild(item)

    if (autoScroll) {
        messageList.scrollTop = messageList.scrollHeight
    }
})

formEl.addEventListener('submit', (event) => {
    event.preventDefault()
    const message = event.target.elements[0].value
    event.target.elements[0].value = ""
    ws.send(message)
})

