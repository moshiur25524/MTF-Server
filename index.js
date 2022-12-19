const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const app = express()
const port = process.env.PORT || 5000;

app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.17kmzzx.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'unAuthorized access' })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.SECRET_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        console.log(decoded);
        req.decoded = decoded
        next()
    })

}

async function run() {
    try {
        await client.connect()
        const serviceCollection = client.db("machine_tools").collection("services");
        const BookingsCollection = client.db("machine_tools").collection("bookings");
        const userCollection = client.db('machine_tools').collection("users")
        const doctorCollection = client.db('machine_tools').collection("doctors")
        const paymentCollection = client.db('machine_tools').collection("payments")

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.role === 'admin') {
                next()
            }
            else {
                return res.status(403).send({ message: 'Forbidden' })
            }
        }

        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })
            res.send({ clientSecret: paymentIntent.client_secret })
        })

        app.get('/tools', async (req, res) => {
            const tools = await serviceCollection.find({}).project({ name: 1 }).toArray()
            res.send(tools)
        })

        app.get('/user', async (req, res) => {
            const users = await userCollection.find().toArray()
            res.send(users)
        })

        // app.delete('/user/:email',verifyJWT, verifyAdmin, async (req, res) => {
        //     const email = req.params.email;
        //     const result = await userCollection.deleteOne({ email: email })
        //     res.send(result)
        // })

        // Find a single admin 
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email })
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        // Create an admin
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updatedDoc = {
                $set: { role: "admin" },
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            return res.send(result)
        })

        // Generate a token for a registered user
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

        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors)
        })

        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body
            const result = await doctorCollection.insertOne(doctor)
            res.send(result)
        })

        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const result = await doctorCollection.deleteOne({ email: email })
            res.send(result)
        })

        // Get all the slots which is not yet booked
        app.get('/available', async (req, res) => {
            const date = req.query.date || 'Dec 10, 2022'
            const services = await serviceCollection.find().toArray()
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

        // Find all the bookings of a logged in users
        app.get('/bookings', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient }
                const bookings = await BookingsCollection.find(query).toArray()
                return res.send(bookings)
            }
            else {
                return res.status(403).send({ message: "forbidden access" })
            }
        })

        app.get('/booking/:id', verifyJWT, async (req, res) => {
            const { id } = req.params;
            const booking = await BookingsCollection.findOne({ _id: ObjectId(id) })
            res.send(booking)
        })

        // Post a booking instead of same treatment, date, patinet
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

        app.patch('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const payment = req.body;
            const updatedDoc = {
                $set:{
                    paid: true,
                    transactionId: payment.transactionId
                }
            }

            const result = await paymentCollection.insertOne(payment)
            const updatedBooking = await BookingsCollection.updateOne(filter, updatedDoc)
            res.send(updatedDoc)

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