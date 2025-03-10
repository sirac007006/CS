import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import ejs from "ejs";
import session from "express-session";
import passport from "passport";
import SteamStrategy from "passport-steam";
import dotenv from "dotenv";

dotenv.config(); // Učitavanje .env fajla

const app = express();
const port = process.env.PORT || 3000;

const db = new pg.Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
});
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(express.json()); // Dodaj ovo odmah posle bodyParser middleware-a
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // Dodaj ovu liniju!


// Konfiguracija sesije
app.use(session({
    secret: "tajna_lozinka",
    resave: false,
    saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

// Passport serializacija/deserializacija korisnika
passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

// Steam strategija
passport.use(new SteamStrategy.Strategy({
    returnURL: process.env.CALLBACK_URL,
    realm: port,
    apiKey: process.env.STEAM_API_KEY
}, (identifier, profile, done) => {
    profile.identifier = identifier;
    return done(null, profile);
}));

// Steam login ruta
app.get("/auth/steam",
    passport.authenticate("steam", { failureRedirect: "/" }),
    (req, res) => {
        res.redirect("/");
    }
);

// Steam callback ruta
app.get("/auth/steam/return",
    passport.authenticate("steam", { failureRedirect: "/" }),
    (req, res) => {
        res.redirect("/profile");
    }
);

// Profilna stranica (prikaz korisničkih podataka)
app.get("/profile", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/");
    }
    res.render("profile.ejs", { user: req.user });
});

// Logout ruta
app.get("/logout", (req, res) => {
    req.logout(() => {});
    res.redirect("/");
});


let items = [];
let collections = [];
async function getItems() {
    const result = (await db.query("SELECT * FROM skins")).rows;
    return result;
}
async function getCharms() {
    const result = (await db.query("SELECT * FROM keychains")).rows;
    return result;
}

async function getCrates() {
    const result = (await db.query("SELECT * FROM crates")).rows;
    return result;
}

async function getSkins(category) {
    let firstLet = category[0].toUpperCase();
    let newCat = firstLet + category.substring(1);
    const query = `SELECT * FROM skins WHERE "category.name" = '${newCat}'`;
    const result = (await db.query(query)).rows;
    return result;
}
async function getMidTier() {
    const query = `SELECT * FROM skins WHERE "category.name" = 'Heavy' OR "category.name" = 'SMGs'`;
    const result = (await db.query(query)).rows;
    return result;
}
async function getCollections(){
    const collections = (await db.query("SELECT name from collections")).rows;
    return collections;
}

async function getItemsByCategory(category){
    const items = (await db.query("SELECT * FROM " + category)).rows;
    return items;
}
async function getWeaponCategory(){
    const wCategories = (await db.query('SELECT DISTINCT "weapon.name" FROM skins')).rows;
    return wCategories;
}
async function getFilterItem(type, weapon, rarity, collection, ss) {
    const columnCheckQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1
    `;
    const columns = (await db.query(columnCheckQuery, [type])).rows.map(row => row.column_name);

    if ((weapon && !columns.includes("weapon.name")) ||
        (rarity && !columns.includes("rarity.name")) ||
        (collection && !columns.includes("collections"))) {
        return [];
    }
    let query = `SELECT * FROM ${type} WHERE 1=1`;
    let values = [];
    let paramIndex = 1;

    if (weapon) {
        query += ` AND "weapon.name" = $${paramIndex++}`;
        values.push(weapon);
    }
    if (rarity) {
        query += ` AND "rarity.name" = $${paramIndex++}`;
        values.push(rarity);
    }
    if (collection) {
        query += ` AND CAST(collections AS TEXT) LIKE $${paramIndex++}`;
        values.push(`%${collection}%`);
    }
    if (columns.includes("souvenir") && columns.includes("stattrak")) {
        if (ss === "StatTrack") {
            query += ` AND souvenir = false AND stattrak = true`;
        } else if (ss === "Souvenir") {
            query += ` AND souvenir = true AND stattrak = false`;
        } else {
            query += ` AND souvenir = false AND stattrak = false`;
        }
    }

    const items = (await db.query(query, values)).rows;
    return items;
}




app.get("/", (req, res) => {
    res.render("homepage.ejs", { user: req.user });
});

app.get("/market", async (req, res) => {
    items = await getItems();
    let itemsLength = items.length;
    collections = await getCollections();
    let collectionsLength = collections.length;
    res.render("index.ejs", {
        items: items,
        length: itemsLength,
        collections:collections,
        collectionsLength:collectionsLength,
        user: req.user
    });
});
app.post("/filter", async (req, res) => {
    console.log("Full request body:", req.body); // Debug ispis

    let searchQuery = req.body.search || "";
    let collection = req.body.collection || "";
    let category = req.body.category || "skins"; // Podrazumevano pretražuje skins ako nije prosleđeno

    let category_name = '"category.name"'
    let tableName;
    switch (category) {
        case "agents":
            tableName = "agents WHERE";
            break;
        case "cases":
            tableName = "crates WHERE";
            break;
        case "rifles":
            tableName = "skins WHERE "+category_name+" IN ('Rifles') AND";
            break;
        case "knives":
            tableName = "skins WHERE "+category_name+" IN ('Knives') AND";
            break;
        case "pistols":
            tableName = "skins WHERE "+category_name+" IN ('Pistols') AND";
            break;
        case "keys":
            tableName = "keys WHERE";
            break;
        case "charms":
            tableName = "keychains WHERE"; 
            break;
        case "collections":
            tableName = "collections WHERE"; 
            break;
        case "graffiti":
            tableName = "graffiti WHERE"; 
            break;
        case "patches":
            tableName = "collectibles WHERE"; 
            break;
        case "stickers":
            tableName = "stickers WHERE"; 
            break;
        case "music_kits":
            tableName = "music_kits WHERE"; 
            break;
        case "mid-tier":
            tableName = "skins WHERE "+category_name+" IN ('Heavy', 'SMGs') AND"; 
            break;
        default:
            tableName = "skins WHERE"; 
    }

    let query = `SELECT * FROM ${tableName} (LOWER(name) LIKE LOWER($1) OR LOWER(id) LIKE LOWER($1))`;
    let params = [`%${searchQuery}%`];

    if (collection) {
        query += " AND CAST(collections AS TEXT) LIKE $2";
        params.push(`%${collection}%`);
    }

    try {
        console.log("Query:", query);
        console.log("Query params:", params);

        const result = await db.query(query, params);
        res.json({ items: result.rows });
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).json({ error: "Database error" });
    }
});


app.get("/database", async(req, res) => {
    items = await getItems();
    collections = await getCollections();
    let wCategories = await getWeaponCategory();
    let category = "skins";
    res.render("database.ejs", {
        category:category,
        items: items,
        collections:collections,
        user: req.user,
        wCategories: wCategories,
    });
})


app.get("/database/:category", async (req, res) => {
    let category = req.params.category; 
    let items;
    let collections = await getCollections();
    let wCategories = await getWeaponCategory();
    if(category === "knives" || category === "pistols" || category === "rifles"){
        items = await getSkins(category);
    }
    else if(category === "charms"){
        items = await getCharms();
    }
    else if(category === "mid-tier"){
        items = await getMidTier();
    }
    else if(category === "cases"){
        items = await getCrates();
    }
    else{
        items = await getItemsByCategory(category);
    }
    res.render("database.ejs", {
        category: category, 
        items: items,
        user: req.user,
        collections:collections,
        wCategories: wCategories
    });
});

app.post("/filterDatabase", async(req, res) => {
    let minPrice = req.body.minPrice;
    let maxPrice = req.body.maxPrice;
    let weapon = req.body.weapon;
    let rarity = req.body.rarity;
    let type = req.body.type;
    let collection = req.body.collection;
    let tag = req.body.tag;
    let category = req.params.category; 
    let collections = await getCollections();
    let wCategories = await getWeaponCategory();
    console.log(minPrice, maxPrice, weapon, rarity, type, collection, tag);
    let items = await getFilterItem(type, weapon, rarity, collection, tag);
    res.render("database.ejs", {
        category: category, 
        items: items,
        user: req.user,
        collections:collections,
        wCategories: wCategories
    });

})

app.listen(port, () => {
    console.log(`duvaj ga`);
});
