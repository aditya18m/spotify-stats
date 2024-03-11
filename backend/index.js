require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
const path = require('path');   

const PORT = process.env.PORT || 3001;
const CLIENT_ID = process.env.CLIENT_ID;
const REDIRECT_URI = process.env.REDIRECT_URI;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../frontend/spotify-stats/templates'));
app.use(express.static(path.join(__dirname, '../frontend/spotify-stats')));


const session = require('express-session');

app.use(session({
    secret: 'your_secret_key_here', 
    resave: false,
    saveUninitialized: true,
    cookie: { secure: 'auto' } 
}));

const crypto = require('crypto');

function base64URLEncode(str) {
    return str.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest();
}

function generateCodeVerifier() {
    const verifier = base64URLEncode(crypto.randomBytes(32));
    return verifier;
}

function generateCodeChallenge(codeVerifier) {
    return base64URLEncode(sha256(codeVerifier));
}

app.use(express.static(path.join(__dirname, '../frontend/spotify-stats/templates')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/spotify-stats/templates/home.html'));
});


app.get('/auth', (req, res) => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    req.session.code_verifier = codeVerifier;

    const authUrl = `https://accounts.spotify.com/authorize?` +
        `client_id=${CLIENT_ID}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&code_challenge_method=S256` +
        `&code_challenge=${codeChallenge}` + 
        `&scope=${encodeURIComponent('user-read-private user-read-email user-top-read')}`;

    res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;
    const codeVerifier = req.session.code_verifier;

    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', null, {
            params: {
                client_id: CLIENT_ID,
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI,
                code_verifier: codeVerifier,
            },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const accessToken = response.data.access_token;
        const userInfoResponse = await axios.get('https://api.spotify.com/v1/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const displayName = userInfoResponse.data.display_name;
        res.render('success', { displayName, accessToken });
    } catch (error) {
        if (error.response && error.response.data) {
            console.error('Error exchanging authorization code:', error.response.data);
        } else {
            console.error('Error exchanging authorization code:', error.message);
        }
        res.status(500).send('Internal Server Error');
    }
});


async function getTopTracks(accessToken) {
    const timeRanges = { last4Weeks: 'short_term', last6Months: 'medium_term', allTime: 'long_term' };
    const topTracks = {};

    for (const [key, timeRange] of Object.entries(timeRanges)) {
        const response = await axios.get('https://api.spotify.com/v1/me/top/tracks', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            params: { limit: 10, time_range: timeRange }
        });
        topTracks[key] = response.data.items;
    }

    return topTracks;
}


async function getTopArtists(accessToken) {
    const timeRanges = { last4Weeks: 'short_term', last6Months: 'medium_term', allTime: 'long_term' };
    const topArtists = {};

    for (const [key, timeRange] of Object.entries(timeRanges)) {
        const response = await axios.get('https://api.spotify.com/v1/me/top/artists', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            params: { limit: 10, time_range: timeRange }
        });
        topArtists[key] = response.data.items;
    }

    return topArtists;
}


app.get('/api/topTracks', async (req, res) => {
    const accessToken = req.query.accessToken;
    const topTracks = await getTopTracks(accessToken);
    res.json(topTracks);
});

app.get('/api/topArtists', async (req, res) => {
    const accessToken = req.query.accessToken;
    const topArtists = await getTopArtists(accessToken);
    res.json(topArtists);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

app.get('/fetchTopTracks', async (req, res) => {
    const accessToken = req.query.accessToken;
    try {
        const topTracks = await getTopTracks(accessToken);
        res.render('topTracks', topTracks);
    } catch (error) {
        console.error('Error fetching top tracks:', error.message);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/fetchTopArtists', async (req, res) => {
    const accessToken = req.query.accessToken;
    try {
        const topArtists = await getTopArtists(accessToken);
        res.render('topArtists', topArtists);
    } catch (error) {
        console.error('Error fetching top artists:', error.message);
        res.status(500).send('Internal Server Error');
    }
});