const express = require("express");
const axios = require("axios");
const nunjucks = require("nunjucks");

const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");

const nano = require("./nano.js");
const mongo = require("./database.js");

let db = mongo.getDb();
let collection;
//collection.find({}).forEach(console.dir)
db.then((db) => {
  collection = db.collection("collection");
});

nunjucks.configure("templates", { autoescape: true });

async function insert(addr, value) {
  await collection.insertOne({ address: addr, value: value });
}

async function replace(addr, newvalue) {
  await collection.replaceOne(
    { address: addr },
    { address: addr, value: newvalue }
  );
}

async function find(addr) {
  return await collection.findOne({ address: addr });
}

async function count(query) {
  return await collection.count(query);
}

const app = express();

app.use(express.static("files"));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(cookieParser());

const claim_freq = 86400000;

let ip_cache = {};
function clearCache() {
  ip_cache = {};
}
setInterval(clearCache, claim_freq * 1.3);

let nano_ip_cache = {};
function nanoclearCache() {
  nano_ip_cache = {};
}
setInterval(nanoclearCache, claim_freq * 1.3);

//If I am on break this is true. Reduces faucet payouts to 0.02
const on_break = false;
//If this is true, logs info
const logging = false;
//If this is true, no unopened accounts can claim
const no_unopened = false;

const faucet_addr_nano =
  "nano_179x6acabhx7s69xdox885uon3t4jwjaytobqdmx3xhrmm63ieoaayokbr47";

const nano_blacklist = [
  "nano_1or7xscday8pm91zjfnh5bsmsgo9t1rnci9ekopiuyfcmk3noa9oueo8zoeb",
  "nano_17ka7phdc5za7be4xmawjhsyoubogmunkc5fkp91sztdiqbcpoiaps984xe1",
  "nano_1s6aa835kgr6g57zy1nhig9i7p4hkuije1r4k875qtstbari9gxyn3izs6kc",
  "nano_17qmowxc9h6fkj6bm94b4rqkwwws9knyh6kueadnf4dk7upm5etpogmd5dj8"
];

app.get("/", async function (req, res) {
  return res.send(nunjucks.render("nano.html", {}));
});

app.post("/", async function (req, res) {
  //return res.send(nunjucks.render('nano.html', {error: "Faucet currently under upgrade and maintenance, come back later", success: false}));
  let address = req.body["addr"];

  let current_bal = await nano.check_bal(faucet_addr_nano);
  let amount = 0.0002;

  if (await nano.is_unopened(address)) {
    amount = 0.00005;
    if (no_unopened) {
      return res.send(
        nunjucks.render("nano.html", {
          error: "Faucet is under attack, unopened addresses cannot claim.",
          success: false
        })
      );
    }
  }

  let ip = req.header("x-forwarded-for").slice(0, 14);
  if (nano_ip_cache[ip]) {
    nano_ip_cache[ip] = nano_ip_cache[ip] + 1;
    if (nano_ip_cache[ip] > 2) {
      return res.send(
        nunjucks.render("nano.html", { error: "Too many claims from this IP" })
      );
    }
  } else {
    nano_ip_cache[ip] = 1;
  }

  if (logging) {
    console.log(address);
    console.log(req.header("x-forwarded-for"));
  }

  if (req.cookies["nano_last_claim"]) {
    if (Number(req.cookies["nano_last_claim"]) + claim_freq > Date.now()) {
      return res.send(
        nunjucks.render("nano.html", {
          error: "Last claim too soon.",
          success: false
        })
      );
    }
  }

  let account_history = await nano.get_account_history(address);
  if (
    nano.address_related_to_blacklist(account_history, nano_blacklist) ||
    nano_blacklist.includes(address)
  ) {
    return res.send(
      nunjucks.render("nano.html", {
        error:
          "This address is blacklisted because it is cheating and farming faucets (or sent money to an address participating in cheating and farming).",
        success: false
      })
    );
  }

  let token = req.body["h-captcha-response"];
  let params = new URLSearchParams();
  params.append("response", token);
  params.append("secret", process.env.secret);
  let captcha_resp = await axios.post(
    "https://hcaptcha.com/siteverify",
    params
  );
  captcha_resp = captcha_resp.data;

  if (!captcha_resp["success"]) {
    return res.send(
      nunjucks.render("nano.html", { error: "Captcha failed", success: false })
    );
  }

  let valid = await nano.is_valid(address);

  if (!valid) {
    return res.send(
      nunjucks.render("nano.html", {
        error: "Invalid address.",
        success: false
      })
    );
  }

  let dry = await nano.faucet_dry();

  if (dry) {
    return res.send(
      nunjucks.render("nano.html", { error: "Faucet dry", success: false })
    );
  }

  let db_result = await find(address);
  if (db_result) {
    db_result = db_result["value"];
    if (Number(db_result) + claim_freq < Date.now()) {
      //send nanos
      let send = await nano.send_nano(address, amount);
      if (send == false) {
        return res.send(
          nunjucks.render("nano.html", { error: "Send failed", success: false })
        );
      }
      res.cookie("nano_last_claim", String(Date.now()));
      await replace(address, String(Date.now()));
      return res.send(
        nunjucks.render("nano.html", { error: false, success: true })
      );
    } else {
      return res.send(
        nunjucks.render("nano.html", {
          error: "Last claim too soon",
          success: false
        })
      );
    }
  }

  let send = await nano.send_nano(address, amount);
  if (send == false) {
    return res.send(
      nunjucks.render("nano.html", { error: "Send failed", success: false })
    );
  }
  res.cookie("nano_last_claim", String(Date.now()));
  await insert(address, String(Date.now()));
  return res.send(
    nunjucks.render("nano.html", { error: false, success: true })
  );
});

app.listen(8081, async () => {
  //nano receive deposits is expensive, avoid doing
  await nano.receive_deposits();
  console.log(`App on`);
});
