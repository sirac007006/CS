import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import ejs from "ejs";

const app = express();
const port = 3000;

const db = new pg.Client({
    user:"postgres",
    password: "marko123",
    host: "localhost",
    port: 5432,
    database: "CS"
});

app.use(bodyParser.urlencoded({extended:true}));
app.use(express.static("public"));

app.get("/", (req, res) =>{
    res.render("index.ejs");
});

app.listen(port, ()=>{
    console.log("Ide")
})