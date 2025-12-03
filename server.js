const express = require('express');
const mqtt = require('mqtt');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

const usersFilePath = path.join(__dirname, 'users.json');

function loadUsers() {
    try {
        if (fs.existsSync(usersFilePath)) {
            const data = fs.readFileSync(usersFilePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Erreur lors de la lecture des utilisateurs:', err);
    }
    return {};
}

function saveUsers(users) {
    try {
        fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
    } catch (err) {
        console.error('Erreur lors de la sauvegarde des utilisateurs:', err);
    }
}

let users = loadUsers();

app.use(session({
    secret: 'radar-secret-key-123',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

app.use(express.json());

let lastMessages = [];
const maxMessages = 50;

let sseClients = [];

app.use(express.static('public'));

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (users[username]) {
        bcrypt.compare(password, users[username], (err, isMatch) => {
            if (err) {
                res.json({ success: false });
                return;
            }

            if (isMatch) {
                req.session.userId = username;
                req.session.username = username;
                res.json({ success: true });
            } else {
                res.json({ success: false });
            }
        });
    } else {
        res.json({ success: false });
    }
});

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        res.json({ success: false, message: "Nom d'utilisateur et mot de passe requis" });
        return;
    }

    if (users[username]) {
        res.json({ success: false, message: "Ce nom d'utilisateur existe déjà" });
        return;
    }

    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) {
            res.json({ success: false, message: 'Erreur serveur' });
            return;
        }

        users[username] = hashedPassword;
        saveUsers(users);

        res.json({ success: true, message: 'Compte créé avec succès' });
    });
});

app.get('/api/check-session', (req, res) => {
    if (req.session.userId) {
        res.json({ authenticated: true, username: req.session.username });
    } else {
        res.json({ authenticated: false });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            res.json({ success: false });
        } else {
            res.json({ success: true });
        }
    });
});

function checkAuth(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login.html');
    }
}

app.get('/accueil', checkAuth, (req, res) => {
    res.sendFile(__dirname + '/public/accueil.html');
});

app.get('/api/messages', checkAuth, (req, res) => {
    res.json(lastMessages);
});

app.get('/events', checkAuth, (req, res) => {
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
        } catch (e) {}
    });
});

app.listen(port, () => {
    console.log(`Serveur web lancé sur http://localhost:${port}`);
});