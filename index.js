const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express()
const port = process.env.PORT || 5000;

app.use(cors())
app.use(express.json())

app.get('/', async(req, res)=>{
    res.send('BTF Server is Running')
})

app.listen(port, ()=>{
    console.log(`BTF listening from port ${port}`);
})