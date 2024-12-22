// Dependencies
const express = require('express')
const https = require('https')
const tmi = require('tmi.js')

// Constants
const EXPIRY_TIME = 120000

// Variables
const storage = (() => {
    const container = {}

    function setValue(key, value, expiryTime, disconnect) {
        container[key] = {
            value,
            time: Date.now() + expiryTime,
            disconnect
        }
    }

    function getValue(key) {
        if (!container[key]) return null

        if (Date.now() > container[key].time) {
            removeValue(key)
            return null
        }

        return container[key].value
    }

    function removeValue(key) {
        if (!container[key]) return null
        if (container[key].disconnect) container[key].disconnect()
        delete container[key]
    }

    return {
        setValue,
        getValue,
        removeValue
    }
})()

// Classes
class Session {
    constructor(channel_name) {
        this.channel_name = channel_name

        this.started = false
        this.session = null
        this.amount = null
        this.votes = null
    }

    startPoll(amount) {
        if (this.started == true) return

        this.session = new tmi.Client({
            connection: {
                secure: true,
                reconnect: true
            },
            channels: [this.channel_name]
        })
        this.session.connect()
        
        this.session.on('message', (channel, tags, message, self) => {
            if (self) return

            const user_id = tags['user-id']
            const vote = parseInt(message)

            if (vote > 0 && vote <= amount) {
                if (this.votes[vote - 1][user_id] != null) return
                this.votes[vote - 1][user_id] = true
            }
        })

        this.votes = []
        for (let i = 0; i < amount; i++) {
            this.votes[i] = {}
        }

        this.amount = amount
        this.started = true
    }

    getVotes() {
        let result = new Array(this.amount)
        result.fill(0)

        if (this.started == true) {
            for (let i = 0; i < this.amount; i++) {
                const votes = Object.keys(this.votes[i]).length
                result[i] = votes
            }
        }
        
        return JSON.stringify(result)
    }

    disconnect() {
        this.session.disconnect()
        this.started = false
    }
}

// Functions
function generate_id() {
    while (true) {
        const id = "id" + Math.random().toString(16).slice()
        const entry = storage.getValue(id)

        if (entry == null) {
            return id
        }
    }
}

// App
const app = express()

app.get('/poll', (req, res) => {
    const channel_name = req.query.channel_name
    const amount = req.query.amount
    
    const session = new Session(channel_name)
    session.startPoll(amount)

    const uid = generate_id()
    storage.setValue(uid, session, EXPIRY_TIME, (value) => {
        value.disconnect()
    })

    res.send(uid)
})

app.get('/poll/votes', (req, res) => {
    const uid = req.query.uid
    const session = storage.getValue(uid)

    if (session == null) {
        res.send(null)
    } else {
        const votes = session.getVotes()
        res.send(votes)
    }
})

app.get('/poll/disconnect', (req, res) => {
    const uid = req.query.uid
    storage.removeValue(uid)
})

app.listen(3000, () => {
    console.log('Server started')
    console.log('Hosting on port 3000')
})
