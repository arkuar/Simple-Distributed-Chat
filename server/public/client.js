const formEl = document.querySelector('#message-form')
const messageList = document.querySelector('#messages')
const loginEl = document.querySelector('#login')
const chatEl = document.querySelector('#chat')
const errorEl = document.querySelector('#error')

const url = window.location.host
let ws
let user

function connect() {
    const socket = new WebSocket(`ws://${url}/?user=${user}`)

    socket.onopen = () => {
        console.log('Opened connection')
    }
    
    socket.onmessage = (event) => {
        console.log(`Received message ${event.data}`)
        showMessage(event.data)
    }
    
    socket.onclose = () => {
        console.log('Connection was closed, try reconnecting')
        setTimeout(() => {
            connect()
        }, 5000)
    }

    ws = socket
}

function showMessage(message) {
    const item = document.createElement('li')
    const autoScroll = messageList.scrollTop + messageList.clientHeight === messageList.scrollHeight
    item.appendChild(document.createTextNode(message))
    messageList.appendChild(item)
    if (autoScroll) {
        messageList.scrollTop = messageList.scrollHeight
    }
}

function handleLoginResponse(response) {
    return response.json().then(({ userName, message }) => {
        if(response.ok) {
            // Show chat and hide login view
            chatEl.style.display = 'block'
            loginEl.style.display = 'none'
            user = userName
            return message
        }
        throw new Error(message)
     })
}

function showError(error) {
    errorEl.style.display = 'block'
    errorEl.textContent = error.message
}

formEl.addEventListener('submit', (event) => {
    event.preventDefault()
    const message = event.target.elements[0].value
    event.target.elements[0].value = ""
    ws.send(message)
})

loginEl.addEventListener('submit', (event) => {
    event.preventDefault()
    const userName = event.target.elements[0].value
    fetch(`http://${url}/login`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userName })
        })
        .then(handleLoginResponse)
        .then(showMessage)
        .then(connect)
        .catch(showError)
})

chatEl.style.display = 'none'
