const express = require('express');
const router = express.Router();

router.post('/signup', (req, res) => {
    res.json({
        success: true,
        message: 'Signup route working'
    });
});

router.post('/login', (req, res) => {
    res.json({
        success: true,
        message: 'Login route working'
    });
});

module.exports = router;