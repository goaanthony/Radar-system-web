const express = require('express');
const mqtt = require('mqtt');

const app = express();
const port = 3000;

let lastMessages = [];
const maxMessages = 50;

let sseClients = [];

app.use(express.static('public'));

app.get('/accueil', (req, res) => {
    res.sendFile(__dirname + '/public/accueil.html');
});

app.get('/api/messages', (req, res) => {
    res.json(lastMessages);
});

app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders();

    res.write(': connected\n\n');

    sseClients.push(res);

    req.on('close', () => {
        sseClients = sseClients.filter(r => r !== res);
    });
});

const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
    username: 'Antho' 
});

client.on('connect', () => {
    console.log('Connecté au broker MQTT');

    client.subscribe('RadarB2Ynov', (err) => {
        if (!err) console.log('Abonné au topic RadarB2Ynov');
        else console.error('Erreur d\'abonnement :', err);
    });
});

client.on('message', (topic, message) => {
    const messageString = message.toString();
    console.log(`Message reçu sur ${topic}: ${messageString}`);
    
    let parsedMessage;
    try {
        parsedMessage = JSON.parse(messageString);
    } catch (e) {
        parsedMessage = { raw: messageString };
    }
    
    const messageData = {
        topic: topic,
        message: parsedMessage,
        timestamp: new Date().toLocaleTimeString('fr-FR'),
        raw: messageString
    };
    
    lastMessages.unshift(messageData);
    
    if (lastMessages.length > maxMessages) {
        lastMessages.pop();
    }

    const payload = JSON.stringify(messageData);
    sseClients.forEach((res) => {
        try {
            res.write(`data: ${payload}\n\n`);
        } catch (e) {
        }
    });
});


app.listen(port, () => {
    console.log(`Serveur web lancé sur http://localhost:${port}`);
});