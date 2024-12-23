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

// Functions
function createEmptyArray(amount, fill) {
    return Array.from({length: amount}, () => fill)
}

// Classes
class Session {
    constructor(channel_name) {
        this.channel_name = channel_name

        this.started = false
        this.session = null
        this.amount = null
        this.voters = null
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

            if ((vote > 0 && vote <= amount) && (!this.voters.includes(user_id))) {
                this.voters.push(user_id)
                this.votes[vote - 1] += 1
            }
        })
        
        this.votes = createEmptyArray(amount, 0)
        this.amount = amount
        this.voters = []
        this.started = true
    }

    getVotes() {
        if (!this.started) {
            const empty = createEmptyArray(this.amount, 0)
            return JSON.stringify(empty)
        }
        
        return JSON.stringify(this.votes)
    }

    disconnect() {
        this.session.disconnect()
        this.started = false
    }
}

// App
const app = express()

app.get('/poll', (req, res) => {
    const channel_name = req.query.channel_name
    const amount = req.query.amount

    const session = new Session(channel_name)
    session.startPoll(amount)

    const uid = crypto.randomUUID()
    storage.setValue(uid, session, EXPIRY_TIME, () => {
        session.disconnect()
    })

    res.send(uid)
})

app.get('/poll/votes', (req, res) => {
    const uid = req.query.uid
    const session = storage.getValue(uid)

    if (session == null) {
        const empty = JSON.stringify([])
        res.send(empty)
    } else {
        const votes = session.getVotes()
        res.send(votes)
    }
})

app.get('/poll/disconnect', (req, res) => {
    const uid = req.query.uid
    storage.removeValue(uid)
    res.send(true)
})

app.listen(3000, () => {
    console.log('Server started')
    console.log('Hosting on port 3000')
})
