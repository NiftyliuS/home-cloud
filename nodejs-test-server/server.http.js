const express = require('express');
const app = express();
const port = 80;

app.get('/', (req, res) => {
    res.json({
        remoteAddress: req.ip,
        xForwardedFor: req.header('x-forwarded-for') || 'n/a',
        xRouterForwardedFor: req.header('x-router-forwarded-for')  || 'n/a'
    });
});

app.listen(port, () => {
    console.log(`Demo app listening at http://localhost:${port}`);
});