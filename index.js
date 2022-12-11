const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
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
        const userCollection = client.db('machine_tools').collection("users")

        app.get('/tools', async (req, res) => {
            const tools = await serviceCollection.find({}).toArray()
            res.send(tools)
        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const updatedDoc = {
                $set: user
            }
            const options = { upsert: true };
            const token = jwt.sign({ email: email }, process.env.SECRET_TOKEN, {
                expiresIn: '1d'
            });
            const result = await userCollection.updateOne(filter, updatedDoc, options);
            res.send({ result, token })
        })

        app.get('/available', async (req, res) => {
            const date = req.query.date || 'Dec 10, 2022'

            //  get the all services
            const services = await serviceCollection.find().toArray()

            // get the all bookings of that date
            const query = { date: date };
            const bookings = await BookingsCollection.find(query).toArray()

            // for each service, find bookings for that service
            services.forEach(service => {
                const serviceBookings = bookings.filter(b => b.treatment === service.name);
                const booked = serviceBookings.map(s => s.slot);
                // service.booked = serviceBookings.map(s => s.slot);
                const available = service.slots.filter(s => !booked.includes(s))
                service.slots = available
            })

            res.send(services)
        })

        app.get('/bookings', async (req, res) => {
            const patient = req.query.patient;
            console.log(patient);
            const query = { patient: patient }
            const bookings = await BookingsCollection.find(query).toArray()
            res.send(bookings)
        })

        app.post('/bookings', async (req, res) => {
            const bookings = req.body;
            const query = { treatment: bookings.treatment, date: bookings.date, patient: bookings.patient }
            const exists = await BookingsCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, bookings: exists })
            }

            const result = await BookingsCollection.insertOne(bookings)
            return res.send({ success: true, result })
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