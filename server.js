const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const lib = require('./utils');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = 8080;

app.use(bodyParser.json());

// Key subscribers tracking
const keySubscribers = {};

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected');

    // Client subscribes to a key
    socket.on('subscribe', async (key) => {
        console.log(`Client subscribed to key: ${key}`);

        // Add socket to a room named with the key
        socket.join(key);

        // Track subscriptions
        if (!keySubscribers[key]) {
            keySubscribers[key] = 0;
        }
        keySubscribers[key]++;

        try {
            // Send current value to the newly connected client
            const value = await lib.view(key);
            socket.emit('value_update', value);
        } catch (err) {
            socket.emit('value_update', 'No value found');
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
        // Simple disconnect handling
    });
});

// Original routes
app.post('/add', async (req, res) => {
    try {
        const { key, value } = req.body;
        await lib.write(key, value);

        // Emit update to all subscribers of this key
        if (keySubscribers[key]) {
            io.to(key).emit('value_update', value);
        }

        res.send("Insert a new record successfully!");
    } catch (err) {
        res.send(err.toString());
    }
});

app.get('/get/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const value = await lib.view(id);
        res.status(200).send(value);
    } catch (err) {
        res.send(err);
    }
});

app.get('/viewer/:id', (req, res) => {
    res.sendFile(path.join(__dirname, "viewer.html"));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'viewer.html'));
});

// Use server.listen instead of app.listen for Socket.IO
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});