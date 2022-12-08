const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express()
const port = process.env.PORT || 5000;

app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.17kmzzx.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect()
        const serviceCollection = client.db("machine_tools").collection("services");
        const BookingsCollection = client.db("machine_tools").collection("bookings");

        app.get('/tools', async (req, res) => {
            const tools = await serviceCollection.find({}).toArray()
            res.send(tools)
        })

        app.post('/bookings', async (req, res) => {
            const bookings = req.body;
            const query = { treatment: bookings.treatment, date: bookings.date, patient: bookings.patient }
            const exists = await BookingsCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, bookings: exists })
            }

            const result = await BookingsCollection.insertOne(bookings)
            return res.send({ success: true , result})
        })

        console.log('Database connected');
    }
    finally {
        // client.close()
    }
}

run().catch(console.dir)

app.get('/', async (req, res) => {
    res.send('MTF Server is Running')
})

app.listen(port, () => {
    console.log(`MTF listening from port ${port}`);
})