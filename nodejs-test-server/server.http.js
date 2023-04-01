const express = require('express');
const app = express();
const port = 80;

app.get('/', (req, res) => {
    res.json({
        remoteAddress: req.ip,
    });
});

app.listen(port, () => {
    console.log(`Demo app listening at http://localhost:${port}`);
});